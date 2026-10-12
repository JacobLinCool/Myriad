import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEFAULT_LIMITS } from "@myriad/shared";
const engine = vi.hoisted(() => ({ compile: vi.fn(), run: vi.fn() }));
vi.mock("@wasm-oj/browser", () => ({
  createBrowserEngine: async () => engine,
}));
vi.mock("@wasm-oj/toolchain-clang", () => ({ browserSource: () => ({}) }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllGlobals());

it("captures compilation failures, cache hits, and distinct engine/elapsed execution times", async () => {
  const { compileCode, runLocal } = await import("../src/lib/engine");
  const record = vi.fn();
  engine.compile.mockResolvedValueOnce({
    success: false,
    cacheHit: false,
    diagnostics: [],
  });
  expect((await compileCode("invalid", record)).success).toBe(false);
  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "compile",
      outcome: "error",
      cacheHit: false,
    }),
  );
  engine.compile.mockResolvedValueOnce({
    success: true,
    artifact: {},
    cacheHit: true,
    diagnostics: [],
  });
  await compileCode("valid", record);
  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({ kind: "compile", cacheHit: true }),
  );
  engine.run.mockResolvedValue({
    durationMs: 123,
    executionDurationMs: 100,
    termination: "exited",
    code: 0,
    stdout: "",
    stderr: "",
  });
  await runLocal({}, "", DEFAULT_LIMITS, record);
  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({
      kind: "run",
      engineDurationMs: 123,
      executionDurationMs: 100,
      durationMs: expect.any(Number),
    }),
  );
});

it("measures full input reads and cache hits, keeps exams separate, and records failed test indices", async () => {
  const { fetchTestInput } = await import("../src/lib/engine");
  const record = vi.fn();
  const request = vi.fn().mockResolvedValue(new Response("abc"));
  vi.stubGlobal("fetch", request);
  await fetchTestInput("a", "revision", "p", 0, record);
  await fetchTestInput("a", "revision", "p", 0, record);
  expect(request).toHaveBeenCalledTimes(1);
  expect(record).toHaveBeenLastCalledWith(
    expect.objectContaining({ cache: "memory", bytes: 3, testIndex: 0 }),
  );
  request.mockResolvedValueOnce(new Response("xyz"));
  await fetchTestInput("b", "revision", "p", 0, record);
  expect(request).toHaveBeenCalledTimes(2);
  request.mockResolvedValueOnce(new Response("", { status: 500 }));
  await expect(
    fetchTestInput("a", "revision", "p", 1, record),
  ).rejects.toThrow();
  expect(record).toHaveBeenLastCalledWith(
    expect.objectContaining({ outcome: "error", testIndex: 1 }),
  );
});

it("queries a saved completion after a lost finish acknowledgement without creating another attempt", async () => {
  const { streamJudgeSubmission } = await import("../src/lib/engine");
  const record = vi.fn(),
    onComplete = vi.fn();
  const running = {
    id: "attempt-1",
    examId: "exam-a",
    revision: "revision",
    problemId: "p",
    studentId: "S1",
    identityKind: "guest",
    status: "running",
    createdAt: 1,
    verdicts: [{ index: 0, status: "AC" }],
    groupsPassed: 0,
    groupsTotal: 1,
    score: 0,
  };
  let saved = false;
  class Socket {
    static OPEN = 1;
    readyState = 1;
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onclose?: () => void;
    constructor() {
      queueMicrotask(() => this.onopen?.());
    }
    send(data: string) {
      const message = JSON.parse(data);
      if (message.type === "auth")
        queueMicrotask(() =>
          this.onmessage?.({
            data: JSON.stringify({
              type: "ready",
              salt: "test-salt",
              attempt: running,
            }),
          }),
        );
      if (message.type === "claim")
        expect(message.claim.metrics).toEqual({
          inputBytes: 4,
          instructionCost: 17,
          memoryBytes: 65536,
          costProfile: "test",
          costModel: "test",
        });
      if (message.type === "finish") {
        saved = true;
        this.close();
      }
    }
    close() {
      if (this.readyState !== 1) return;
      this.readyState = 3;
      queueMicrotask(() => this.onclose?.());
    }
  }
  vi.stubGlobal("WebSocket", Socket);
  vi.stubGlobal("location", { protocol: "https:", host: "judge.test" });
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (options?.method === "POST")
      return Response.json({ attempt: running, token: "write-token" });
    if (url.endsWith("/attempt-1"))
      return Response.json({
        ...running,
        status: saved ? "complete" : "running",
        score: saved ? 1 : 0,
      });
    if (url.endsWith("/tests/1")) return new Response("1 2\n");
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetcher);
  engine.run.mockResolvedValue({
    termination: "exited",
    code: 0,
    stdout: "3\n",
    durationMs: 1,
    metrics: {
      cost: 17,
      memoryBytes: 65536,
      costProfile: "test",
      costModel: "test",
    },
  });
  await streamJudgeSubmission({
    record,
    artifact: {},
    code: "snapshot",
    examId: "exam-a",
    revision: "revision",
    operationId: "operation-1",
    studentId: "S1",
    identityKind: "guest",
    deviceId: "device-1",
    problem: {
      id: "p",
      title: "P",
      order: 0,
      statementMd: "",
      normalize: "trim",
      limits: DEFAULT_LIMITS,
      testCount: 2,
      groups: [{ name: "all", tests: [0, 1] }],
      sampleCases: [],
    },
    onComplete,
    onProgress: vi.fn(),
    onVerdict: vi.fn(),
  });
  expect(engine.run).toHaveBeenCalledTimes(1);
  expect(
    fetcher.mock.calls.filter(([, options]) => options?.method === "POST"),
  ).toHaveLength(1);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(onComplete).toHaveBeenCalledWith(
    expect.objectContaining({ status: "complete" }),
  );
  expect(record).toHaveBeenLastCalledWith(
    expect.objectContaining({
      kind: "submission",
      attemptId: "attempt-1",
      outcome: "ok",
    }),
  );
});

it("prefetches tests a few at a time and never downloads one twice", async () => {
  const { prefetchTestInputs, fetchTestInput } =
    await import("../src/lib/engine");
  let active = 0,
    peak = 0;
  const fetch = vi.fn(async (url: string) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active--;
    return new Response(`input ${url.split("/").pop()}`);
  });
  vi.stubGlobal("fetch", fetch);
  const record = vi.fn();
  const indices = Array.from({ length: 20 }, (_, index) => index);
  prefetchTestInputs("exam", "v1", "p", indices, false, 6);
  for (const index of indices)
    expect(await fetchTestInput("exam", "v1", "p", index, record)).toBe(
      `input ${index}`,
    );
  expect(fetch).toHaveBeenCalledTimes(20);
  expect(peak).toBeGreaterThan(1);
  expect(peak).toBeLessThanOrEqual(6);
  const sources = record.mock.calls
    .map(([event]) => event)
    .filter((event) => event.kind === "input_download")
    .map((event) => event.cache);
  expect(sources).toHaveLength(20);
  expect(sources.every((source) => source !== "unknown")).toBe(true);
  // Kept in memory for the next submission.
  await fetchTestInput("exam", "v1", "p", 3, record);
  expect(fetch).toHaveBeenCalledTimes(20);
});
