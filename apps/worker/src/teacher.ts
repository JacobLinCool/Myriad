import { account, requireCreator } from "./permissions.js";
import { analyticsId, background, capture } from "./analytics.js";
import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import {
  validateBundle,
  canonicalJson,
  sha256Hex,
  VerificationReportSchema,
  computeGroupVerdicts,
} from "@myriad/shared";
import {
  teacher,
  exam,
  manifest,
  fail,
  requireAdmin,
  token,
  page,
  inputKey,
  revisionManifest,
  forgetExam,
  type AppContext,
  type Env,
  type ExamRow,
} from "./core.js";
import { summaries, purgePreview, type AttemptRow } from "./attempts.js";
import { analysis } from "./monitor.js";
/** Records a teacher action made from the CLI or the workspace. */
async function teacherEvent(
  c: AppContext,
  event: string,
  properties: Record<string, unknown>,
) {
  if (!c.env.POSTHOG_KEY) return;
  const identity = await account(c);
  if (!identity) return;
  capture(c.env, background(c), event, {
    distinct_id: await analyticsId(c.env, identity.provider, identity.subject),
    app_area: "teacher",
    client: c.req.header("Authorization") ? "cli" : "web",
    ...properties,
  });
}
export const teachers = new Hono<{ Bindings: Env }>();
teachers.post("/api/teacher/session", async (c) => {
  const tid = await teacher(c),
    credential = token();
  await c.env.DB.prepare("INSERT INTO management_sessions VALUES(?,?,?)")
    .bind(await sha256Hex(credential), tid, Date.now() + 8 * 3600000)
    .run();
  setCookie(c, "myriad_teacher", credential, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/api",
    maxAge: 8 * 3600,
  });
  return c.json({ teacherId: tid });
});
teachers.delete("/api/teacher/session", async (c) => {
  await teacher(c);
  const cookie = c.req
    .header("Cookie")
    ?.match(/(?:^|;\s*)myriad_teacher=([^;]+)/)?.[1];
  if (cookie)
    await c.env.DB.prepare("DELETE FROM management_sessions WHERE hash=?")
      .bind(await sha256Hex(cookie))
      .run();
  const oauth = c.req
    .header("Cookie")
    ?.match(/(?:^|;\s*)myriad_student=([^;]+)/)?.[1];
  if (oauth)
    await c.env.DB.prepare("DELETE FROM student_sessions WHERE hash=?")
      .bind(await sha256Hex(oauth))
      .run();
  deleteCookie(c, "myriad_student", { path: "/" });
  deleteCookie(c, "myriad_teacher", { path: "/api" });
  return c.json({ loggedOut: true });
});
teachers.get("/api/teacher/exams", async (c) => {
  const tid = await teacher(c);
  return c.json(
    (
      await c.env.DB.prepare(
        "SELECT e.id,e.title,e.starts_at AS startsAt,e.ends_at AS endsAt,e.revision,e.owner_id AS ownerId FROM exam_catalog e WHERE e.owner_id=? OR EXISTS(SELECT 1 FROM exam_collaborators m WHERE m.exam_id=e.id AND m.account_id=?) ORDER BY e.starts_at DESC",
      )
        .bind(tid, tid)
        .all()
    ).results,
  );
});
/** Stores an upload. Uploads are allowed at any time and only become current on publish. */
teachers.post("/api/teacher/exams/:eid/revisions", async (c) => {
  const tid = await teacher(c);
  const bundle = await validateBundle(await c.req.json()).catch((error) =>
    fail(error instanceof Error ? error.message : "Invalid bundle"),
  );
  const content = bundle.content;
  if (content.exam.id !== c.req.param("eid")) fail("Exam ID mismatch");
  const prior = await c.env.DB.prepare("SELECT id FROM exam_catalog WHERE id=?")
    .bind(content.exam.id)
    .first();
  if (!prior) {
    await requireCreator(c, tid);
    await c.env.DB.prepare(
      "INSERT INTO exam_catalog(id,owner_id,title,starts_at,ends_at,rules,policy) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
    )
      .bind(
        content.exam.id,
        tid,
        content.exam.title,
        content.exam.startsAt,
        content.exam.endsAt,
        content.exam.rules,
        content.exam.policy,
      )
      .run();
  }
  const e = await exam(c, true);
  const existing = await c.env.DB.prepare(
    "SELECT revision FROM exam_revisions WHERE exam_id=? AND revision=?",
  )
    .bind(e.id, bundle.revision)
    .first();
  if (!existing) {
    // Tests are stored per problem version, so unchanged problems reuse their objects.
    for (const p of content.problems)
      for (const input of content.inputs.filter((i) => i.problemId === p.id)) {
        const key = inputKey(e.id, p.id, p.version, input.index);
        if (!(await c.env.BUCKET.head(key)))
          await c.env.BUCKET.put(key, input.content);
      }
    const key = `bundles/${e.id}/${bundle.revision}.json`;
    await c.env.BUCKET.put(key, canonicalJson(bundle));
    // The manifest drives judging and student views; solutions stay only in the stored upload.
    const { solutions: _solutions, ...judged } = content;
    const stored = {
      ...judged,
      inputs: content.inputs.map(({ content: _, ...input }) => input),
    };
    await c.env.DB.prepare(
      "INSERT INTO exam_revisions VALUES(?,?,?,?,?) ON CONFLICT(exam_id,revision) DO NOTHING",
    )
      .bind(e.id, bundle.revision, key, JSON.stringify(stored), Date.now())
      .run();
  }
  forgetExam(e.id);
  await teacherEvent(c, "exam_revision_uploaded", {
    exam_id: e.id,
    created_exam: !prior,
    new_revision: !existing,
    problem_count: content.problems.length,
  });
  return c.json({
    examId: e.id,
    revision: bundle.revision,
    currentRevision: e.revision,
    staged: true,
  });
});
/**
 * Makes an upload current. The uploaded exam settings replace the site's, and
 * the replaced settings and problem versions are returned so the CLI can report them.
 */
teachers.post(
  "/api/teacher/exams/:eid/revisions/:revision/publish",
  async (c) => {
    const e = await exam(c, true);
    const { expectedRevision } = z
      .object({
        expectedRevision: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable(),
      })
      .strict()
      .parse(await c.req.json());
    if (e.revision !== expectedRevision)
      fail("Exam changed; review the current revision before publishing", 409);
    const r = await c.env.DB.prepare(
      "SELECT manifest FROM exam_revisions WHERE exam_id=? AND revision=?",
    )
      .bind(e.id, c.req.param("revision"))
      .first<{ manifest: string }>();
    if (!r) fail("Revision not staged", 404);
    if (
      JSON.parse(r.manifest).problems.some(
        (p: { semanticCheck?: string }) => p.semanticCheck,
      ) &&
      !c.env.OPENAI_API_KEY
    )
      fail("Configure OPENAI_API_KEY before publishing semantic checks", 503);
    const previous = e.revision
      ? {
          metadata: {
            title: e.title,
            startsAt: e.starts_at,
            endsAt: e.ends_at,
            rules: e.rules,
            policy: e.policy,
          },
          problems: manifest(e).problems.map((p) => ({
            id: p.id,
            version: (p as { version?: string }).version ?? null,
          })),
        }
      : null;
    const m = JSON.parse(r.manifest);
    const published = await c.env.DB.prepare(
      "UPDATE exam_catalog SET revision=?,manifest=?,title=?,starts_at=?,ends_at=?,rules=?,policy=?,published_at=? WHERE id=? AND owner_id=? AND revision IS ? RETURNING id",
    )
      .bind(
        c.req.param("revision"),
        r.manifest,
        m.exam.title,
        m.exam.startsAt,
        m.exam.endsAt,
        m.exam.rules,
        m.exam.policy,
        Date.now(),
        e.id,
        e.owner_id,
        expectedRevision,
      )
      .first();
    if (!published)
      fail("Exam changed; review the current revision before publishing", 409);
    forgetExam(e.id);
    await teacherEvent(c, "exam_published", {
      exam_id: e.id,
      first_publish: !previous,
      problem_count: m.problems.length,
      has_semantic_check: m.problems.some(
        (p: { semanticCheck?: string }) => p.semanticCheck,
      ),
    });
    return c.json({
      examId: e.id,
      revision: c.req.param("revision"),
      url: `/exams/${e.id}`,
      previous,
    });
  },
);
/** Read-only exam detail for the teacher workspace and `myriad status`. */
teachers.get("/api/teacher/exams/:eid", async (c) => {
  const e = await exam(c, true),
    now = Date.now();
  const problems = e.manifest
    ? manifest(e).problems.map((p) => ({
        id: p.id,
        order: p.order,
        title: p.title,
        testCount: p.testCount,
        groups: p.groups.length,
        version: (p as { version?: string }).version ?? null,
      }))
    : [];
  return c.json({
    id: e.id,
    ownerId: e.owner_id,
    canManageMembers: e.owner_id === (await teacher(c)),
    title: e.title,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    rules: e.rules,
    policy: e.policy,
    status:
      now < e.starts_at ? "upcoming" : now >= e.ends_at ? "ended" : "active",
    revision: e.revision,
    publishedAt: e.published_at,
    problems,
  });
});
/**
 * The current upload, every earlier upload and the site's exam settings, so a
 * teacher can recreate the exam directory, edit it and upload again. Stored
 * uploads are concatenated as written; nothing is parsed or recomputed.
 */
teachers.get("/api/teacher/exams/:eid/export", async (c) => {
  const e = await exam(c, true);
  if (!e.revision) fail("Exam has not been published", 404);
  const rows = await c.env.DB.prepare(
    "SELECT bundle_key FROM exam_revisions WHERE exam_id=? ORDER BY staged_at",
  )
    .bind(e.id)
    .all<{ bundle_key: string }>();
  const bundles: string[] = [];
  for (const row of rows.results) {
    const object = await c.env.BUCKET.get(row.bundle_key);
    if (!object) fail("Stored upload missing", 503);
    bundles.push(await object.text());
  }
  const head = JSON.stringify({
    format: "myriad-export-v1",
    examId: e.id,
    settings: {
      title: e.title,
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      rules: e.rules,
      policy: e.policy,
    },
    current: e.revision,
  });
  c.header("Content-Type", "application/json; charset=utf-8");
  c.header("Content-Disposition", `attachment; filename="${e.id}-export.json"`);
  return c.body(`${head.slice(0, -1)},"bundles":[${bundles.join(",")}]}`);
});
const ExamSettingsPatch = z
  .object({
    title: z.string().trim().min(1).max(200),
    startsAt: z.number().int().positive(),
    endsAt: z.number().int().positive(),
    rules: z.string().max(20000),
    policy: z.enum(["best", "last"]),
  })
  .partial()
  .strict();
/** Exam settings edited on the site take effect immediately; the next upload replaces them. */
teachers.patch("/api/teacher/exams/:eid", async (c) => {
  const e = await exam(c, true),
    patch = ExamSettingsPatch.parse(await c.req.json());
  const next = {
    title: patch.title ?? e.title,
    startsAt: patch.startsAt ?? e.starts_at,
    endsAt: patch.endsAt ?? e.ends_at,
    rules: patch.rules ?? e.rules,
    policy: patch.policy ?? e.policy,
  };
  if (next.endsAt <= next.startsAt) fail("結束時間必須晚於開始時間");
  await c.env.DB.prepare(
    "UPDATE exam_catalog SET title=?,starts_at=?,ends_at=?,rules=?,policy=? WHERE id=? AND owner_id=?",
  )
    .bind(
      next.title,
      next.startsAt,
      next.endsAt,
      next.rules,
      next.policy,
      e.id,
      e.owner_id,
    )
    .run();
  forgetExam(e.id);
  return c.json(next);
});
teachers.get("/api/teacher/exams/:eid/submissions", async (c) => {
  const e = await exam(c, true),
    { after, limit } = page(c);
  await purgePreview(c.env.DB, e);
  const max = await c.env.DB.prepare(
    "SELECT COALESCE(MAX(sequence),0) AS n FROM attempts WHERE exam_id=? AND status='complete' AND preview=0",
  )
    .bind(e.id)
    .first<{ n: number }>();
  const snapshot = Number(c.req.query("snapshot") ?? max!.n);
  if (!Number.isSafeInteger(snapshot) || snapshot < 0 || snapshot > max!.n)
    fail("Invalid snapshot");
  const rows = await c.env.DB.prepare(
    "SELECT * FROM attempts WHERE exam_id=? AND status='complete' AND preview=0 AND sequence>? AND sequence<=? ORDER BY sequence LIMIT ?",
  )
    .bind(e.id, after, snapshot, limit + 1)
    .all<AttemptRow>();
  const selected = rows.results.slice(0, limit);
  const summarized = await summaries(c.env.DB, selected);
  const submissions = await Promise.all(
    selected.map(async (a, i) => ({
      ...summarized[i],
      sequence: a.sequence,
      code: a.code,
      codeSha256: a.code_sha256,
      deviceId: a.device_id,
      claims: (
        await c.env.DB.prepare(
          "SELECT claim FROM attempt_claims WHERE attempt_id=? ORDER BY idx",
        )
          .bind(a.id)
          .all<{ claim: string }>()
      ).results.map((r) => JSON.parse(r.claim)),
    })),
  );
  return c.json({
    revision: e.revision,
    policy: e.policy,
    snapshot,
    submissions,
    hasMore: rows.results.length > limit,
    nextCursor: selected.at(-1)?.sequence ?? after,
  });
});
/** Source is fetched only when a teacher opens an individual submission. */
teachers.get("/api/teacher/exams/:eid/submissions/:aid", async (c) => {
  const e = await exam(c, true);
  const row = await c.env.DB.prepare(
    "SELECT code,result FROM attempts WHERE exam_id=? AND id=? AND preview=0",
  )
    .bind(e.id, c.req.param("aid"))
    .first<{ code: string; result: string | null }>();
  if (!row) fail("Submission not found", 404);
  return c.json({
    code: row.code,
    semanticCheck: row.result
      ? JSON.parse(row.result).semanticCheck
      : undefined,
  });
});
teachers.get("/api/teacher/exams/:eid/analysis", async (c) =>
  c.json(await analysis(c)),
);
teachers.get("/api/teacher/exams/:eid/telemetry", async (c) => {
  const e = await exam(c, true),
    { after, limit } = page(c);
  const rows = await c.env.DB.prepare(
    "SELECT sequence,event,received_at,user_agent FROM browser_telemetry WHERE exam_id=? AND sequence>? ORDER BY sequence LIMIT ?",
  )
    .bind(e.id, after, limit + 1)
    .all<{
      sequence: number;
      event: string;
      received_at: number;
      user_agent: string | null;
    }>();
  return c.json({
    events: rows.results.slice(0, limit).map((r) => ({
      ...JSON.parse(r.event),
      sequence: r.sequence,
      receivedAt: r.received_at,
      userAgent: r.user_agent,
    })),
    hasMore: rows.results.length > limit,
    nextCursor: rows.results.slice(0, limit).at(-1)?.sequence ?? after,
  });
});
teachers.post("/api/teacher/exams/:eid/results", async (c) => {
  const e = await exam(c, true),
    m = manifest(e),
    report = VerificationReportSchema.parse(await c.req.json());
  if (Date.now() < e.ends_at)
    fail("Wait until the exam ends before uploading final verification", 409);
  const all = (
    await c.env.DB.prepare(
      "SELECT * FROM attempts WHERE exam_id=? AND status='complete' AND preview=0 ORDER BY sequence",
    )
      .bind(e.id)
      .all<AttemptRow>()
  ).results;
  if (
    report.examId !== e.id ||
    report.policy !== e.policy ||
    report.snapshot !== (all.at(-1)?.sequence ?? 0) ||
    report.submissions.length !== all.length ||
    new Set(report.submissions.map((s) => s.id)).size !== all.length
  )
    fail("Report does not match the complete published snapshot", 409);
  // Each submission is checked against the upload it was judged on.
  const manifests = new Map<
    string,
    Awaited<ReturnType<typeof revisionManifest>>
  >();
  for (const revision of new Set(all.map((a) => a.revision)))
    manifests.set(revision, await revisionManifest(c.env.DB, e.id, revision));
  const verified = report.submissions.map((s) => {
    const a = all.find((a) => a.id === s.id),
      p =
        a &&
        manifests.get(a.revision)!.problems.find((p) => p.id === a.problem_id);
    if (
      !a ||
      !p ||
      a.code_sha256 !== s.codeSha256 ||
      s.problemVersion !== a.problem_version ||
      s.verdicts.length !== p.testCount ||
      new Set(s.verdicts.map((v) => v.index)).size !== p.testCount ||
      s.verdicts.some((v) => v.index >= p.testCount)
    )
      fail("Invalid submission verification", 409);
    const saved = a.result ? JSON.parse(a.result) : {};
    if (p.semanticCheck && typeof saved.semanticCheck?.passed !== "boolean")
      fail("Missing semantic verdict", 409);
    const tests = computeGroupVerdicts(p.groups, s.verdicts);
    return {
      studentId: a.student_id,
      participantId: a.participant_id,
      identityKind: a.identity_kind,
      problemId: a.problem_id,
      sequence: a.sequence,
      ...s,
      ...tests,
      ...(p.semanticCheck
        ? {
            semanticCheck: saved.semanticCheck,
            testScore: tests.score,
            score: saved.semanticCheck.passed ? tests.score : 0,
          }
        : {}),
    };
  });
  const scores = [...new Set(all.map((a) => a.participant_id))]
    .sort()
    .map((participantId) => {
      const owner = all.find((a) => a.participant_id === participantId)!;
      const problems = m.problems.map((p) => {
        const candidates = verified
          .filter(
            (v) => v.participantId === participantId && v.problemId === p.id,
          )
          .sort((a, b) =>
            e.policy === "last"
              ? b.sequence - a.sequence
              : b.score - a.score || b.sequence - a.sequence,
          );
        return {
          problemId: p.id,
          score: candidates[0]?.score ?? 0,
          submissionId: candidates[0]?.id ?? null,
        };
      });
      return {
        studentId: owner.student_id,
        participantId,
        identityKind: owner.identity_kind,
        problems,
        totalScore:
          (100 * problems.reduce((n, p) => n + p.score, 0)) / m.problems.length,
      };
    });
  const revision = await sha256Hex(canonicalJson(report));
  await c.env.DB.prepare(
    "INSERT INTO result_reports VALUES(?,?,?,?,?) ON CONFLICT(exam_id,revision) DO NOTHING",
  )
    .bind(
      e.id,
      revision,
      JSON.stringify(report),
      JSON.stringify(scores),
      Date.now(),
    )
    .run();
  await teacherEvent(c, "exam_results_verified", {
    exam_id: e.id,
    participant_count: scores.length,
    dispute_count: verified.filter((v) => v.classification === "DISPUTED")
      .length,
  });
  return c.json({
    revision,
    scores,
    disputes: verified.filter((v) => v.classification === "DISPUTED").length,
  });
});
teachers.get("/api/teacher/exams/:eid/results", async (c) => {
  const e = await exam(c, true);
  const rows = await c.env.DB.prepare(
    "SELECT revision,report,scores,uploaded_at AS uploadedAt FROM result_reports WHERE exam_id=? ORDER BY uploaded_at DESC",
  )
    .bind(e.id)
    .all<{
      revision: string;
      report: string;
      scores: string;
      uploadedAt: number;
    }>();
  return c.json({
    reports: rows.results.map((r) => ({
      ...r,
      report: JSON.parse(r.report),
      scores: JSON.parse(r.scores),
    })),
  });
});
teachers.put("/api/admin/toolchains/*", async (c) => {
  await requireAdmin(c);
  const key = c.req.path.slice("/api/admin/".length);
  if (key.includes("..") || !/^toolchains\/[a-zA-Z0-9_./-]+$/.test(key))
    fail("Invalid asset path");
  const data = await c.req.arrayBuffer(),
    digest = await sha256Hex(new Uint8Array(data));
  const existing = await c.env.BUCKET.get(key);
  if (
    existing &&
    (await sha256Hex(new Uint8Array(await existing.arrayBuffer()))) !== digest
  )
    fail("Toolchain assets are immutable", 409);
  if (!existing)
    await c.env.BUCKET.put(key, data, {
      httpMetadata: {
        contentType: c.req.header("content-type") ?? "application/octet-stream",
      },
    });
  return c.json({ key, digest });
});
