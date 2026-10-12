// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { api } from "../src/lib/api";
import { StudentSession } from "../src/lib/state/student.svelte";
import { parseRoute } from "../src/lib/state/routes";
import { Drafts, codeTemplate } from "../src/lib/state/drafts";
import {
  compileCode,
  runLocal,
  streamJudgeSubmission,
} from "../src/lib/engine";
import { SubmissionRejected } from "../src/lib/api";
vi.mock("../src/lib/engine", () => ({
  onEngineStatus: () => () => {},
  getEngine: vi.fn(),
  compileCode: vi.fn(),
  runLocal: vi.fn(),
  streamJudgeSubmission: vi.fn(),
}));
vi.mock("../src/lib/device", () => ({
  getDeviceId: async () => "00000000-0000-4000-8000-000000000000",
}));
vi.mock("../src/lib/telemetry", () => ({
  createRecorder: vi.fn(async () => ({})),
  observeResources: () => () => {},
}));
function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { resolve, reject, promise };
}
const exam = (id: string) => ({
  id,
  title: id,
  serverTime: Date.now(),
  startsAt: Date.now() - 10000,
  endsAt: Date.now() + 60000,
  problems: [
    {
      id: "same",
      title: "same",
      limits: {},
      sampleCases: [],
      statementMd: "",
      version: "c".repeat(64),
    },
  ],
  revision: "rev",
  policy: "best",
  status: "active",
  rules: "",
});
const sessions: StudentSession[] = [];
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/exams");
  vi.clearAllMocks();
});
afterEach(() => {
  sessions.splice(0).forEach((s) => s.destroy());
});
function session(request: typeof api) {
  const s = new StudentSession(request);
  sessions.push(s);
  return s;
}
it("draft keys isolate identity, exam and problem including reload", () => {
  const drafts = new Drafts(localStorage);
  drafts.open("one", "a", "same");
  drafts.save("first");
  expect(drafts.open("two", "a", "same")).toBe(codeTemplate);
  drafts.save("second");
  expect(drafts.open("one", "b", "same")).toBe(codeTemplate);
  expect(new Drafts(localStorage).open("one", "a", "same")).toBe("first");
  expect(drafts.open("two", "a", "same")).toBe("second");
});
it("stale navigation success and failure cannot replace the current exam", async () => {
  const a = deferred<unknown>(),
    b = deferred<unknown>();
  const request = vi.fn((url: string) =>
    url.endsWith("/a") ? a.promise : b.promise,
  );
  const s = session(request as typeof api);
  const first = s.navigate("/exams/a"),
    second = s.navigate("/exams/b");
  b.resolve(exam("b"));
  await second;
  a.reject(new Error("old failure"));
  await first;
  expect(s.exam?.id).toBe("b");
  expect(s.error).toBe("");
  expect(s.loading).toBe(false);
});
it("identity changes save the previous document and restore the right draft", async () => {
  const s = session(
    vi.fn(async (url: string) =>
      url.includes("/submissions")
        ? { submissions: [], hasMore: false, nextCursor: 0 }
        : exam("a"),
    ) as typeof api,
  );
  s.studentInput = "one";
  s.identity();
  await s.navigate("/exams/a/problems/same");
  s.code = "one code";
  s.studentInput = "two";
  s.identity();
  expect(s.code).toBe(codeTemplate);
  s.code = "two code";
  s.studentInput = "one";
  s.identity();
  expect(s.code).toBe("one code");
});
it("slow execution keeps its source and suppresses output after identity changes", async () => {
  const compile = deferred<unknown>();
  vi.mocked(compileCode).mockReturnValue(
    compile.promise as ReturnType<typeof compileCode>,
  );
  vi.mocked(runLocal).mockResolvedValue({
    stdout: "old output",
    stderr: "",
    code: 0,
    termination: "exit",
    durationMs: 1,
  } as Awaited<ReturnType<typeof runLocal>>);
  const s = session(
    vi.fn(async (url: string) =>
      url.includes("/submissions")
        ? { submissions: [], hasMore: false, nextCursor: 0 }
        : exam("a"),
    ) as typeof api,
  );
  s.studentInput = "one";
  s.identity();
  await s.navigate("/exams/a/problems/same");
  s.code = "snapshot";
  const operation = s.run();
  await Promise.resolve();
  s.studentInput = "two";
  s.identity();
  compile.resolve({ success: true, artifact: {} });
  await operation;
  expect(compileCode).toHaveBeenCalledWith("snapshot", expect.anything());
  expect(s.output).toBe("");
  expect(s.busy).toBe(false);
});
it("routes reject extra segments and distinguish duplicate problem ids by exam", () => {
  expect(parseRoute("/exams/a/problems/same").examId).toBe("a");
  expect(parseRoute("/exams/b/problems/same").examId).toBe("b");
  expect(parseRoute("/exams/a/problems/same/extra").valid).toBe(false);
  expect(parseRoute("/teacher/extra").valid).toBe(false);
  expect(parseRoute("/exams/a/results").valid).toBe(false);
});

it("a failed draft save keeps the current identity, route and in-memory code", async () => {
  const s = session(
    vi.fn(async (url: string) =>
      url.includes("/submissions")
        ? { submissions: [], hasMore: false, nextCursor: 0 }
        : exam("a"),
    ) as typeof api,
  );
  s.studentInput = "one";
  s.identity();
  await s.navigate("/exams/a/problems/same");
  s.code = "unsaved work";
  const failure = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
  try {
    s.studentInput = "two";
    s.identity();
    await s.navigate("/exams/b");
    expect(s.student).toBe("one");
    expect(s.path).toBe("/exams/a/problems/same");
    expect(s.code).toBe("unsaved work");
    expect(s.draftStatus).toBe("error");
  } finally {
    failure.mockRestore();
  }
});

it("isolates same-name NYCU and guest drafts when switching identity", async () => {
  const request = vi.fn(async (path: string) =>
    path === "/api/auth/session"
      ? { nycuEnabled: true, account: { kind: "nycu", label: "same" } }
      : path.includes("/submissions")
        ? { submissions: [] }
        : exam("a"),
  );
  const s = session(request as typeof api);
  await s.refreshIdentity();
  await s.navigate("/exams/a/problems/same");
  s.code = "NYCU draft";
  s.save();
  s.studentInput = "same";
  await s.useGuest();
  expect(s.identityKind).toBe("guest");
  expect(s.code).toBe(codeTemplate);
  s.code = "guest draft";
  s.save();
  await s.refreshIdentity();
  await s.load();
  expect(s.identityKind).toBe("nycu");
  expect(s.code).toBe("NYCU draft");
});
it("keeps the current identity and draft when logout fails", async () => {
  const request = vi.fn(async (path: string, method: string) => {
    if (method === "DELETE") throw new Error("offline");
    return path === "/api/auth/session"
      ? { nycuEnabled: true, account: { kind: "nycu", label: "same" } }
      : path.includes("/submissions")
        ? { submissions: [] }
        : exam("a");
  });
  const s = session(request as typeof api);
  await s.refreshIdentity();
  await s.navigate("/exams/a/problems/same");
  s.code = "unsent";
  s.studentInput = "guest";
  await s.useGuest();
  expect(s.identityKind).toBe("nycu");
  expect(s.student).toBe("same");
  expect(s.code).toBe("unsent");
  expect(s.error).toBe("offline");
});
const twoProblems = (id: string) => ({
  ...exam(id),
  problems: [
    ...exam(id).problems,
    { id: "next", title: "next", limits: {}, sampleCases: [], statementMd: "" },
  ],
});
it("moving between problems keeps the exam visible and opens the target draft at once", async () => {
  const reload = deferred<unknown>();
  let calls = 0;
  const s = session(
    vi.fn((url: string) =>
      url.includes("/submissions")
        ? Promise.resolve({ submissions: [], hasMore: false, nextCursor: 0 })
        : ++calls === 1
          ? Promise.resolve(twoProblems("a"))
          : reload.promise,
    ) as typeof api,
  );
  s.studentInput = "one";
  s.identity();
  await s.navigate("/exams/a/problems/same");
  s.code = "first problem";
  const moving = s.navigate("/exams/a/problems/next");
  expect(s.exam?.id).toBe("a");
  expect(s.problem?.id).toBe("next");
  expect(s.loading).toBe(false);
  expect(s.refreshing).toBe(true);
  expect(s.code).toBe(codeTemplate);
  reload.resolve(twoProblems("a"));
  await moving;
  expect(s.refreshing).toBe(false);
  await s.navigate("/exams/a/problems/same");
  expect(s.code).toBe("first problem");
});
it("a failed reload of the same exam does not leave it visible", async () => {
  let calls = 0;
  const s = session(
    vi.fn(async (url: string) => {
      if (url.includes("/submissions"))
        return { submissions: [], hasMore: false, nextCursor: 0 };
      if (++calls > 1) throw new Error("offline");
      return exam("a");
    }) as typeof api,
  );
  await s.navigate("/exams/a");
  await s.navigate("/exams/a/problems/same");
  expect(s.exam).toBeNull();
  expect(s.error).toBe("offline");
});
it("a settled prefetch applies synchronously with the offset from its receipt", async () => {
  const serverAhead = 5000;
  const request = vi.fn(async (url: string) =>
    url.includes("/submissions")
      ? { submissions: [], hasMore: false, nextCursor: 0 }
      : { ...exam("a"), serverTime: Date.now() + serverAhead },
  );
  const s = session(request as typeof api);
  s.prefetchExam("a");
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  await Promise.resolve();
  vi.useFakeTimers({ now: Date.now() + 3000, toFake: ["Date"] });
  try {
    const opening = s.navigate("/exams/a");
    expect(s.exam?.id).toBe("a");
    expect(s.loading).toBe(false);
    expect(Math.abs(s.now - (Date.now() + serverAhead))).toBeLessThan(50);
    await opening;
  } finally {
    vi.useRealTimers();
  }
  expect(
    request.mock.calls.filter(([url]) => url === "/api/exams/a"),
  ).toHaveLength(1);
});
it("a requested teacher preview marks exam requests and opens the exam before its start", async () => {
  sessionStorage.setItem("myriad_preview", "a");
  const upcoming = {
    ...exam("a"),
    startsAt: Date.now() + 3600000,
    status: "upcoming",
    preview: true,
  };
  const request = vi.fn(async (url: string) =>
    url.includes("/submissions")
      ? { submissions: [], hasMore: false, nextCursor: 0 }
      : upcoming,
  );
  const s = session(request as typeof api);
  s.studentInput = "teacher";
  s.identity();
  await s.navigate("/exams/a/problems/same");
  expect(s.previewing).toBe(true);
  expect(s.started).toBe(true);
  expect(s.workspace).toBe(true);
  expect(request.mock.calls.map(([url]) => url)).toContain(
    "/api/exams/a?preview=1",
  );
  expect(
    request.mock.calls.some(
      ([url]) => url.includes("/submissions") && url.includes("preview=1"),
    ),
  ).toBe(true);
  expect(s.pendingKey()).toContain("preview:");
  s.exitPreview();
  expect(sessionStorage.getItem("myriad_preview")).toBeNull();
  expect(request.mock.calls.at(-1)?.[0]).toBe("/api/exams/a");
});
it("a refused submission is not left pending and reports beside the judge", async () => {
  vi.mocked(compileCode).mockResolvedValue({
    success: true,
    artifact: {},
  } as Awaited<ReturnType<typeof compileCode>>);
  const s = session(
    vi.fn(async (url: string) =>
      url.includes("/submissions")
        ? { submissions: [], hasMore: false, nextCursor: 0 }
        : exam("a"),
    ) as typeof api,
  );
  s.authReady = true;
  s.studentInput = "one";
  s.identity();
  await s.navigate("/exams/a/problems/same");
  vi.mocked(streamJudgeSubmission).mockRejectedValueOnce(
    new SubmissionRejected("兩次提交需間隔 5 秒，請稍候再提交。", 429),
  );
  await s.submit();
  expect(s.pending).toBe(false);
  expect(localStorage.getItem(s.pendingKey())).toBeNull();
  expect(s.judgeError).toContain("5 秒");
  expect(s.error).toBe("");
  expect(s.busy).toBe(false);
  vi.mocked(streamJudgeSubmission).mockRejectedValueOnce(
    new Error("連線中斷；已保留提交，可繼續傳送"),
  );
  s.cooldownUntil = 0;
  await s.submit();
  expect(s.pending).toBe(true);
  expect(localStorage.getItem(s.pendingKey())).not.toBeNull();
  expect(s.judgeError).toContain("連線中斷");
});
it("background revalidation applies extended times and replaced statements without resetting work", async () => {
  let current: any = exam("a");
  const request = vi.fn(async (url: string) =>
    url.includes("/submissions")
      ? { submissions: [], hasMore: false, nextCursor: 0 }
      : { ...current, serverTime: Date.now() },
  );
  const s = session(request as typeof api);
  s.studentInput = "one";
  s.identity();
  await s.navigate("/exams/a/problems/same");
  s.code = "work in progress";
  s.output = "previous output";
  const endsAt = Date.now() + 7200000;
  current = {
    ...current,
    endsAt,
    problems: [{ ...current.problems[0], statementMd: "fixed" }],
  };
  await s.revalidate();
  expect(s.exam?.endsAt).toBe(endsAt);
  expect(s.problem?.statementMd).toBe("fixed");
  expect(s.code).toBe("work in progress");
  expect(s.output).toBe("previous output");
  expect(s.loading).toBe(false);
});
it("a submission against a replaced problem reloads the exam in place and explains", async () => {
  vi.mocked(compileCode).mockResolvedValue({
    success: true,
    artifact: {},
  } as Awaited<ReturnType<typeof compileCode>>);
  const request = vi.fn(async (url: string) =>
    url.includes("/submissions")
      ? { submissions: [], hasMore: false, nextCursor: 0 }
      : exam("a"),
  );
  const s = session(request as typeof api);
  s.authReady = true;
  s.studentInput = "one";
  s.identity();
  await s.navigate("/exams/a/problems/same");
  s.code = "keep me";
  const before = request.mock.calls.length;
  vi.mocked(streamJudgeSubmission).mockRejectedValueOnce(
    new SubmissionRejected(
      "題目的測資已更新，已重新載入題目，請確認後再提交。",
      409,
    ),
  );
  await s.submit();
  expect(
    request.mock.calls.slice(before).some(([url]) => url === "/api/exams/a"),
  ).toBe(true);
  expect(s.judgeError).toContain("測資已更新");
  expect(s.code).toBe("keep me");
  expect(s.pending).toBe(false);
});
it("uses each problem template only for a new draft, preserving even empty saved drafts", () => {
  const drafts = new Drafts(localStorage);
  expect(
    drafts.open("template-user", "exam", "function", "int solve(int n) {\n}\n"),
  ).toBe("int solve(int n) {\n}\n");
  drafts.save("");
  expect(drafts.open("template-user", "exam", "function", "changed")).toBe("");
  expect(
    drafts.open("template-user", "exam", "another", "other template"),
  ).toBe("other template");
  expect(drafts.open("", "exam", "function", "anonymous template")).toBe(
    "anonymous template",
  );
});
