import { measure, type Recorder } from "./telemetry";
import { updateStatus } from "./engine-status";
import { reportError, track } from "./posthog";
export { onEngineStatus, type EngineStatus } from "./engine-status";
import { createBrowserEngine, type Engine } from "@wasm-oj/browser";
import { browserSource as clangSource } from "@wasm-oj/toolchain-clang";
import {
  createRunConfig,
  classifyTermination,
  innerDigest,
  boundChecksum,
  type ProblemLimits,
  type ProblemPublic,
  type TestClaim,
} from "@myriad/shared";

let engineInstance: Engine | null = null;
let engineInitPromise: Promise<Engine> | null = null;

export async function getEngine(record: Recorder): Promise<Engine> {
  if (engineInstance) return engineInstance;
  if (engineInitPromise) return engineInitPromise;

  updateStatus({ state: "downloading", message: "Loading compiler..." });

  engineInitPromise = (async () => {
    const start = performance.now();
    try {
      const toolchainBase = "/toolchains/";
      const engine = await measure(record, "engine_init", () =>
        createBrowserEngine({
          toolchains: [clangSource(toolchainBase)],
          artifactCache: true,
        }),
      );

      engineInstance = engine;
      updateStatus({ state: "ready", message: "Ready" });
      track("engine_ready", { duration_ms: performance.now() - start });
      return engine;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      updateStatus({
        state: "error",
        message: `Failed to load compiler: ${msg}`,
      });
      engineInitPromise = null;
      reportError(err, { action: "engine_init" });
      throw err;
    }
  })();

  return engineInitPromise;
}

export interface CompileResult {
  success: boolean;
  artifact?: any;
  diagnostics: string;
  stdout: string;
  stderr: string;
}

export async function compileCode(
  code: string,
  record: Recorder,
): Promise<CompileResult> {
  const engine = await getEngine(record);

  const build = await measure(
    record,
    "compile",
    () =>
      engine.compile({
        language: "c",
        target: "wasip1",
        optimization: "release",
        entry: "main.c",
        files: { "main.c": code },
      }),
    (build) => ({
      outcome: build.success && build.artifact ? "ok" : "error",
      cacheHit: build.cacheHit,
    }),
  );

  const diagText = (build.diagnostics ?? [])
    .map(
      (d: any) =>
        `${d.severity.toUpperCase()}: ${d.message}${d.location ? ` at line ${d.location.line}` : ""}`,
    )
    .join("\n");

  return {
    success: build.success && !!build.artifact,
    artifact: build.artifact,
    diagnostics: diagText,
    stdout: build.stdout || "",
    stderr: build.stderr || "",
  };
}

export interface RunLocalOutput {
  stdout: string;
  stderr: string;
  durationMs: number;
  cost?: number | null;
  termination: string;
  code: number;
}

export async function runLocal(
  artifact: any,
  stdin: string,
  limits: ProblemLimits,
  record: Recorder,
): Promise<RunLocalOutput> {
  const engine = await getEngine(record);
  const config = createRunConfig(limits, stdin);
  const result = await measure(
    record,
    "run",
    () => engine.run(artifact, config),
    (result) => ({
      outcome:
        classifyTermination(result.termination, result.code) === "ok"
          ? "ok"
          : "error",
      engineDurationMs: result.durationMs,
      executionDurationMs: result.executionDurationMs,
      termination: result.termination,
      exitCode: result.code,
    }),
  );

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    cost: result.metrics?.cost ?? result.metrics?.rawCost ?? null,
    termination: result.termination,
    code: result.code,
  };
}

// In-memory cache for testcase inputs, plus downloads still in flight so a
// prefetched test is never requested twice.
const inputCache = new Map<string, string>();
const inputDownloads = new Map<string, Promise<string>>();
const inputKey = (
  examId: string,
  version: string,
  problemId: string,
  index: number,
) => JSON.stringify([examId, version, problemId, index]);

function downloadTestInput(
  examId: string,
  version: string,
  problemId: string,
  index: number,
  preview: boolean,
): Promise<string> {
  const key = inputKey(examId, version, problemId, index);
  let pending = inputDownloads.get(key);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(
        `/api/exams/${encodeURIComponent(examId)}/problems/${encodeURIComponent(problemId)}/versions/${version}/tests/${index}${preview ? "?preview=1" : ""}`,
      );
      if (!res.ok) throw new Error(`測資下載失敗 (${res.status})`);
      const text = await res.text();
      inputCache.set(key, text);
      return text;
    })().finally(() => inputDownloads.delete(key));
    inputDownloads.set(key, pending);
  }
  return pending;
}

/**
 * Starts downloading tests ahead of the runner, a few at a time, so network
 * round trips overlap with running earlier tests. Failures are left for
 * fetchTestInput to retry and report.
 */
export function prefetchTestInputs(
  examId: string,
  version: string,
  problemId: string,
  indices: number[],
  preview = false,
  concurrency = 6,
): void {
  const queue = indices.filter(
    (index) => !inputCache.has(inputKey(examId, version, problemId, index)),
  );
  const next = (): Promise<void> | undefined => {
    const index = queue.shift();
    if (index === undefined) return;
    return downloadTestInput(examId, version, problemId, index, preview)
      .catch(() => {})
      .then(next);
  };
  for (let i = 0; i < concurrency; i++) next();
}

export async function fetchTestInput(
  examId: string,
  version: string,
  problemId: string,
  index: number,
  record: Recorder,
  preview = false,
): Promise<string> {
  const key = inputKey(examId, version, problemId, index);
  const cached = inputCache.get(key);
  const inflight = cached === undefined && inputDownloads.has(key);
  return measure(
    (event) => record({ ...event, testIndex: index }),
    "input_download",
    async () =>
      cached ?? downloadTestInput(examId, version, problemId, index, preview),
    (text) => ({
      bytes: new TextEncoder().encode(text).byteLength,
      cache:
        cached !== undefined ? "memory" : inflight ? "prefetch" : "unknown",
    }),
  );
}

export interface StreamJudgeOptions {
  record: Recorder;
  artifact: any;
  problem: ProblemPublic;
  studentId: string;
  identityKind: "guest" | "nycu";
  deviceId: string;
  code: string;
  examId: string;
  /** The problem version the student's copy was judged against. */
  problemVersion: string;
  operationId: string;
  /** A teacher preview: judged normally, never counted as student work. */
  preview?: boolean;
  onVerdict: (verdict: { index: number; status: string }) => void;
  onProgress: (current: number, total: number) => void;
  onSemantic?: () => void;
  onTerminal?: (result: import("@myriad/shared").AttemptSummary) => void;
  onComplete: (result: import("@myriad/shared").AttemptSummary) => void;
}
export async function streamJudgeSubmission(
  options: StreamJudgeOptions,
): Promise<void> {
  const { api, ApiError, SubmissionRejected } = await import("./api");
  type Summary = import("@myriad/shared").AttemptSummary;
  const base = `/api/exams/${options.examId}/attempts`,
    query = options.preview ? "?preview=1" : "";
  const startedAt = Date.now(),
    start = performance.now();
  let completed = false;
  let attemptId: string | undefined;
  try {
    const created = await api<{ attempt: Summary; token: string }>(
      `${base}${query}`,
      "POST",
      {
        operationId: options.operationId,
        problemVersion: options.problemVersion,
        problemId: options.problem.id,
        studentId: options.studentId,
        identityKind: options.identityKind,
        deviceId: options.deviceId,
        code: options.code,
      },
    ).catch((error: unknown) => {
      // A 4xx answer means no attempt exists; only transport failures stay pending.
      if (
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500
      )
        throw new SubmissionRejected(
          error.status === 429
            ? "兩次提交需間隔 5 秒，請稍候再提交。"
            : error.status === 409
              ? "題目的測資已更新，已重新載入題目，請確認後再提交。"
              : error.status === 403
                ? "目前無法提交：考試尚未開始或已結束。"
                : error.message,
          error.status,
        );
      throw error;
    });
    attemptId = created.attempt.id;
    for (let retry = 0; retry < 3; retry++) {
      const current = await api<Summary>(
        `${base}/${created.attempt.id}${query}`,
      );
      if (current.status === "complete") {
        completed = true;
        options.onComplete(current);
        return;
      }
      if (current.status !== "running") {
        options.onTerminal?.(current);
        throw new Error(
          `提交已${current.status === "expired" ? "逾時" : "失敗"}`,
        );
      }
      try {
        const result = await new Promise<Summary>((resolve, reject) => {
          const ws = new WebSocket(
            `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${base}/${created.attempt.id}/ws${query}`,
          );
          let work: Promise<void> | undefined,
            settled = false;
          let timeout = setTimeout(() => ws.close(), 10000);
          const done = (error?: Error, result?: Summary) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            ws.close();
            if (error) reject(error);
            else resolve(result!);
          };
          ws.onopen = () =>
            ws.send(JSON.stringify({ type: "auth", token: created.token }));
          ws.onmessage = (event) => {
            let msg;
            try {
              msg = JSON.parse(event.data);
            } catch {
              done(new Error("判題回應格式錯誤"));
              return;
            }
            if (msg.attempt?.status === "complete") {
              done(undefined, msg.attempt);
              return;
            }
            if (msg.attempt && msg.attempt.status !== "running") {
              options.onTerminal?.(msg.attempt);
              done(new Error(`提交狀態：${msg.attempt.status}`));
              return;
            }
            if (msg.type === "error") {
              done(new Error(msg.error));
              return;
            }
            if (msg.type === "semantic") {
              options.onSemantic?.();
              clearTimeout(timeout);
              timeout = setTimeout(() => ws.close(), 40000);
            }
            if (msg.type === "verdict") options.onVerdict(msg.verdict);
            if (msg.type === "ready" && !work) {
              clearTimeout(timeout);
              work = (async () => {
                const engine = await getEngine(options.record);
                const received = new Set<number>(
                  msg.attempt.verdicts.map((v: { index: number }) => v.index),
                );
                prefetchTestInputs(
                  options.examId,
                  options.problemVersion,
                  options.problem.id,
                  Array.from(
                    { length: options.problem.testCount },
                    (_, index) => index,
                  ).filter((index) => !received.has(index)),
                  options.preview,
                );
                for (const v of msg.attempt.verdicts) options.onVerdict(v);
                for (
                  let index = 0;
                  index < options.problem.testCount;
                  index++
                ) {
                  if (settled || ws.readyState !== WebSocket.OPEN) return;
                  if (received.has(index)) continue;
                  options.onProgress(index + 1, options.problem.testCount);
                  const input = await fetchTestInput(
                    options.examId,
                    options.problemVersion,
                    options.problem.id,
                    index,
                    options.record,
                    options.preview,
                  );
                  const result = await measure(
                    (event) => options.record({ ...event, testIndex: index }),
                    "run",
                    () =>
                      engine.run(
                        options.artifact,
                        createRunConfig(options.problem.limits, input),
                      ),
                    (r) => ({
                      outcome:
                        classifyTermination(r.termination, r.code) === "ok"
                          ? "ok"
                          : "error",
                      engineDurationMs: r.durationMs,
                      executionDurationMs: r.executionDurationMs,
                      termination: r.termination,
                      exitCode: r.code,
                    }),
                  );
                  const term = classifyTermination(
                    result.termination,
                    result.code,
                  );
                  const claim: TestClaim =
                    term === "ok"
                      ? {
                          index,
                          status: "ok",
                          checksum: await boundChecksum({
                            salt: msg.salt,
                            studentId: options.studentId,
                            problemId: options.problem.id,
                            index,
                            innerDigest: await innerDigest(
                              result.stdout,
                              options.problem.normalize,
                            ),
                          }),
                        }
                      : { index, status: term };
                  if (settled || ws.readyState !== WebSocket.OPEN) return;
                  ws.send(
                    JSON.stringify({
                      type: "claim",
                      claim: {
                        ...claim,
                        metrics: {
                          inputBytes: new TextEncoder().encode(input)
                            .byteLength,
                          instructionCost: result.metrics.cost,
                          memoryBytes: result.metrics.memoryBytes,
                          costProfile: result.metrics.costProfile,
                          costModel: result.metrics.costModel,
                        },
                      },
                    }),
                  );
                }
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: "finish" }));
                  timeout = setTimeout(() => ws.close(), 40000);
                }
              })().catch((error) => done(error));
            }
          };
          ws.onclose = async () => {
            await work;
            done(new Error("連線中斷；已保留提交，可繼續傳送"));
          };
          ws.onerror = () => ws.close();
        });
        completed = true;
        options.onComplete(result);
        return;
      } catch (error) {
        if (retry === 2) throw error;
      }
    }
  } finally {
    options.record({
      kind: "submission",
      outcome: completed ? "ok" : "error",
      startedAt,
      durationMs: performance.now() - start,
      attemptId,
    });
  }
}
