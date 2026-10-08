import { TelemetryEventSchema, type TelemetryEvent } from "@myriad/shared";
import { getDeviceId } from "./device";

type Context = Pick<
  TelemetryEvent,
  "examId" | "identityKind" | "studentId" | "problemId" | "mode" | "operationId"
>;
type Measurement = Pick<
  TelemetryEvent,
  "kind" | "outcome" | "startedAt" | "durationMs"
> &
  Partial<
    Pick<
      TelemetryEvent,
      | "attemptId"
      | "testIndex"
      | "engineDurationMs"
      | "executionDurationMs"
      | "cacheHit"
      | "bytes"
      | "transferBytes"
      | "cache"
      | "resource"
      | "termination"
      | "exitCode"
    >
  >;
export type Recorder = (measurement: Measurement) => void;
let sessionId: string | undefined;
const queue: TelemetryEvent[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let sending = false;
let failures = 0;
const observedResources = new Set<string>();

function schedule() {
  if (!timer && queue.length)
    timer = setTimeout(
      () => {
        timer = undefined;
        void flushTelemetry();
      },
      failures ? 5000 : 2000,
    );
}

/** Bounded, idempotent delivery; telemetry failure never blocks judging. */
export async function flushTelemetry(): Promise<void> {
  if (sending || !queue.length) return;
  sending = true;
  const batch: TelemetryEvent[] = [];
  for (const event of queue.slice(0, 25)) {
    if (
      new TextEncoder().encode(JSON.stringify({ events: [...batch, event] }))
        .byteLength >
      24 * 1024
    )
      break;
    batch.push(event);
  }
  try {
    const res = await fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
      keepalive: true,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Telemetry upload failed (${res.status})`);
    queue.splice(0, batch.length);
    failures = 0;
  } catch (error) {
    failures++;
    console.warn("Browser telemetry delivery failed", error);
    if (failures >= 3) {
      queue.splice(0, batch.length);
      failures = 0;
      console.warn("Dropped telemetry batch after three failed attempts");
    }
  } finally {
    sending = false;
    schedule();
  }
}

export async function createRecorder(
  context: Omit<Context, "operationId"> & { operationId?: string },
): Promise<Recorder> {
  try {
    const deviceId = await getDeviceId();
    sessionId ??= crypto.randomUUID();
    const identity = {
      ...context,
      deviceId,
      sessionId,
      operationId: context.operationId ?? crypto.randomUUID(),
    };
    return (measurement) => {
      const parsed = TelemetryEventSchema.safeParse({
        ...identity,
        ...measurement,
        id: crypto.randomUUID(),
      });
      if (!parsed.success) {
        console.warn(
          "Invalid browser telemetry measurement",
          parsed.error.issues,
        );
        return;
      }
      if (queue.length >= 250) {
        console.warn("Browser telemetry queue full; dropping new measurement");
        return;
      }
      queue.push(parsed.data);
      schedule();
    };
  } catch (error) {
    console.warn("Browser telemetry unavailable", error);
    return () => {};
  }
}

export async function measure<T>(
  record: Recorder,
  kind: TelemetryEvent["kind"],
  action: () => Promise<T>,
  details: (value: T) => Partial<Measurement> = () => ({}),
): Promise<T> {
  const startedAt = Date.now();
  const start = performance.now();
  try {
    const value = await action();
    record({
      kind,
      outcome: "ok",
      startedAt,
      durationMs: performance.now() - start,
      ...details(value),
    });
    return value;
  } catch (error) {
    record({
      kind,
      outcome: "error",
      startedAt,
      durationMs: performance.now() - start,
    });
    throw error;
  }
}

/** Resource Timing sees the main window only; worker-internal requests are not inferred. */
export function observeResources(record: Recorder): () => void {
  if (
    typeof PerformanceObserver === "undefined" ||
    !PerformanceObserver.supportedEntryTypes.includes("resource")
  )
    return () => {};
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as PerformanceResourceTiming[]) {
      const url = new URL(entry.name);
      if (url.origin !== location.origin) continue;
      const resource = url.pathname.startsWith("/toolchains/")
        ? "toolchain"
        : url.pathname.startsWith("/assets/")
          ? "asset"
          : null;
      if (!resource) continue;
      const key = `${entry.name}:${entry.startTime}`;
      if (observedResources.has(key)) continue;
      observedResources.add(key);
      record({
        kind: "resource_download",
        outcome: !entry.responseStatus
          ? "unknown"
          : entry.responseStatus >= 400
            ? "error"
            : "ok",
        resource,
        startedAt: Math.round(performance.timeOrigin + entry.startTime),
        durationMs: entry.duration,
        bytes: entry.decodedBodySize,
        transferBytes: entry.transferSize,
        cache: entry.transferSize > 0 ? "network" : "unknown",
      });
    }
  });
  observer.observe({ type: "resource", buffered: true });
  const flush = () => {
    void flushTelemetry();
  };
  window.addEventListener("pagehide", flush);
  return () => {
    observer.disconnect();
    window.removeEventListener("pagehide", flush);
    flush();
  };
}
