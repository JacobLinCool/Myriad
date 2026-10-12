import { expect, it, vi } from "vitest";
import type { api } from "../src/lib/api";
import { createTeacherSession } from "../src/lib/state/teacher.svelte";
import { collectExport } from "../src/lib/teacher/data";
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
it("export pins exam and filename across every page while the open exam changes", async () => {
  const page = deferred<unknown>();
  const request = vi.fn(async (url: string) => {
    if (url.includes("after=0")) return page.promise;
    if (url.includes("/submissions"))
      return { submissions: [{ id: "second" }], hasMore: false, nextCursor: 2 };
    return { id: url.split("/").at(-1) };
  });
  const download = vi.fn(),
    session = createTeacherSession(request as typeof api, download);
  await session.open("exam-a");
  const work = session.exportData("submissions");
  await session.open("exam-b");
  page.resolve({
    submissions: [{ id: "first" }],
    hasMore: true,
    nextCursor: 1,
  });
  await work;
  expect(
    request.mock.calls
      .filter(([url]) => url.includes("/submissions"))
      .map(([url]) => url),
  ).toEqual([
    "/api/teacher/exams/exam-a/submissions?after=0",
    "/api/teacher/exams/exam-a/submissions?after=1",
  ]);
  expect(download).toHaveBeenCalledWith("exam-a-submissions.json", [
    { id: "first" },
    { id: "second" },
  ]);
  session.destroy();
});
it("opening an exam reads only its header; per-tab data is left to the tabs", async () => {
  const request = vi.fn(async (url: string) => ({ id: url.split("/").at(-1) }));
  const session = createTeacherSession(request as typeof api);
  await session.open("a");
  expect(request.mock.calls.map(([url]) => url)).toEqual([
    "/api/teacher/exams/a",
  ]);
  session.destroy();
});
it("late A response cannot overwrite a newer A after A → B → A", async () => {
  const queue: Array<ReturnType<typeof deferred<unknown>>> = [];
  const request = vi.fn(() => {
    const d = deferred<unknown>();
    queue.push(d);
    return d.promise;
  });
  const session = createTeacherSession(request as typeof api);
  const first = session.open("a"),
    second = session.open("b"),
    third = session.open("a");
  queue[0].reject(new Error("old error"));
  await first;
  expect(session.error).toBe("");
  expect(session.loading).toBe(true);
  queue[2].resolve({ id: "a", title: "new" });
  await third;
  queue[1].resolve({ id: "b" });
  await second;
  expect(session.detail).toEqual({ id: "a", title: "new" });
  expect(session.loading).toBe(false);
  session.destroy();
});
it("destroy cancels pending exports and suppresses downloads", async () => {
  const page = deferred<unknown>(),
    download = vi.fn();
  const request = vi.fn(async (url: string) =>
    url.includes("submissions") ? page.promise : { id: "a" },
  );
  const session = createTeacherSession(request as typeof api, download);
  await session.open("a");
  const work = session.exportData("submissions");
  session.destroy();
  page.resolve({ submissions: [], hasMore: false, nextCursor: 0 });
  await work;
  expect(download).not.toHaveBeenCalled();
});
it("export rejects non-advancing cursors instead of looping forever", async () => {
  const request = vi.fn(async () => ({
    events: [],
    hasMore: true,
    nextCursor: 0,
  }));
  await expect(
    collectExport(
      "a",
      "telemetry",
      new AbortController().signal,
      request as typeof api,
    ),
  ).rejects.toThrow("游標");
  expect(request).toHaveBeenCalledTimes(1);
});
it("refreshing keeps the shown exam visible, bumps the tabs and clears on switching", async () => {
  const next = deferred<unknown>();
  let calls = 0;
  const request = vi.fn(async (url: string) =>
    url.endsWith("/b")
      ? { id: "b" }
      : ++calls === 1
        ? { id: "a", title: "first" }
        : next.promise,
  );
  const session = createTeacherSession(request as typeof api);
  await session.open("a");
  const key = session.refreshKey;
  const refreshing = session.refresh();
  expect(session.refreshKey).toBe(key + 1);
  expect(session.loading).toBe(true);
  expect(session.detail?.title).toBe("first");
  next.resolve({ id: "a", title: "second" });
  await refreshing;
  expect(session.detail?.title).toBe("second");
  const switching = session.open("b");
  expect(session.detail).toBeNull();
  await switching;
  session.close();
  expect(session.selected).toBe("");
  expect(session.detail).toBeNull();
  session.destroy();
});
