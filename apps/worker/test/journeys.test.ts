import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import {
  canonicalJson,
  sha256Hex,
  problemVersion,
  type BundleContent,
  TOOLCHAIN,
} from "@myriad/shared";
let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
let teacherToken: string;
let secondToken: string;
let revision: string;
let version: string;
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  token?: string,
) {
  return mf.dispatchFetch(`http://localhost${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function bundle(
  id: string,
  options: {
    tests?: string;
    statement?: string;
    startsAt?: number;
    solution?: string;
  } = {},
) {
  const tests = options.tests ?? id;
  const problem = {
    id: "p",
    order: 0,
    title: "Problem",
    statementMd: options.statement ?? "SECRET STATEMENT",
    testCount: 2,
    groups: [{ name: "all", tests: [0, 1] }],
    limits: {
      instructionBudget: 1000,
      logicalTimeLimitMs: 1000,
      memoryMb: 128,
      outputLimitBytes: 1024,
    },
    normalize: "trim" as const,
    sampleCases: [{ input: "SECRET", output: "SECRET" }],
  };
  const inputs = await Promise.all(
    [0, 1].map(async (index) => ({
      problemId: "p",
      index,
      content: tests,
      sha256: await sha256Hex(tests),
      expectedDigest: "a".repeat(64),
    })),
  );
  const content: BundleContent = {
    format: "myriad-bundle-v3",
    toolchain: `${TOOLCHAIN.id}@${TOOLCHAIN.version}`,
    exam: {
      id,
      title: id,
      startsAt: options.startsAt ?? Date.now() + 600000,
      endsAt: Date.now() + 3600000,
      rules: "Rules",
      policy: "best",
      salt: "test-salt-at-least-16",
    },
    problems: [{ ...problem, version: await problemVersion(problem, inputs) }],
    inputs,
    ...(options.solution
      ? { solutions: [{ problemId: "p", source: options.solution }] }
      : {}),
    validation: { passed: true, completedAt: Date.now(), tests: 2 },
  };
  return { revision: await sha256Hex(canonicalJson(content)), content };
}
async function publish(id: string, options?: Parameters<typeof bundle>[1]) {
  const b = await bundle(id, options);
  expect(
    (await call(`/api/teacher/exams/${id}/revisions`, "POST", b, teacherToken))
      .status,
  ).toBe(200);
  const published = await call(
    `/api/teacher/exams/${id}/revisions/${b.revision}/publish`,
    "POST",
    undefined,
    teacherToken,
  );
  expect(published.status).toBe(200);
  return {
    revision: b.revision,
    version: b.content.problems[0].version,
    previous: ((await published.json()) as any).previous,
  };
}
async function active(id: string) {
  await db
    .prepare("UPDATE exam_catalog SET starts_at=? WHERE id=?")
    .bind(Date.now() - 1000, id)
    .run();
}
function request(student = "student") {
  return {
    operationId: crypto.randomUUID(),
    problemVersion: version,
    problemId: "p",
    studentId: student,
    identityKind: "guest",
    deviceId: crypto.randomUUID(),
    code: "int main(){}",
  };
}
async function connect(aid: string, token: string) {
  const response = await mf.dispatchFetch(
    `http://localhost/api/exams/first/attempts/${aid}/ws`,
    { headers: { Upgrade: "websocket" } },
  );
  const ws = response.webSocket!;
  expect(ws).toBeTruthy();
  ws.accept();
  const messages: any[] = [];
  const waiters: {
    predicate: (m: any) => boolean;
    resolve: (m: any) => void;
    reject: (e: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(String(e.data));
    messages.push(m);
    for (const w of [...waiters])
      if (w.predicate(m)) {
        clearTimeout(w.timer);
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(m);
      }
  });
  function wait(predicate: (m: any) => boolean): Promise<any> {
    const found = messages.find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new Error(`WebSocket timeout: ${JSON.stringify(messages)}`)),
        5000,
      );
      waiters.push({ predicate, resolve, reject, timer });
    });
  }
  ws.send(JSON.stringify({ type: "auth", token }));
  await wait((m) => m.type === "ready");
  return { ws, wait, messages };
}
beforeAll(async () => {
  const result = await build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
  });
  mf = new Miniflare({
    modules: true,
    script: result.outputFiles[0].text,
    compatibilityDate: "2024-10-01",
    d1Databases: ["DB"],
    r2Buckets: ["BUCKET"],
    bindings: {
      ADMIN_TOKEN: "root-secret",
      ATTEMPT_SECRET: "secret-for-tests-must-be-at-least-32-bytes",
    },
  });
  db = await mf.getD1Database("DB");
  for (const file of (await readdir("migrations")).sort()) {
    const sql = (await readFile(`migrations/${file}`, "utf8")).replace(
      /--[^\n]*/g,
      "",
    );
    for (const statement of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.prepare(statement).run();
  }
  teacherToken = (
    (await (
      await call(
        "/api/admin/teachers",
        "POST",
        { name: "Teacher" },
        "root-secret",
      )
    ).json()) as any
  ).token;
  secondToken = (
    (await (
      await call(
        "/api/admin/teachers",
        "POST",
        { name: "Other" },
        "root-secret",
      )
    ).json()) as any
  ).token;
}, 30000);
afterAll(async () => {
  await mf?.dispose();
});
describe.sequential("real Worker / D1 journeys", () => {
  it("publishes separate revisions and hides all problem content before start", async () => {
    ({ revision, version } = await publish("first"));
    const second = (await publish("second")).version;
    const publicData = (await (await call("/api/exams/first")).json()) as any;
    expect(publicData.problems).toEqual([]);
    expect(JSON.stringify(publicData)).not.toContain("SECRET");
    expect(
      (await call(`/api/exams/first/problems/p/versions/${version}/tests/0`))
        .status,
    ).toBe(403);
    await active("first");
    await active("second");
    expect(
      await (
        await call(`/api/exams/first/problems/p/versions/${version}/tests/0`)
      ).text(),
    ).toBe("first");
    expect(
      await (
        await call(`/api/exams/second/problems/p/versions/${second}/tests/0`)
      ).text(),
    ).toBe("second");
    expect(
      (await call(`/api/exams/first/problems/p/versions/${second}/tests/0`))
        .status,
    ).toBe(404);
    expect(
      (
        await call(
          "/api/teacher/exams/first/analysis",
          "GET",
          undefined,
          secondToken,
        )
      ).status,
    ).toBe(404);
    expect((await call("/api/exam")).status).toBe(404);
  });
  it("reserves cooldown atomically and returns the same attempt on retry", async () => {
    const req = request("parallel");
    const responses = await Promise.all([
      call("/api/exams/first/attempts", "POST", req),
      call("/api/exams/first/attempts", "POST", {
        ...req,
        operationId: crypto.randomUUID(),
      }),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 429]);
    const winner = (await responses
      .find((r) => r.status === 201)!
      .json()) as any;
    const same = { ...req, operationId: winner.attempt.id };
    const replay = (await (
      await call("/api/exams/first/attempts", "POST", same)
    ).json()) as any;
    expect(replay.token).toBe(winner.token);
    expect(replay.attempt.id).toBe(winner.attempt.id);
    expect(
      (
        await call("/api/exams/first/attempts", "POST", {
          ...same,
          code: "changed",
        })
      ).status,
    ).toBe(409);
  });
  it("persists claims across sockets, deduplicates and finalizes exactly once", async () => {
    const req = request("resume");
    const created = (await (
      await call("/api/exams/first/attempts", "POST", req)
    ).json()) as any;
    const first = await connect(created.attempt.id, created.token);
    first.ws.send(
      JSON.stringify({ type: "claim", claim: { index: 0, status: "re" } }),
    );
    await first.wait((m) => m.type === "verdict");
    first.ws.close();
    const next = await connect(created.attempt.id, created.token);
    expect(
      next.messages.find((m) => m.type === "ready").attempt.verdicts,
    ).toHaveLength(1);
    next.ws.send(
      JSON.stringify({ type: "claim", claim: { index: 0, status: "re" } }),
    );
    next.ws.send(
      JSON.stringify({ type: "claim", claim: { index: 1, status: "re" } }),
    );
    next.ws.send(JSON.stringify({ type: "finish" }));
    await next.wait((m) => m.attempt?.status === "complete");
    next.ws.close();
    const summary = (await (
      await call(`/api/exams/first/attempts/${req.operationId}`)
    ).json()) as any;
    expect(summary.status).toBe("complete");
    expect(summary.verdicts).toHaveLength(2);
    expect(summary).not.toHaveProperty("code");
    expect(summary).not.toHaveProperty("deviceId");
    expect(
      (await db
        .prepare("SELECT COUNT(*) AS n FROM attempts WHERE id=?")
        .bind(req.operationId)
        .first<{ n: number }>())!.n,
    ).toBe(1);
  });
  it("rejects conflicting claims and expiry even on an existing socket", async () => {
    const req = request("conflict");
    const created = (await (
      await call("/api/exams/first/attempts", "POST", req)
    ).json()) as any;
    const c = await connect(req.operationId, created.token);
    c.ws.send(
      JSON.stringify({ type: "claim", claim: { index: 0, status: "re" } }),
    );
    await c.wait((m) => m.type === "verdict");
    c.ws.send(
      JSON.stringify({ type: "claim", claim: { index: 0, status: "tle" } }),
    );
    expect((await c.wait((m) => m.type === "error")).error).toContain(
      "Conflicting",
    );
    c.ws.close();
    const req2 = request("expiry");
    const c2 = (await (
      await call("/api/exams/first/attempts", "POST", req2)
    ).json()) as any;
    const s = await connect(req2.operationId, c2.token);
    await db
      .prepare("UPDATE attempts SET expires_at=? WHERE id=?")
      .bind(Date.now() - 1, req2.operationId)
      .run();
    s.ws.send(
      JSON.stringify({ type: "claim", claim: { index: 0, status: "re" } }),
    );
    expect(
      (await s.wait((m) => m.attempt?.status === "expired")).attempt.verdicts,
    ).toHaveLength(0);
    s.ws.close();
  });
  it("replaces problems during the exam while each attempt keeps the version it started on", async () => {
    const started = request("inflight");
    const inflight = (await (
      await call("/api/exams/first/attempts", "POST", started)
    ).json()) as any;
    const socket = await connect(inflight.attempt.id, inflight.token);
    // A statement-only change keeps the version, so students are not interrupted.
    const typo = await publish("first", {
      statement: "Fixed statement",
      startsAt: Date.now() - 60000,
    });
    expect(typo.version).toBe(version);
    expect(typo.previous.problems).toEqual([{ id: "p", version }]);
    expect(
      (await call("/api/exams/first/attempts", "POST", request("typo"))).status,
    ).toBe(201);
    // New tests make a new version; copies of the old one must reload.
    const fixed = await publish("first", {
      tests: "first-v2",
      statement: "Fixed statement",
      startsAt: Date.now() - 60000,
    });
    expect(fixed.version).not.toBe(version);
    expect(
      (await call("/api/exams/first/attempts", "POST", request("stale")))
        .status,
    ).toBe(409);
    const current = (await (await call("/api/exams/first")).json()) as any;
    expect(current.problems[0].version).toBe(fixed.version);
    expect(current.problems[0].statementMd).toBe("Fixed statement");
    const fresh = {
      ...request("fresh"),
      problemVersion: fixed.version,
    };
    const created = (await (
      await call("/api/exams/first/attempts", "POST", fresh)
    ).json()) as any;
    expect(created.attempt.problemVersion).toBe(fixed.version);
    expect(created.attempt.revision).toBe(fixed.revision);
    // Both versions' tests stay readable while the exam is open.
    expect(
      await (
        await call(`/api/exams/first/problems/p/versions/${version}/tests/0`)
      ).text(),
    ).toBe("first");
    expect(
      await (
        await call(
          `/api/exams/first/problems/p/versions/${fixed.version}/tests/0`,
        )
      ).text(),
    ).toBe("first-v2");
    // The attempt started before the replacement finishes on its own upload.
    for (const index of [0, 1])
      socket.ws.send(
        JSON.stringify({ type: "claim", claim: { index, status: "re" } }),
      );
    socket.ws.send(JSON.stringify({ type: "finish" }));
    const done = await socket.wait((m) => m.attempt?.status === "complete");
    expect(done.attempt.problemVersion).toBe(version);
    expect(done.attempt.revision).toBe(revision);
    socket.ws.close();
  });
  it("edits exam settings on the site immediately and reports them when an upload replaces them", async () => {
    const patch = (body: unknown, token = teacherToken) =>
      call("/api/teacher/exams/first", "PATCH", body, token);
    const endsAt = Date.now() + 7200000;
    expect((await patch({ startsAt: endsAt + 1 })).status).toBe(400);
    expect((await patch({ rules: "x" }, secondToken)).status).toBe(404);
    expect(
      (
        await patch({
          title: "Renamed",
          endsAt,
          rules: "Bring a pencil",
          policy: "last",
        })
      ).status,
    ).toBe(200);
    const student = (await (await call("/api/exams/first")).json()) as any;
    expect([
      student.title,
      student.endsAt,
      student.rules,
      student.policy,
    ]).toEqual(["Renamed", endsAt, "Bring a pencil", "last"]);
    const detail = (await (
      await call("/api/teacher/exams/first", "GET", undefined, teacherToken)
    ).json()) as any;
    expect(detail.status).toBe("active");
    expect(detail.problems[0]).toMatchObject({
      id: "p",
      testCount: 2,
      groups: 1,
    });
    const replaced = await publish("first", {
      tests: "first-v2",
      startsAt: Date.now() - 60000,
    });
    expect(replaced.previous.metadata).toMatchObject({
      title: "Renamed",
      endsAt,
      rules: "Bring a pencil",
      policy: "last",
    });
    const after = (await (await call("/api/exams/first")).json()) as any;
    expect([after.title, after.rules, after.policy]).toEqual([
      "first",
      "Rules",
      "best",
    ]);
  });
  it("keeps verification reports private after the exam across problem versions", async () => {
    await db
      .prepare("UPDATE exam_catalog SET ends_at=? WHERE id='first'")
      .bind(Date.now() - 1)
      .run();
    const exported = (await (
      await call(
        "/api/teacher/exams/first/submissions",
        "GET",
        undefined,
        teacherToken,
      )
    ).json()) as any;
    const report = {
      examId: "first",
      revision,
      policy: "best",
      snapshot: exported.snapshot,
      completedAt: Date.now(),
      submissions: exported.submissions.map((s: any) => ({
        id: s.id,
        codeSha256: s.codeSha256,
        problemVersion: s.problemVersion,
        verdicts: s.verdicts,
        classification: "CONFIRMED",
      })),
    };
    expect(
      (
        await call(
          "/api/teacher/exams/first/results",
          "POST",
          { ...report, submissions: [] },
          teacherToken,
        )
      ).status,
    ).toBe(409);
    const uploaded = (await (
      await call(
        "/api/teacher/exams/first/results",
        "POST",
        report,
        teacherToken,
      )
    ).json()) as any;
    expect(
      uploaded.scores.find((s: any) => s.studentId === "resume").totalScore,
    ).toBe(0);
    expect((await call("/api/exams/first/results?student=resume")).status).toBe(
      404,
    );
    expect(
      (
        await call(
          `/api/teacher/exams/first/results/${uploaded.revision}/publish`,
          "POST",
          undefined,
          teacherToken,
        )
      ).status,
    ).toBe(404);
    expect(
      (await call("/api/exams/first/submissions?student=resume")).status,
    ).toBe(403);
    expect(
      (await call(`/api/exams/first/attempts/${exported.submissions[0].id}`))
        .status,
    ).toBe(403);
    expect(
      (await call(`/api/exams/first/problems/p/versions/${version}/tests/0`))
        .status,
    ).toBe(403);
    const ended = (await (await call("/api/exams/first")).json()) as any;
    expect(ended.status).toBe("ended");
    expect(ended.problems).toEqual([]);
    expect(ended).not.toHaveProperty("resultsPublished");
    expect(
      ((await (await call("/api/exams")).json()) as any[]).some(
        (e) => e.id === "first",
      ),
    ).toBe(false);
    const privateReport = (await (
      await call(
        "/api/teacher/exams/first/results",
        "GET",
        undefined,
        teacherToken,
      )
    ).json()) as any;
    expect(privateReport.reports).toHaveLength(1);
    expect((await call("/api/teacher/exams/first/results")).status).toBe(401);
  });
  it("supports empty exams, session CSRF protection and immediate teacher revocation", async () => {
    await db
      .prepare("UPDATE exam_catalog SET ends_at=? WHERE id='second'")
      .bind(Date.now() - 1)
      .run();
    const e = (await (await call("/api/exams/second")).json()) as any;
    const r = await call(
      "/api/teacher/exams/second/results",
      "POST",
      {
        examId: "second",
        revision: e.revision,
        policy: "best",
        snapshot: 0,
        completedAt: Date.now(),
        submissions: [],
      },
      teacherToken,
    );
    expect(r.status).toBe(200);
    const session = await call(
      "/api/teacher/session",
      "POST",
      undefined,
      teacherToken,
    );
    const cookie = session.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).toContain("myriad_teacher=");
    const csrf = await mf.dispatchFetch(
      "http://localhost/api/teacher/session",
      {
        method: "DELETE",
        headers: { Cookie: cookie, Origin: "https://evil.test" },
      },
    );
    expect(csrf.status).toBe(403);
    const t = (await (
      await call(
        "/api/admin/teachers",
        "POST",
        { name: "Revocable" },
        "root-secret",
      )
    ).json()) as any;
    expect(
      (await call("/api/teacher/exams", "GET", undefined, t.token)).status,
    ).toBe(200);
    await call(
      `/api/admin/teachers/${t.id}`,
      "DELETE",
      undefined,
      "root-secret",
    );
    expect(
      (await call("/api/teacher/exams", "GET", undefined, t.token)).status,
    ).toBe(401);
  });
  it("lets only the owning teacher preview before start and keeps preview work out of student data", async () => {
    const rehearsal = await publish("rehearsal");
    const session = async (token: string) =>
      (await call("/api/teacher/session", "POST", undefined, token)).headers
        .get("set-cookie")!
        .split(";")[0];
    const owner = await session(teacherToken),
      other = await session(secondToken);
    const as = (path: string, cookie?: string, init: RequestInit = {}) =>
      mf.dispatchFetch(`http://localhost${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost",
          ...(cookie ? { Cookie: cookie } : {}),
        },
      });
    expect((await as("/api/exams/rehearsal?preview=1")).status).toBe(403);
    expect((await as("/api/exams/rehearsal?preview=1", other)).status).toBe(
      403,
    );
    const student = (await (
      await as("/api/exams/rehearsal", owner)
    ).json()) as any;
    expect(student.problems).toEqual([]);
    const preview = (await (
      await as("/api/exams/rehearsal?preview=1", owner)
    ).json()) as any;
    expect(preview.preview).toBe(true);
    expect(preview.problems[0].statementMd).toBe("SECRET STATEMENT");
    const input = `/api/exams/rehearsal/problems/p/versions/${rehearsal.version}/tests/0`;
    expect((await as(input, owner)).status).toBe(403);
    expect(await (await as(`${input}?preview=1`, owner)).text()).toBe(
      "rehearsal",
    );
    const body = {
      ...request("teacher-check"),
      problemVersion: rehearsal.version,
    };
    const created = await as("/api/exams/rehearsal/attempts?preview=1", owner, {
      method: "POST",
      body: JSON.stringify(body),
    });
    expect(created.status).toBe(201);
    expect(
      (
        await as("/api/exams/rehearsal/attempts", owner, {
          method: "POST",
          body: JSON.stringify({ ...body, operationId: crypto.randomUUID() }),
        })
      ).status,
    ).toBe(403);
    const history = (path: string) =>
      as(
        `/api/exams/rehearsal/submissions?student=teacher-check&identityKind=guest${path}`,
        owner,
      ).then((r) => r.json() as Promise<any>);
    expect((await history("&preview=1")).submissions).toHaveLength(1);
    const analysis = async () =>
      (await (
        await call(
          "/api/teacher/exams/rehearsal/analysis",
          "GET",
          undefined,
          teacherToken,
        )
      ).json()) as any;
    expect((await analysis()).totals.attempts).toBe(0);
    // The preview happened before the exam; then the exam starts.
    await db
      .prepare("UPDATE attempts SET created_at=? WHERE exam_id='rehearsal'")
      .bind(Date.now() - 60000)
      .run();
    await active("rehearsal");
    expect((await history("")).submissions).toHaveLength(0);
    expect((await analysis()).totals.attempts).toBe(0);
    const remaining = await db
      .prepare("SELECT COUNT(*) AS n FROM attempts WHERE exam_id='rehearsal'")
      .first<{ n: number }>();
    expect(remaining?.n).toBe(0);
  });
  it("exports every upload with the site settings to the owner only, never exposing solutions", async () => {
    const first = await publish("exported", {
      solution: "SECRET SOLUTION v1",
      startsAt: Date.now() - 60000,
    });
    const second = await publish("exported", {
      tests: "exported-v2",
      solution: "SECRET SOLUTION v2",
      startsAt: Date.now() - 60000,
    });
    await call(
      "/api/teacher/exams/exported",
      "PATCH",
      { rules: "Edited on the site" },
      teacherToken,
    );
    const student = await (await call("/api/exams/exported")).text();
    expect(student).not.toContain("SECRET SOLUTION");
    const manifest = await db
      .prepare("SELECT manifest FROM exam_catalog WHERE id='exported'")
      .first<{ manifest: string }>();
    expect(manifest!.manifest).not.toContain("SECRET SOLUTION");
    expect(
      (
        await call(
          "/api/teacher/exams/exported/export",
          "GET",
          undefined,
          secondToken,
        )
      ).status,
    ).toBe(404);
    const response = await call(
      "/api/teacher/exams/exported/export",
      "GET",
      undefined,
      teacherToken,
    );
    expect(response.headers.get("content-disposition")).toContain(
      "exported-export.json",
    );
    const data = (await response.json()) as any;
    expect(data.current).toBe(second.revision);
    expect(data.settings.rules).toBe("Edited on the site");
    expect(data.bundles.map((b: any) => b.revision)).toEqual([
      first.revision,
      second.revision,
    ]);
    expect(data.bundles[1].content.solutions[0].source).toBe(
      "SECRET SOLUTION v2",
    );
  });
});
