import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { ZodError } from "zod";
import {
  IdentityKindSchema,
  TelemetryBatchSchema,
  ProblemPublicSchema,
} from "@myriad/shared";
import {
  cachedExam,
  cachedExamList,
  readExam,
  examOpen,
  inputKey,
  immutableObject,
  manifest,
  fail,
  page,
  previewing,
  type Env,
  type ExamRow,
} from "./core.js";
import { attempts, summaries, type AttemptRow } from "./attempts.js";
import { auth, requireParticipant, studentAccount } from "./auth.js";
import { background, captureException, proxyPostHog } from "./analytics.js";
import { management } from "./management.js";
import { teachers } from "./teacher.js";
import { monitor } from "./monitor.js";
export type { Env } from "./core.js";
const app = new Hono<{ Bindings: Env }>();
app.use("*", async (c, next) => {
  await next();
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  c.header("Cross-Origin-Embedder-Policy", "require-corp");
  c.header("Cross-Origin-Resource-Policy", "same-origin");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'",
  );
  c.header("Referrer-Policy", "no-referrer");
  if (c.req.path.startsWith("/api/")) c.header("Cache-Control", "no-store");
});
app.use("/api/*", bodyLimit({ maxSize: 100 * 1024 * 1024 }));
app.onError((err, c) => {
  if (err instanceof HTTPException)
    return c.json({ error: err.message }, err.status);
  if (err instanceof ZodError)
    return c.json({ error: "Invalid request", details: err.issues }, 400);
  if (err instanceof SyntaxError) return c.json({ error: "Invalid JSON" }, 400);
  console.error(err);
  captureException(c.env, background(c), err, {
    method: c.req.method,
    route: c.req.routePath,
  });
  return c.json({ error: "Internal server error" }, 500);
});
app.get("/api/health", (c) => c.json({ status: "ok", time: Date.now() }));
function publicExam(e: ExamRow, preview = false) {
  const m = manifest(e),
    now = Date.now(),
    status =
      now < e.starts_at ? "upcoming" : now >= e.ends_at ? "ended" : "active";
  const visible = status === "active" || (preview && status === "upcoming");
  return {
    id: e.id,
    title: e.title,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    rules: e.rules,
    policy: e.policy,
    revision: e.revision,
    status,
    serverTime: now,
    problems: visible
      ? m.problems.map((p) => ProblemPublicSchema.parse(p))
      : [],
    ...(preview ? { preview: true } : {}),
  };
}
app.get("/api/exams", async (c) => {
  const now = Date.now();
  // A cached list may still hold an exam that ended in the last few seconds.
  const rows = (await cachedExamList(c.env)).filter((e) => e.ends_at > now);
  return c.json(rows.map((e) => ({ ...publicExam(e), problems: [] })));
});
app.get("/api/exams/:eid", async (c) => {
  const e = await readExam(c);
  return c.json(publicExam(e, await previewing(c, e)));
});
// Any stored version of a problem stays readable while the exam is open, so an
// attempt started before a replacement finishes with its own tests.
app.get(
  "/api/exams/:eid/problems/:pid/versions/:version/tests/:idx",
  async (c) => {
    const e = await readExam(c),
      i = Number(c.req.param("idx")),
      version = c.req.param("version");
    if (!(await examOpen(c, e))) fail("Problem is not available", 403);
    if (!/^[a-f0-9]{64}$/.test(version) || !Number.isSafeInteger(i) || i < 0)
      fail("Test not found", 404);
    const object = await immutableObject(
      c,
      inputKey(e.id, c.req.param("pid"), version, i),
      "text/plain; charset=utf-8",
    );
    if (!object) fail("Test not found", 404);
    return object;
  },
);
app.get("/api/exams/:eid/submissions", async (c) => {
  const e = await readExam(c),
    student = c.req.query("student"),
    { after, limit } = page(c);
  if (!(await examOpen(c, e))) fail("Exam is not active", 403);
  const preview = await previewing(c, e);
  if (!student) fail("Student ID required");
  const kind = IdentityKindSchema.parse(c.req.query("identityKind"));
  const participant = await requireParticipant(c, kind, student);
  await c.env.DB.prepare(
    `UPDATE attempts SET status='expired' WHERE exam_id=? AND status='running' AND expires_at<=?
       AND NOT EXISTS (
         SELECT 1 FROM exam_revisions r, json_each(r.manifest,'$.problems') p
         WHERE r.exam_id=attempts.exam_id AND r.revision=attempts.revision
           AND json_extract(p.value,'$.id')=attempts.problem_id
           AND json_extract(p.value,'$.semanticCheck') IS NOT NULL
           AND json_extract(p.value,'$.testCount')=(SELECT COUNT(*) FROM attempt_claims WHERE attempt_id=attempts.id)
       )`,
  )
    .bind(e.id, Date.now())
    .run();
  const rows = await c.env.DB.prepare(
    "SELECT * FROM attempts WHERE exam_id=? AND participant_id=? AND preview=? AND sequence>? ORDER BY sequence LIMIT ?",
  )
    .bind(e.id, participant, preview ? 1 : 0, after, limit + 1)
    .all<AttemptRow>();
  return c.json({
    submissions: await summaries(c.env.DB, rows.results.slice(0, limit)),
    hasMore: rows.results.length > limit,
    nextCursor: rows.results.slice(0, limit).at(-1)?.sequence ?? after,
  });
});
app.post("/api/telemetry", bodyLimit({ maxSize: 32768 }), async (c) => {
  const { events } = TelemetryBatchSchema.parse(await c.req.json());
  for (const eid of new Set(events.map((e) => e.examId)))
    if (!(await cachedExam(c.env, eid))?.revision) fail("Exam not found", 404);
  const account = await studentAccount(c);
  await c.env.DB.batch(
    events.map((e) =>
      c.env.DB.prepare(
        "INSERT INTO browser_telemetry(event_id,exam_id,device_id,student_id,operation_id,kind,received_at,user_agent,event) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO NOTHING",
      ).bind(
        e.id,
        e.examId,
        e.deviceId,
        e.studentId,
        e.operationId,
        e.kind,
        Date.now(),
        c.req.header("user-agent")?.slice(0, 512) ?? null,
        JSON.stringify({
          ...e,
          identityVerified:
            e.identityKind !== "guest" &&
            account?.provider === e.identityKind &&
            account.subject === e.studentId,
        }),
      ),
    ),
  );
  return c.json({ accepted: events.length });
});
app.all("/ingest/*", proxyPostHog);
app.route("/", auth);
app.route("/", attempts);
app.route("/", teachers);
app.route("/", monitor);
app.route("/", management);
app.get("/toolchains/*", async (c) => {
  return (await immutableObject(c, c.req.path.slice(1))) ?? c.notFound();
});
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
app.get("*", (c) =>
  c.env.ASSETS
    ? c.env.ASSETS.fetch(c.req.raw)
    : c.text("Frontend assets unavailable", 404),
);
export default app;
