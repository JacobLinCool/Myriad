import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("../src/lib/device", () => ({
  getDeviceId: async () => "b3e286f7-394f-4203-bf48-b7022e70e074",
}));
const context = {
  examId: "exam",
  studentId: "a",
    identityKind: "guest",
  problemId: "p",
  mode: "local" as const,
};
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps operation identity fixed, records failures, and retries the same event IDs", async () => {
  const { createRecorder, measure, flushTelemetry } =
    await import("../src/lib/telemetry");
  const request = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", request);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const initial = { ...context };
  const record = await createRecorder(initial);
  initial.studentId = "b";
  await expect(
    measure(record, "compile", async () => {
      throw new Error("compile failed");
    }),
  ).rejects.toThrow("compile failed");
  await flushTelemetry();
  await flushTelemetry();
  const first = JSON.parse(request.mock.calls[0][1].body);
  const retry = JSON.parse(request.mock.calls[1][1].body);
  expect(retry).toEqual(first);
  expect(first.events[0]).toMatchObject({
    studentId: "a",
    identityKind: "guest",
    kind: "compile",
    outcome: "error",
  });
  await flushTelemetry();
  expect(request).toHaveBeenCalledTimes(2);
});

it("caps queued events and drops a repeatedly failed batch without blocking measurement", async () => {
  const { createRecorder, flushTelemetry } =
    await import("../src/lib/telemetry");
  const request = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", request);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const record = await createRecorder(context);
  for (let i = 0; i < 251; i++)
    record({ kind: "compile", outcome: "ok", startedAt: 1000, durationMs: 1 });
  expect(warn).toHaveBeenCalledWith(
    "Browser telemetry queue full; dropping new measurement",
  );
  for (let i = 0; i < 4; i++) await flushTelemetry();
  const ids = request.mock.calls.map(
    (call) => JSON.parse(call[1].body).events[0].id,
  );
  expect(ids[0]).toBe(ids[2]);
  expect(ids[3]).not.toBe(ids[0]);
});

it("observes only same-origin assets without reporting hidden cache or worker timings", async () => {
  const { observeResources } = await import("../src/lib/telemetry");
  let callback: (list: { getEntries: () => object[] }) => void;
  const disconnect = vi.fn();
  vi.stubGlobal(
    "PerformanceObserver",
    class {
      static supportedEntryTypes = ["resource"];
      constructor(cb: typeof callback) {
        callback = cb;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  vi.stubGlobal("location", { origin: "https://judge.test" });
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const record = vi.fn();
  const stop = observeResources(record);
  const base = {
    startTime: 10,
    duration: 20,
    decodedBodySize: 100,
    transferSize: 0,
    responseStatus: 0,
  };
  callback!({
    getEntries: () => [
      { ...base, name: "https://judge.test/toolchains/compiler.wasm" },
      { ...base, name: "https://judge.test/api/telemetry" },
      { ...base, name: "https://other.test/assets/private" },
    ],
  });
  expect(record).toHaveBeenCalledTimes(1);
  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "resource_download",
      outcome: "unknown",
      cache: "unknown",
      bytes: 100,
    }),
  );
  expect(record.mock.calls[0][0]).not.toHaveProperty("name");
  stop();
  expect(disconnect).toHaveBeenCalled();
});
