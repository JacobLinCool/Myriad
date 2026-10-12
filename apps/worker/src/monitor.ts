import { Hono } from "hono";
import type { MonitoredSubmission } from "@myriad/shared";
import { exam, fail, manifest, type AppContext, type Env } from "./core.js";
import { purgePreview } from "./attempts.js";
/**
 * Teacher monitoring, one endpoint per workspace tab so a tab reads only what
 * it shows. Groups cover every test, so a complete attempt passed exactly when
 * every group passed and any semantic check did too; that reads the stored
 * result instead of every test claim.
 */
const PASSED = `(a.status='complete' AND json_extract(a.result,'$.groupsPassed')=json_extract(a.result,'$.groupsTotal') AND COALESCE(json_extract(a.result,'$.semanticCheck.passed'),1)=1)`;
/** A running attempt past its deadline is reported as expired. */
const STATUS = `CASE WHEN a.status='running' AND a.expires_at<=? THEN 'expired' ELSE a.status END`;
export const monitor = new Hono<{ Bindings: Env }>();

export async function overview(db: D1Database, examId: string) {
  const now = Date.now();
  const [totals, problems] = await db.batch([
    db
      .prepare(
        `SELECT COUNT(*) AS attempts,COUNT(DISTINCT participant_id) AS students,SUM(status='complete') AS completed,SUM(status='running' AND expires_at>?) AS running FROM attempts WHERE exam_id=? AND preview=0`,
      )
      .bind(now, examId),
    db
      .prepare(
        `SELECT problem_id AS problemId,problem_version AS problemVersion,COUNT(*) AS submissions,COUNT(DISTINCT participant_id) AS participants,
          COUNT(DISTINCT CASE WHEN ${PASSED} THEN participant_id END) AS passedParticipants,
          SUM(a.status='running' AND a.expires_at>?) AS running,
          SUM(a.status IN ('expired','failed') OR (a.status='running' AND a.expires_at<=?)) AS stopped
        FROM attempts a WHERE exam_id=? AND preview=0 GROUP BY problem_id,problem_version`,
      )
      .bind(now, now, examId),
  ]);
  const t = totals.results[0] as Record<string, number | null>;
  return {
    totals: {
      attempts: t.attempts ?? 0,
      students: t.students ?? 0,
      completed: t.completed ?? 0,
      running: t.running ?? 0,
    },
    problems: problems.results,
  };
}
/** Every submission of one problem version, with its per-test resource totals. */
export async function problemSubmissions(
  db: D1Database,
  examId: string,
  filter?: { problemId: string; version: string | null },
) {
  const where = filter ? " AND a.problem_id=? AND a.problem_version IS ?" : "";
  const rows = await db
    .prepare(
      `SELECT a.id,a.sequence,a.participant_id AS participantId,a.student_id AS studentId,
        a.identity_kind AS identityKind,a.problem_id AS problemId,a.problem_version AS problemVersion,
        ${STATUS} AS status,a.created_at AS createdAt,COALESCE(json_extract(a.result,'$.score'),0) AS score,
        ${PASSED} AS passed,COUNT(c.idx) AS testsReported,length(CAST(a.code AS BLOB)) AS codeBytes,
        CASE WHEN COUNT(json_extract(c.claim,'$.metrics.instructionCost'))=COUNT(c.idx)
          THEN SUM(json_extract(c.claim,'$.metrics.instructionCost')) END AS instructionCost,
        CASE WHEN COUNT(json_extract(c.claim,'$.metrics.memoryBytes'))=COUNT(c.idx)
          THEN MAX(json_extract(c.claim,'$.metrics.memoryBytes')) END AS memoryBytes,
        CASE WHEN COUNT(DISTINCT json_extract(c.claim,'$.metrics.costProfile'))=1
          AND COUNT(json_extract(c.claim,'$.metrics.costProfile'))=COUNT(c.idx)
          THEN MIN(json_extract(c.claim,'$.metrics.costProfile')) END AS costProfile,
        CASE WHEN COUNT(DISTINCT json_extract(c.claim,'$.metrics.costModel'))=1
          AND COUNT(json_extract(c.claim,'$.metrics.costModel'))=COUNT(c.idx)
          THEN MIN(json_extract(c.claim,'$.metrics.costModel')) END AS costModel
      FROM attempts a LEFT JOIN attempt_claims c ON c.attempt_id=a.id
      WHERE a.exam_id=? AND a.preview=0${where} GROUP BY a.id ORDER BY a.sequence`,
    )
    .bind(
      Date.now(),
      examId,
      ...(filter ? [filter.problemId, filter.version] : []),
    )
    .all<Omit<MonitoredSubmission, "passed"> & { passed: number }>();
  return rows.results.map((s) => ({ ...s, passed: s.passed === 1 }));
}
/** Devices shared by several identities, and identities spread over several devices. */
export async function deviceLinks(db: D1Database, examId: string) {
  const [devices, identities] = await db.batch([
    db
      .prepare(
        `SELECT device_id AS deviceId,student_id AS studentId,identity_kind AS identityKind,COUNT(*) AS submissions,MIN(created_at) AS firstSeenAt,MAX(created_at) AS lastSeenAt,GROUP_CONCAT(DISTINCT client_ip) AS ips FROM attempts WHERE exam_id=? AND preview=0 AND device_id IN (SELECT device_id FROM attempts WHERE exam_id=? AND preview=0 GROUP BY device_id HAVING COUNT(DISTINCT participant_id)>1) GROUP BY device_id,participant_id ORDER BY device_id,student_id`,
      )
      .bind(examId, examId),
    db
      .prepare(
        `SELECT student_id AS studentId,identity_kind AS identityKind,device_id AS deviceId,COUNT(*) AS submissions,MIN(created_at) AS firstSeenAt,MAX(created_at) AS lastSeenAt,GROUP_CONCAT(DISTINCT client_ip) AS ips,COUNT(DISTINCT user_agent) AS userAgents,MAX(user_agent) AS userAgent FROM attempts WHERE exam_id=? AND preview=0 AND participant_id IN (SELECT participant_id FROM attempts WHERE exam_id=? AND preview=0 GROUP BY participant_id HAVING COUNT(DISTINCT device_id)>1) GROUP BY participant_id,device_id ORDER BY participant_id,firstSeenAt`,
      )
      .bind(examId, examId),
  ]);
  return { devices: devices.results, identities: identities.results };
}
export async function browserTimings(db: D1Database, examId: string) {
  return (
    await db
      .prepare(
        `SELECT kind,COUNT(*) AS samples,AVG(json_extract(event,'$.durationMs')) AS averageMs,MAX(json_extract(event,'$.durationMs')) AS maxMs,SUM(json_extract(event,'$.outcome')='error') AS errors FROM browser_telemetry WHERE exam_id=? GROUP BY kind`,
      )
      .bind(examId)
      .all()
  ).results;
}

monitor.get("/api/teacher/exams/:eid/overview", async (c) => {
  const e = await exam(c, true);
  await purgePreview(c.env.DB, e);
  return c.json({ ...(await overview(c.env.DB, e.id)), updatedAt: Date.now() });
});

interface Cell {
  attempts: number;
  latest: Pick<
    MonitoredSubmission,
    "id" | "status" | "score" | "passed" | "testsReported"
  >;
  /** The attempt the exam's policy counts, once one is complete. */
  selected: { score: number; passed: boolean } | null;
}
const PAGE = 50;
monitor.get("/api/teacher/exams/:eid/students", async (c) => {
  const e = await exam(c, true),
    query = (c.req.query("q") ?? "").trim().slice(0, 64),
    offset = Number(c.req.query("offset") ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0) fail("Invalid offset");
  const search = query
    ? [
        " AND student_id LIKE ? ESCAPE '\\'",
        `%${query.replace(/[\\%_]/g, "\\$&")}%`,
      ]
    : null;
  const [count, people] = await c.env.DB.batch<{
    n: number;
    participantId: string;
    studentId: string;
    identityKind: "guest" | "nycu";
  }>([
    c.env.DB.prepare(
      `SELECT COUNT(DISTINCT participant_id) AS n FROM attempts WHERE exam_id=? AND preview=0${search?.[0] ?? ""}`,
    ).bind(e.id, ...(search ? [search[1]] : [])),
    c.env.DB.prepare(
      `SELECT participant_id AS participantId,MIN(student_id) AS studentId,MIN(identity_kind) AS identityKind FROM attempts WHERE exam_id=? AND preview=0${search?.[0] ?? ""} GROUP BY participant_id ORDER BY studentId,participantId LIMIT ? OFFSET ?`,
    ).bind(e.id, ...(search ? [search[1]] : []), PAGE, offset),
  ]);
  const ids = people.results.map((p) => p.participantId);
  // Only the current version of each problem is shown, as students see it.
  const current = new Map(
    (e.revision ? manifest(e).problems : []).map((p) => [
      p.id,
      (p as { version?: string }).version ?? null,
    ]),
  );
  const rows = ids.length
    ? (
        await c.env.DB.prepare(
          `SELECT a.id,a.sequence,a.participant_id AS participantId,a.problem_id AS problemId,a.problem_version AS problemVersion,
            ${STATUS} AS status,COALESCE(json_extract(a.result,'$.score'),0) AS score,${PASSED} AS passed,
            CASE WHEN a.status='running' THEN (SELECT COUNT(*) FROM attempt_claims WHERE attempt_id=a.id) ELSE 0 END AS testsReported
          FROM attempts a WHERE a.exam_id=? AND a.preview=0 AND a.participant_id IN (SELECT value FROM json_each(?)) ORDER BY a.sequence`,
        )
          .bind(Date.now(), e.id, JSON.stringify(ids))
          .all<{
            id: string;
            sequence: number;
            participantId: string;
            problemId: string;
            problemVersion: string | null;
            status: MonitoredSubmission["status"];
            score: number;
            passed: number;
            testsReported: number;
          }>()
      ).results.filter((r) => current.get(r.problemId) === r.problemVersion)
    : [];
  const students = people.results.map((p) => {
    const cells: Record<string, Cell> = {};
    for (const problemId of current.keys()) {
      const attempts = rows.filter(
        (r) => r.participantId === p.participantId && r.problemId === problemId,
      );
      const latest = attempts.at(-1);
      if (!latest) continue;
      const selected = attempts
        .filter((r) => r.status === "complete")
        .sort(
          (a, b) =>
            (e.policy === "best" ? b.score - a.score : 0) ||
            b.sequence - a.sequence,
        )[0];
      cells[problemId] = {
        attempts: attempts.length,
        latest: {
          id: latest.id,
          status: latest.status,
          score: latest.score,
          passed: latest.passed === 1,
          testsReported: latest.testsReported,
        },
        selected: selected
          ? { score: selected.score, passed: selected.passed === 1 }
          : null,
      };
    }
    return {
      participantId: p.participantId,
      studentId: p.studentId,
      identityKind: p.identityKind,
      cells,
    };
  });
  return c.json({
    total: count.results[0]?.n ?? 0,
    offset,
    pageSize: PAGE,
    students,
    updatedAt: Date.now(),
  });
});

monitor.get("/api/teacher/exams/:eid/problems/:pid/submissions", async (c) => {
  const e = await exam(c, true),
    problem = e.revision
      ? manifest(e).problems.find((p) => p.id === c.req.param("pid"))
      : undefined;
  if (!problem) fail("Problem not found", 404);
  const currentVersion = (problem as { version?: string }).version ?? null;
  // An empty version selects submissions made before versions were recorded.
  const requested = c.req.query("version");
  const version = requested === undefined ? currentVersion : requested || null;
  const versions = await c.env.DB.prepare(
    "SELECT problem_version AS version,COUNT(*) AS submissions FROM attempts WHERE exam_id=? AND preview=0 AND problem_id=? GROUP BY problem_version",
  )
    .bind(e.id, problem.id)
    .all<{ version: string | null; submissions: number }>();
  return c.json({
    version,
    currentVersion,
    versions: versions.results,
    submissions: await problemSubmissions(c.env.DB, e.id, {
      problemId: problem.id,
      version,
    }),
    updatedAt: Date.now(),
  });
});

monitor.get("/api/teacher/exams/:eid/devices", async (c) => {
  const e = await exam(c, true);
  return c.json({
    ...(await deviceLinks(c.env.DB, e.id)),
    updatedAt: Date.now(),
  });
});

monitor.get("/api/teacher/exams/:eid/performance", async (c) => {
  const e = await exam(c, true);
  return c.json({
    timings: await browserTimings(c.env.DB, e.id),
    updatedAt: Date.now(),
  });
});

/** The CLI's `myriad status` reads everything at once. */
export async function analysis(c: AppContext) {
  const e = await exam(c, true);
  await purgePreview(c.env.DB, e);
  const [summary, links, timings, submissions] = await Promise.all([
    overview(c.env.DB, e.id),
    deviceLinks(c.env.DB, e.id),
    browserTimings(c.env.DB, e.id),
    problemSubmissions(c.env.DB, e.id),
  ]);
  return {
    totals: summary.totals,
    ...links,
    timings,
    updatedAt: Date.now(),
    submissions,
  };
}
