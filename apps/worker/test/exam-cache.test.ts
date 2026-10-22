import { afterEach, expect, it, vi } from "vitest";
import app, { type Env } from "../src/index";
import { forgetExam } from "../src/core";
afterEach(() => vi.useRealTimers());
/** A D1 stand-in that serves one exam row and counts how often it is read. */
function database(id: string) {
  const reads = { exam: 0 };
  const row = {
    id,
    owner_id: "owner",
    revision: "r1",
    title: "Exam",
    starts_at: 0,
    ends_at: Date.now() + 3600000,
    manifest: JSON.stringify({ problems: [] }),
    rules: "",
    policy: "best",
    published_at: 1,
  };
  const statement = (sql: string) => ({
    bind: () => statement(sql),
    first: async () => {
      if (sql === "SELECT * FROM exam_catalog WHERE id=?") {
        reads.exam++;
        return row;
      }
      return null;
    },
    all: async () => ({ results: [] }),
    run: async () => ({}),
  });
  return { reads, DB: { prepare: statement, batch: async () => [] } };
}
it("read paths reuse an exam row for five seconds", async () => {
  vi.useFakeTimers({ now: 1_800_000_000_000 });
  const db = database("cache-read");
  const env = { DB: db.DB } as unknown as Env;
  expect((await app.request("/api/exams/cache-read", {}, env)).status).toBe(
    200,
  );
  expect((await app.request("/api/exams/cache-read", {}, env)).status).toBe(
    200,
  );
  expect(db.reads.exam).toBe(1);
  vi.advanceTimersByTime(5001);
  await app.request("/api/exams/cache-read", {}, env);
  expect(db.reads.exam).toBe(2);
  // A settings change in this isolate shows at once.
  forgetExam("cache-read");
  await app.request("/api/exams/cache-read", {}, env);
  expect(db.reads.exam).toBe(3);
});
it("creating a submission always reads the exam fresh", async () => {
  vi.useFakeTimers({ now: 1_800_000_000_000 });
  const db = database("cache-write");
  const env = { DB: db.DB } as unknown as Env;
  await app.request("/api/exams/cache-write", {}, env);
  expect(db.reads.exam).toBe(1);
  // A malformed attempt still needs a fresh exam read before validation.
  const pending: Promise<unknown>[] = [];
  const response = await app.request(
    "/api/exams/cache-write/attempts",
    { method: "POST", body: "{}" },
    env,
    {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
      passThroughOnException() {},
    },
  );
  await Promise.all(pending);
  expect(response.status).toBe(400);
  expect(db.reads.exam).toBe(2);
});
