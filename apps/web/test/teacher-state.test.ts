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
it("export pins exam and filename across every page while selection changes", async () => {
  const page = deferred<unknown>();
  const request = vi.fn(async (url: string) => {
    if (url.endsWith("/analysis"))
      return { totals: {}, timings: [], devices: [] };
    if (url.endsWith("/results")) return { reports: [] };
    if (url.includes("after=0")) return page.promise;
    return { submissions: [{ id: "second" }], hasMore: false, nextCursor: 2 };
  });
  const download = vi.fn(),
    session = createTeacherSession(request as typeof api, download);
  await session.select("exam-a");
  const work = session.exportData("submissions");
  await session.select("exam-b");
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
it("late A response cannot overwrite a newer A after A → B → A", async () => {
  const queue: Array<ReturnType<typeof deferred<unknown>>> = [];
  const request = vi.fn(() => {
    const d = deferred<unknown>();
    queue.push(d);
    return d.promise;
  });
  const session = createTeacherSession(request as typeof api);
  const first = session.select("a"),
    second = session.select("b"),
    third = session.select("a");
  // Each selection requests analysis, reports and detail.
  queue[0].reject(new Error("old error"));
  queue[1].resolve({ reports: [] });
  queue[2].resolve({});
  await first;
  expect(session.error).toBe("");
  expect(session.loading).toBe(true);
  queue[6].resolve({ totals: { students: 3 }, timings: [], devices: [] });
  queue[7].resolve({ reports: [] });
  queue[8].resolve({ id: "a" });
  await third;
  queue[3].resolve({ totals: { students: 2 } });
  queue[4].resolve({ reports: [] });
  queue[5].resolve({ id: "b" });
  await second;
  expect(session.detail?.id).toBe("a");
  expect(session.analysis?.totals.students).toBe(3);
  expect(session.loading).toBe(false);
  session.destroy();
});
it("destroy cancels pending exports and suppresses downloads", async () => {
  const page = deferred<unknown>(),
    download = vi.fn();
  const request = vi.fn(async (url: string) =>
    url.includes("submissions")
      ? page.promise
      : url.endsWith("/results")
        ? { reports: [] }
        : { totals: {}, timings: [], devices: [] },
  );
  const session = createTeacherSession(request as typeof api, download);
  await session.select("a");
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
it("refreshing the shown exam keeps its data visible until new data arrives", async () => {
  const next = deferred<unknown>();
  let calls = 0;
  const request = vi.fn(async (url: string) => {
    if (url.endsWith("/results")) return { reports: [] };
    if (url.endsWith("/a") || url.endsWith("/b")) return { id: url.slice(-1) };
    return ++calls === 1
      ? { totals: { students: 1 }, timings: [], devices: [] }
      : next.promise;
  });
  const session = createTeacherSession(request as typeof api);
  await session.select("a");
  const refreshing = session.select("a");
  expect(session.loading).toBe(true);
  expect(session.analysis?.totals.students).toBe(1);
  next.resolve({ totals: { students: 2 }, timings: [], devices: [] });
  await refreshing;
  expect(session.analysis?.totals.students).toBe(2);
  const switching = session.select("b");
  expect(session.analysis).toBeNull();
  await switching;
  session.destroy();
});
