import { ensureSemantic } from "./semantic.js";
import { Hono } from "hono";
import {
  AttemptRequestSchema,
  ClaimMessageSchema,
  canonicalJson,
  sha256Hex,
  boundChecksum,
  computeGroupVerdicts,
  type AttemptSummary,
  type BundleContent,
  type SemanticCheckResult,
  type TestClaim,
  type TestVerdict,
} from "@myriad/shared";
import {
  attemptToken,
  exam,
  examOpen,
  fail,
  manifest,
  previewing,
  revisionManifest,
  type Env,
  type AppContext,
  type ExamRow,
} from "./core.js";
import { requireParticipant } from "./auth.js";
export interface AttemptRow {
  identity_kind: "guest" | "nycu";
  participant_id: string;
  sequence: number;
  id: string;
  exam_id: string;
  revision: string;
  problem_id: string;
  student_id: string;
  device_id: string;
  code: string;
  code_sha256: string;
  request_hash: string;
  token_hash: string;
  status: AttemptSummary["status"];
  created_at: number;
  expires_at: number;
  result: string | null;
  preview: 0 | 1;
  problem_version: string | null;
}
/** Preview work made before the start is discarded once real students can submit. */
export async function purgePreview(db: D1Database, e: ExamRow) {
  if (Date.now() < e.starts_at) return;
  const stale =
    "SELECT id FROM attempts WHERE exam_id=? AND preview=1 AND created_at<?";
  await db.batch([
    db
      .prepare(`DELETE FROM semantic_checks WHERE attempt_id IN (${stale})`)
      .bind(e.id, e.starts_at),
    db
      .prepare(`DELETE FROM attempt_claims WHERE attempt_id IN (${stale})`)
      .bind(e.id, e.starts_at),
    db
      .prepare(
        "DELETE FROM attempts WHERE exam_id=? AND preview=1 AND created_at<?",
      )
      .bind(e.id, e.starts_at),
  ]);
}
export async function getAttempt(c: AppContext): Promise<AttemptRow> {
  const a = await c.env.DB.prepare(
    "SELECT * FROM attempts WHERE exam_id=? AND id=?",
  )
    .bind(c.req.param("eid"), c.req.param("aid"))
    .first<AttemptRow>();
  if (!a) fail("Attempt not found", 404);
  await requireParticipant(c, a.identity_kind, a.student_id);
  if (a.status === "running" && Date.now() >= a.expires_at) {
    const m = await revisionManifest(c.env.DB, a.exam_id, a.revision);
    const p = m.problems.find((p) => p.id === a.problem_id)!;
    const received = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM attempt_claims WHERE attempt_id=?",
    )
      .bind(a.id)
      .first<{ count: number }>();
    // Timely persisted tests remain eligible while server-side grading finishes.
    if (p.semanticCheck && received?.count === p.testCount) return a;
    await c.env.DB.prepare(
      "UPDATE attempts SET status='expired' WHERE id=? AND status='running' AND expires_at<=?",
    )
      .bind(a.id, Date.now())
      .run();
    return (await c.env.DB.prepare("SELECT * FROM attempts WHERE id=?")
      .bind(a.id)
      .first<AttemptRow>())!;
  }
  return a;
}
export async function summary(
  db: D1Database,
  a: AttemptRow,
): Promise<AttemptSummary> {
  const claims = await db
    .prepare(
      "SELECT verdict FROM attempt_claims WHERE attempt_id=? ORDER BY idx",
    )
    .bind(a.id)
    .all<{ verdict: string }>();
  return summaryOf(
    a,
    claims.results.map((r) => JSON.parse(r.verdict)),
  );
}
/** A summary from verdicts already in hand, sorted by test index. */
export function summaryOf(
  a: AttemptRow,
  verdicts: TestVerdict[],
): AttemptSummary {
  return {
    id: a.id,
    examId: a.exam_id,
    revision: a.revision,
    problemId: a.problem_id,
    problemVersion: a.problem_version,
    studentId: a.student_id,
    identityKind: a.identity_kind,
    participantId: a.participant_id,
    status: a.status,
    createdAt: a.created_at,
    verdicts,
    groupsPassed: 0,
    groupsTotal: 0,
    score: 0,
    ...(a.result ? JSON.parse(a.result) : {}),
  };
}
type GradingProblem = BundleContent["problems"][number];
/** Both producers persist first and then try this same atomic finalization. */
async function finalizeAttempt(
  env: Env,
  a: AttemptRow,
  p: GradingProblem,
): Promise<AttemptRow> {
  if (a.status !== "running") return a;
  const saved = await summary(env.DB, a);
  if (saved.verdicts.length !== p.testCount) return a;
  let semanticCheck: SemanticCheckResult | undefined;
  if (p.semanticCheck) {
    const row = await env.DB.prepare(
      "SELECT result FROM semantic_checks WHERE attempt_id=?",
    )
      .bind(a.id)
      .first<{ result: string | null }>();
    if (!row?.result) return a;
    semanticCheck = JSON.parse(row.result);
  }
  const tests = computeGroupVerdicts(p.groups, saved.verdicts);
  const result = {
    ...tests,
    ...(semanticCheck
      ? {
          semanticCheck,
          testScore: tests.score,
          score: semanticCheck.passed ? tests.score : 0,
        }
      : {}),
  };
  const updated = await env.DB.prepare(
    "UPDATE attempts SET status='complete',completed_at=?,result=? WHERE id=? AND status='running' AND (expires_at>? OR ?=1) AND (SELECT COUNT(*) FROM attempt_claims WHERE attempt_id=?)=? RETURNING *",
  )
    .bind(
      Date.now(),
      JSON.stringify(result),
      a.id,
      Date.now(),
      p.semanticCheck ? 1 : 0,
      a.id,
      p.testCount,
    )
    .first<AttemptRow>();
  return (
    updated ??
    (await env.DB.prepare("SELECT * FROM attempts WHERE id=?")
      .bind(a.id)
      .first<AttemptRow>())!
  );
}
function startSemantic(c: AppContext, a: AttemptRow, p: GradingProblem) {
  if (!p.semanticCheck || a.status !== "running") return;
  c.executionCtx.waitUntil(
    ensureSemantic(c.env, a.id, p.semanticCheck, a.code)
      .then(async (result) => {
        if (result) await finalizeAttempt(c.env, a, p);
      })
      .catch(() => {
        console.error("Background submission grading unavailable", a.id);
      }),
  );
}
export const attempts = new Hono<{ Bindings: Env }>();
attempts.use("/api/exams/:eid/attempts/*", async (c, next) => {
  const e = await exam(c);
  if (!(await examOpen(c, e))) fail("Exam is not active", 403);
  await next();
});
attempts.post("/api/exams/:eid/attempts", async (c) => {
  const e = await exam(c);
  if (!(await examOpen(c, e))) fail("Exam is not active", 403);
  const preview = await previewing(c, e);
  // Housekeeping; the submission does not wait for it.
  if (!preview) c.executionCtx.waitUntil(purgePreview(c.env.DB, e));
  const req = AttemptRequestSchema.parse(await c.req.json());
  const participant = await requireParticipant(
    c,
    req.identityKind,
    req.studentId,
  );
  const hash = await sha256Hex(canonicalJson(req));
  const credential = await attemptToken(
    c.env.ATTEMPT_SECRET,
    req.operationId,
    hash,
  );
  const existing = await c.env.DB.prepare("SELECT * FROM attempts WHERE id=?")
    .bind(req.operationId)
    .first<AttemptRow>();
  if (existing) {
    if (
      existing.exam_id !== e.id ||
      existing.request_hash !== hash ||
      existing.preview !== (preview ? 1 : 0)
    )
      fail("Operation ID already used with different content", 409);
    return c.json({
      attempt: await summary(c.env.DB, existing),
      token: credential,
    });
  }
  const now = Date.now(),
    m = manifest(e);
  if ((now < e.starts_at && !preview) || now >= e.ends_at)
    fail("Exam is not accepting submissions", 403);
  const problem = m.problems.find((p) => p.id === req.problemId);
  if (!problem) fail("Problem not found", 404);
  // Only a change to what decides verdicts invalidates the student's copy.
  if (problem.version !== req.problemVersion)
    fail("Problem version changed; reload exam", 409);
  // Both reservation and insertion are conditional inside one D1 transaction.
  const [, inserted] = await c.env.DB.batch<AttemptRow>([
    c.env.DB.prepare(
      `INSERT INTO submission_cooldowns VALUES (?,?,?,?) ON CONFLICT(exam_id,participant_id) DO UPDATE SET operation_id=excluded.operation_id,reserved_at=excluded.reserved_at WHERE submission_cooldowns.reserved_at<=excluded.reserved_at-5000`,
    ).bind(e.id, participant, req.operationId, now),
    c.env.DB.prepare(
      `INSERT INTO attempts (id,exam_id,revision,problem_id,student_id,device_id,code,code_sha256,request_hash,token_hash,status,created_at,expires_at,identity_kind,participant_id,preview,problem_version)
      SELECT ?,?,?,?,?,?,?,?,?,?,'running',?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM submission_cooldowns WHERE exam_id=? AND participant_id=? AND operation_id=?) ON CONFLICT(id) DO NOTHING RETURNING *`,
    ).bind(
      req.operationId,
      e.id,
      e.revision,
      req.problemId,
      req.studentId,
      req.deviceId,
      req.code,
      await sha256Hex(req.code),
      hash,
      await sha256Hex(credential),
      now,
      e.ends_at,
      req.identityKind,
      participant,
      preview ? 1 : 0,
      problem.version,
      e.id,
      participant,
      req.operationId,
    ),
  ]);
  const created = inserted.results[0];
  if (created) {
    startSemantic(c, created, problem);
    return c.json({ attempt: summaryOf(created, []), token: credential }, 201);
  }
  // Not inserted: the cooldown held, or a concurrent retry created it first.
  const raced = await c.env.DB.prepare("SELECT * FROM attempts WHERE id=?")
    .bind(req.operationId)
    .first<AttemptRow>();
  if (!raced) fail("Please wait five seconds before another submission", 429);
  if (raced.request_hash !== hash || raced.exam_id !== e.id)
    fail("Operation conflict", 409);
  return c.json(
    { attempt: await summary(c.env.DB, raced), token: credential },
    201,
  );
});
attempts.get("/api/exams/:eid/attempts/:aid", async (c) => {
  await exam(c);
  return c.json(await summary(c.env.DB, await getAttempt(c)));
});
attempts.get("/api/exams/:eid/attempts/:aid/ws", async (c) => {
  const e = await exam(c);
  let a = await getAttempt(c);
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket")
    return c.text("WebSocket required", 426);
  const pair = new WebSocketPair();
  const client = pair[0],
    server = pair[1];
  server.accept();
  let authenticated = false;
  const authTimer = setTimeout(
    () => server.close(1008, "Authentication timeout"),
    10000,
  );
  // Judge against the upload the attempt was created on, even after a replacement.
  const m = await revisionManifest(c.env.DB, e.id, a.revision),
    p = m.problems.find((p) => p.id === a.problem_id)!;
  const send = (value: unknown) => {
    if (server.readyState === WebSocket.OPEN)
      server.send(JSON.stringify(value));
  };
  // The attempt and its claims stay in memory for the connection, so a claim
  // costs one conditional insert. D1 still enforces running, expiry and
  // duplicate rules; the copy is reloaded whenever an insert is refused.
  const claims = new Map<number, { claim: string; verdict: TestVerdict }>();
  const current = () =>
    summaryOf(
      a,
      [...claims.values()]
        .map((entry) => entry.verdict)
        .sort((x, y) => x.index - y.index),
    );
  async function load() {
    const [attempt, stored] = await c.env.DB.batch<
      AttemptRow & { idx: number; claim: string; verdict: string }
    >([
      c.env.DB.prepare("SELECT * FROM attempts WHERE id=?").bind(a.id),
      c.env.DB.prepare(
        "SELECT idx,claim,verdict FROM attempt_claims WHERE attempt_id=?",
      ).bind(a.id),
    ]);
    a = attempt.results[0] as AttemptRow;
    claims.clear();
    for (const row of stored.results)
      claims.set(row.idx, {
        claim: row.claim,
        verdict: JSON.parse(row.verdict),
      });
    if (
      a.status === "running" &&
      Date.now() >= a.expires_at &&
      !(p.semanticCheck && claims.size === p.testCount)
    ) {
      await c.env.DB.prepare(
        "UPDATE attempts SET status='expired' WHERE id=? AND status='running' AND expires_at<=?",
      )
        .bind(a.id, Date.now())
        .run();
      a = { ...a, status: "expired" };
    }
  }
  let semanticError: Error | undefined;
  let observingSemantic = false;
  async function complete() {
    if (a.status !== "running" || claims.size !== p.testCount) return;
    a = await finalizeAttempt(c.env, a, p);
    if (a.status === "running" && p.semanticCheck) {
      if (semanticError) throw semanticError;
      send({ type: "semantic", status: "running" });
    }
  }
  // The POST may run in another isolate. Observe its persisted lease without
  // blocking this socket's serialized claim writes; reconnect can recover a stale lease.
  function observeSemantic() {
    if (!p.semanticCheck || observingSemantic || a.status !== "running") return;
    observingSemantic = true;
    const instruction = p.semanticCheck;
    c.executionCtx.waitUntil(
      (async () => {
        try {
          const deadline = Date.now() + 35000;
          while (server.readyState === WebSocket.OPEN) {
            const result = await ensureSemantic(
              c.env,
              a.id,
              instruction,
              a.code,
            );
            if (result) {
              await enqueue(async () => {
                await load();
                await complete();
                if (a.status !== "running")
                  send({ type: "state", attempt: current() });
              });
              return;
            }
            if (Date.now() >= deadline)
              throw new Error(
                "語意檢查尚未完成，請稍後查詢並繼續提交；測資結果已保存。",
              );
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch (error) {
          await enqueue(async () => {
            semanticError =
              error instanceof Error
                ? error
                : new Error("語意檢查暫時無法完成");
            await load();
            await complete();
          });
        }
      })(),
    );
  }
  let queue = Promise.resolve();
  server.addEventListener("close", () => {
    clearTimeout(authTimer);
    server.close(1000, "Closed");
  });
  function enqueue(work: () => Promise<void>) {
    queue = queue.then(work).catch((error: unknown) => {
      send({
        type: "error",
        error: error instanceof Error ? error.message : "Invalid request",
      });
      server.close(1008, "Invalid request");
    });
    c.executionCtx.waitUntil(queue);
    return queue;
  }
  server.addEventListener("message", (event) => {
    void enqueue(async () => {
      if (typeof event.data !== "string" || event.data.length > 2048)
        fail("Invalid message");
      const msg = ClaimMessageSchema.parse(JSON.parse(event.data));
      if (msg.type === "auth") {
        if ((await sha256Hex(msg.token)) !== a.token_hash)
          fail("Invalid attempt credential", 401);
        authenticated = true;
        clearTimeout(authTimer);
        await load();
        await complete();
        if (a.status !== "running") {
          send({ type: "state", attempt: current() });
          return;
        }
        send({ type: "ready", salt: m.exam.salt, attempt: current() });
        observeSemantic();
        return;
      }
      if (!authenticated) fail("Authenticate first", 401);
      if (a.status === "running" && Date.now() >= a.expires_at) await load();
      if (a.status !== "running") {
        send({ type: "state", attempt: current() });
        return;
      }
      if (msg.type === "abort") {
        const updated = await c.env.DB.prepare(
          "UPDATE attempts SET status='failed' WHERE id=? AND status='running' RETURNING *",
        )
          .bind(a.id)
          .first<AttemptRow>();
        if (updated) a = updated;
        else await load();
        send({ type: "state", attempt: current() });
        return;
      }
      if (msg.type === "claim") {
        const claim: TestClaim = msg.claim;
        if (claim.index >= p.testCount) fail("Test index out of range");
        const serialized = canonicalJson(claim);
        let status: TestVerdict["status"];
        if (claim.status === "ok") {
          const digest = m.inputs.find(
            (i) => i.problemId === p.id && i.index === claim.index,
          )!.expectedDigest;
          const expected = await boundChecksum({
            salt: m.exam.salt,
            studentId: a.student_id,
            problemId: p.id,
            index: claim.index,
            innerDigest: digest,
          });
          status = claim.checksum.toLowerCase() === expected ? "AC" : "WA";
        } else
          status = ({ tle: "TLE", mle: "MLE", re: "RE", ole: "OLE" } as const)[
            claim.status
          ];
        const verdict: TestVerdict = {
          index: claim.index,
          status,
          ...(claim.metrics ? { metrics: claim.metrics } : {}),
        };
        if (!claims.has(claim.index)) {
          const inserted = await c.env.DB.prepare(
            `INSERT INTO attempt_claims SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM attempts WHERE id=? AND status='running' AND expires_at>?) ON CONFLICT(attempt_id,idx) DO NOTHING RETURNING idx`,
          )
            .bind(
              a.id,
              claim.index,
              serialized,
              JSON.stringify(verdict),
              a.id,
              Date.now(),
            )
            .first();
          if (inserted) claims.set(claim.index, { claim: serialized, verdict });
          // Claimed by another connection, or the attempt stopped running.
          else await load();
        }
        const stored = claims.get(claim.index);
        if (stored && stored.claim !== serialized)
          fail("Conflicting duplicate claim", 409);
        if (stored) send({ type: "verdict", verdict: stored.verdict });
        if (a.status !== "running") {
          send({ type: "state", attempt: current() });
          return;
        }
      }
      // "finish" may follow claims written by an earlier connection.
      if (msg.type === "finish" && claims.size !== p.testCount) await load();
      const before = a.status;
      await complete();
      if (msg.type === "finish" || a.status !== before)
        send({ type: "state", attempt: current() });
    });
  });
  return new Response(null, { status: 101, webSocket: client });
});
