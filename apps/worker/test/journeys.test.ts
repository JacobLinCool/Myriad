import { cCostProfile } from "../../../packages/shared/test/fixtures/cost-profile.js";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import {
  boundChecksum,
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
let semanticCalls = 0;
let semanticGate: Promise<void> | undefined;
let semanticOnRequest: (() => void) | undefined;
let semanticMode: "pass" | "fail" | "error" = "pass";
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
async function provision(name: string, creator = true) {
  const id = crypto.randomUUID(),
    credential = crypto.randomUUID();
  await db
    .prepare("INSERT INTO accounts VALUES(?,?,?,?)")
    .bind(id, "local", id, name)
    .run();
  await db
    .prepare("INSERT INTO account_tokens VALUES(?,?,?,?,NULL)")
    .bind(id, id, await sha256Hex(credential), Date.now())
    .run();
  if (creator)
    await db
      .prepare("INSERT INTO exam_creation_grants VALUES(?,?)")
      .bind(id, Date.now())
      .run();
  return { id, token: credential };
}
async function bundle(
  id: string,
  options: {
    tests?: string;
    statement?: string;
    startsAt?: number;
    solution?: string;
    semanticCheck?: string;
    template?: string;
  } = {},
) {
  const tests = options.tests ?? id;
  const problem = {
    id: "p",
    order: 0,
    title: "Problem",
    statementMd: options.statement ?? "SECRET STATEMENT",
    ...(options.semanticCheck ? { semanticCheck: options.semanticCheck } : {}),
    ...(options.template !== undefined ? { template: options.template } : {}),
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
  const staged = await call(
    `/api/teacher/exams/${id}/revisions`,
    "POST",
    b,
    teacherToken,
  );
  expect(staged.status).toBe(200);
  const { currentRevision } = (await staged.json()) as any;
  const published = await call(
    `/api/teacher/exams/${id}/revisions/${b.revision}/publish`,
    "POST",
    { expectedRevision: currentRevision },
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
async function connect(aid: string, token: string, examId = "first") {
  const response = await mf.dispatchFetch(
    `http://localhost/api/exams/${examId}/attempts/${aid}/ws`,
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
  await wait((m) => m.type === "ready" || m.type === "state");
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
    outboundService: async (req) => {
      expect(req.url).toBe("https://api.openai.com/v1/responses");
      const body = (await req.json()) as any;
      expect(body.model).toBe("gpt-5.6-luna");
      expect(body.reasoning.effort).toBe("low");
      semanticCalls++;
      semanticOnRequest?.();
      await semanticGate;
      if (semanticMode === "error")
        return new Response("unavailable", { status: 503 });
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  passed: semanticMode === "pass",
                  reason: semanticMode === "fail" ? "未使用指標。" : "",
                }),
              },
            ],
          },
        ],
      });
    },
    bindings: {
      OPENAI_API_KEY: "test-openai-key",
      ADMIN_TOKEN: "root-secret",
      ATTEMPT_SECRET: "secret-for-tests-must-be-at-least-32-bytes",
      // Journeys change exams directly in D1 and expect to see it at once.
      EXAM_CACHE_MS: "0",
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
  teacherToken = (await provision("Teacher")).token;
  secondToken = (await provision("Other")).token;
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
  it("finds a student's history and overdue attempts through their own indexes", async () => {
    const plan = async (sql: string) =>
      (await db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all<any>()).results
        .map((r) => r.detail)
        .join(" | ");
    expect(
      await plan(
        "SELECT * FROM attempts WHERE exam_id='first' AND participant_id='guest:a' AND preview=0 AND sequence>0 ORDER BY sequence LIMIT 501",
      ),
    ).toContain("attempts_participant_preview");
    expect(
      await plan(
        "UPDATE attempts SET status='expired' WHERE exam_id='first' AND status='running' AND expires_at<=1",
      ),
    ).toContain("attempts_running");
  });
  it("shows each device an identity submitted from, with the network the server saw", async () => {
    const submit = async (
      deviceId: string,
      ip: string,
      agent: string,
      student = "roaming",
    ) => {
      // Successive submissions from one identity wait out the cooldown.
      await db.prepare("DELETE FROM submission_cooldowns").run();
      const response = await mf.dispatchFetch(
        "http://localhost/api/exams/first/attempts",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "CF-Connecting-IP": ip,
            "User-Agent": agent,
          },
          body: JSON.stringify({ ...request(student), deviceId }),
        },
      );
      expect(response.status).toBe(201);
    };
    const [laptop, phone] = [crypto.randomUUID(), crypto.randomUUID()];
    await submit(laptop, "203.0.113.1", "Laptop/1");
    await submit(laptop, "203.0.113.2", "Laptop/1");
    await submit(phone, "198.51.100.7", "Phone/2");
    await submit(laptop, "203.0.113.1", "Laptop/1", "shared-device");
    const analysis = (await (
      await call(
        "/api/teacher/exams/first/analysis",
        "GET",
        undefined,
        teacherToken,
      )
    ).json()) as any;
    expect(analysis.devices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          deviceId: laptop,
          studentId: "shared-device",
          userAgent: "Laptop/1",
          userAgents: 1,
          ips: "203.0.113.1",
        }),
      ]),
    );
    const rows = analysis.identities.filter(
      (r: any) => r.studentId === "roaming",
    );
    expect(rows).toHaveLength(2);
    const byDevice = Object.fromEntries(rows.map((r: any) => [r.deviceId, r]));
    expect(byDevice[laptop]).toMatchObject({
      identityKind: "guest",
      submissions: 2,
      userAgents: 1,
      userAgent: "Laptop/1",
    });
    expect(byDevice[laptop].ips.split(",").sort()).toEqual([
      "203.0.113.1",
      "203.0.113.2",
    ]);
    expect(byDevice[phone]).toMatchObject({
      submissions: 1,
      ips: "198.51.100.7",
      userAgent: "Phone/2",
    });
    // A single-device identity is not listed.
    expect(
      analysis.identities.some((r: any) => r.studentId === "metrics"),
    ).toBe(false);
  });
  it("serves each teacher tab its own data without reading every claim", async () => {
    const get = async (path: string) => {
      const response = await call(
        `/api/teacher/exams/first${path}`,
        "GET",
        undefined,
        teacherToken,
      );
      expect(response.status).toBe(200);
      return (await response.json()) as any;
    };
    // tab-a passes every test; tab-b times out on every test.
    for (const student of ["tab-a", "tab-b"]) {
      await db.prepare("DELETE FROM submission_cooldowns").run();
      const created = (await (
        await call("/api/exams/first/attempts", "POST", request(student))
      ).json()) as any;
      const socket = await connect(created.attempt.id, created.token);
      for (const index of [0, 1])
        socket.ws.send(
          JSON.stringify({
            type: "claim",
            claim:
              student === "tab-a"
                ? {
                    index,
                    status: "ok",
                    checksum: await boundChecksum({
                      salt: "test-salt-at-least-16",
                      studentId: student,
                      problemId: "p",
                      index,
                      innerDigest: "a".repeat(64),
                    }),
                  }
                : { index, status: "tle" },
          }),
        );
      await socket.wait((m) => m.attempt?.status === "complete");
      socket.ws.close();
    }
    const overview = await get("/overview");
    expect(overview.totals.students).toBeGreaterThanOrEqual(2);
    const p = overview.problems.find(
      (r: any) => r.problemId === "p" && r.problemVersion === version,
    );
    expect(p.participants).toBeGreaterThanOrEqual(2);
    expect(p.passedParticipants).toBeGreaterThanOrEqual(1);
    expect(p.passedParticipants).toBeLessThan(p.participants);

    const page = await get("/students?q=tab-");
    expect(page.total).toBe(2);
    expect(page.students.map((s: any) => s.studentId)).toEqual([
      "tab-a",
      "tab-b",
    ]);
    expect(page.students[0].cells.p).toMatchObject({
      attempts: 1,
      latest: { status: "complete", passed: true, score: 1 },
      selected: { passed: true, score: 1 },
    });
    expect(page.students[1].cells.p).toMatchObject({
      latest: { status: "complete", passed: false },
      selected: { passed: false, score: 0 },
    });
    // LIKE wildcards in the query are literal.
    expect((await get("/students?q=tab%25")).total).toBe(0);

    const problem = await get("/problems/p/submissions");
    expect(problem.version).toBe(version);
    expect(
      problem.submissions.filter((s: any) => s.studentId.startsWith("tab-")),
    ).toHaveLength(2);
    expect(problem.submissions.every((s: any) => s.problemId === "p")).toBe(
      true,
    );
    expect(
      (
        await call(
          "/api/teacher/exams/first/problems/missing/submissions",
          "GET",
          undefined,
          teacherToken,
        )
      ).status,
    ).toBe(404);

    expect(await get("/devices")).toMatchObject({
      devices: expect.any(Array),
      identities: expect.any(Array),
    });
    expect((await get("/performance")).timings).toEqual(expect.any(Array));
    // The CLI still reads everything at once, with the same passed rule.
    const all = await get("/analysis");
    const mine = all.submissions.filter((s: any) =>
      s.studentId.startsWith("tab-"),
    );
    expect(mine.map((s: any) => [s.studentId, s.passed])).toEqual([
      ["tab-a", true],
      ["tab-b", false],
    ]);
  });
  it("records resource measurements and exposes private, accurate monitoring", async () => {
    const req = { ...request("metrics"), code: "// 測試\nint main(){}" };
    const created = (await (
      await call("/api/exams/first/attempts", "POST", req)
    ).json()) as any;
    const socket = await connect(created.attempt.id, created.token);
    for (const index of [0, 1])
      socket.ws.send(
        JSON.stringify({
          type: "claim",
          claim: {
            index,
            status: "re",
            metrics: {
              inputBytes: 4 + index,
              instructionCost: index * 20,
              memoryBytes: 100 + index * 10,
              costProfile: cCostProfile,
              costModel: "test",
            },
          },
        }),
      );
    const completed = await socket.wait(
      (m) => m.attempt?.status === "complete",
    );
    expect(completed.attempt.verdicts[0].metrics).toMatchObject({
      inputBytes: 4,
      instructionCost: 0,
      memoryBytes: 100,
    });
    socket.ws.close();
    const restored = await connect(created.attempt.id, created.token);
    const state = await restored.wait((m) => m.attempt?.status === "complete");
    expect(state.attempt.verdicts).toEqual(completed.attempt.verdicts);
    restored.ws.close();
    const response = await call(
      "/api/teacher/exams/first/analysis",
      "GET",
      undefined,
      teacherToken,
    );
    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    const submission = data.submissions.find(
      (s: any) => s.id === req.operationId,
    );
    expect(submission).toMatchObject({
      instructionCost: 20,
      memoryBytes: 110,
      codeBytes: new TextEncoder().encode(req.code).length,
      passed: false,
      status: "complete",
      testsReported: 2,
      costProfile: cCostProfile,
    });
    expect(submission).not.toHaveProperty("code");
    const sourcePath = `/api/teacher/exams/first/submissions/${req.operationId}`;
    expect((await call(sourcePath)).status).toBe(401);
    expect((await call(sourcePath, "GET", undefined, secondToken)).status).toBe(
      404,
    );
    expect(
      await (await call(sourcePath, "GET", undefined, teacherToken)).json(),
    ).toEqual({ code: req.code });
    // Missing individual measurements must not produce a misleading partial total.
    await db
      .prepare(
        "UPDATE attempt_claims SET claim=json_remove(claim,'$.metrics.instructionCost') WHERE attempt_id=? AND idx=0",
      )
      .bind(req.operationId)
      .run();
    const incomplete = (await (
      await call(
        "/api/teacher/exams/first/analysis",
        "GET",
        undefined,
        teacherToken,
      )
    ).json()) as any;
    expect(
      incomplete.submissions.find((s: any) => s.id === req.operationId)
        .instructionCost,
    ).toBeNull();
    const pending = request("metrics-expired");
    await call("/api/exams/first/attempts", "POST", pending);
    await db
      .prepare("UPDATE attempts SET expires_at=1 WHERE id=?")
      .bind(pending.operationId)
      .run();
    const expired = (await (
      await call(
        "/api/teacher/exams/first/analysis",
        "GET",
        undefined,
        teacherToken,
      )
    ).json()) as any;
    expect(
      expired.submissions.find((s: any) => s.id === pending.operationId),
    ).toMatchObject({
      status: "expired",
      instructionCost: null,
      memoryBytes: null,
    });
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
    const t = await provision("Revocable");
    expect(
      (await call("/api/teacher/exams", "GET", undefined, t.token)).status,
    ).toBe(200);
    await call(`/api/teacher/tokens/${t.id}`, "DELETE", undefined, t.token);
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

it("separates creation permission, exam ownership, collaboration and platform administration", async () => {
  const creator = await provision("Creator", false),
    collaborator = await provision("Collaborator", false),
    outsider = await provision("Outsider", false);
  const own = await bundle("permission-exam");
  const stage = "/api/teacher/exams/permission-exam/revisions",
    members = "/api/teacher/exams/permission-exam/members";
  expect((await call(stage, "POST", own, creator.token)).status).toBe(403);
  expect(
    (
      await call(
        "/api/admin/creation-grants",
        "POST",
        { provider: "local", subject: creator.id },
        outsider.token,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await call(
        "/api/admin/creation-grants",
        "POST",
        { provider: "local", subject: creator.id },
        "root-secret",
      )
    ).status,
  ).toBe(201);
  expect((await call(stage, "POST", own, creator.token)).status).toBe(200);
  expect(
    (
      await call(
        members,
        "POST",
        { provider: "local", subject: collaborator.id },
        creator.token,
      )
    ).status,
  ).toBe(201);
  const publish = `/api/teacher/exams/permission-exam/revisions/${own.revision}/publish`;
  expect(
    (
      await call(
        publish,
        "POST",
        { expectedRevision: null },
        collaborator.token,
      )
    ).status,
  ).toBe(200);
  expect(
    (await call(publish, "POST", { expectedRevision: null }, creator.token))
      .status,
  ).toBe(409);
  expect(
    (
      await call(
        "/api/teacher/exams/permission-exam",
        "PATCH",
        { title: "Shared edit" },
        collaborator.token,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        members,
        "POST",
        { provider: "local", subject: outsider.id },
        collaborator.token,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await call(
        `${members}/${creator.id}`,
        "DELETE",
        undefined,
        collaborator.token,
      )
    ).status,
  ).toBe(403);
  for (const suffix of [
    "",
    "/analysis",
    "/submissions",
    "/submissions/unknown",
    "/results",
    "/export",
    "/telemetry",
    "/members",
  ]) {
    expect(
      (
        await call(
          `/api/teacher/exams/permission-exam${suffix}`,
          "GET",
          undefined,
          outsider.token,
        )
      ).status,
    ).toBe(404);
  }
  expect((await call(stage, "POST", own, outsider.token)).status).toBe(404);
  expect(
    (
      await call(
        "/api/exams/permission-exam?preview=1",
        "GET",
        undefined,
        collaborator.token,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await call(
        "/api/exams/permission-exam?preview=1",
        "GET",
        undefined,
        outsider.token,
      )
    ).status,
  ).toBe(403);
  expect(
    await (
      await call("/api/teacher/exams", "GET", undefined, outsider.token)
    ).json(),
  ).toEqual([]);
  expect(
    (
      (await (
        await call("/api/teacher/exams", "GET", undefined, collaborator.token)
      ).json()) as any[]
    ).map((e) => e.id),
  ).toEqual(["permission-exam"]);
  expect(
    (
      await call(
        "/api/teacher/exams/other-new/revisions",
        "POST",
        await bundle("other-new"),
        collaborator.token,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await call(
        "/api/admin/toolchains/test.json",
        "PUT",
        {},
        collaborator.token,
      )
    ).status,
  ).toBe(403);
  expect(
    (await call("/api/admin/toolchains/test.json", "PUT", {}, "root-secret"))
      .status,
  ).toBe(200);
  expect(
    (await call("/api/teacher/toolchains/test.json", "PUT", {}, creator.token))
      .status,
  ).toBe(404);
  expect(
    (await call("/api/admin/teachers", "POST", { name: "old" }, "root-secret"))
      .status,
  ).toBe(404);
  expect(
    (await call("/api/admin/legacy", "GET", undefined, "root-secret")).status,
  ).toBe(404);
  // Removing creation permission affects new exams, not ownership of existing exams.
  expect(
    (
      await call(
        `/api/admin/creation-grants/${creator.id}`,
        "DELETE",
        undefined,
        "root-secret",
      )
    ).status,
  ).toBe(200);
  expect((await call(stage, "POST", own, creator.token)).status).toBe(200);
  expect(
    (
      await call(
        "/api/teacher/exams/no-new/revisions",
        "POST",
        await bundle("no-new"),
        creator.token,
      )
    ).status,
  ).toBe(403);
  // An existing session cannot retain collaborator access after removal.
  const session = await call(
    "/api/teacher/session",
    "POST",
    undefined,
    collaborator.token,
  );
  const cookie = session.headers.get("set-cookie")!.split(";")[0];
  expect(
    (
      await call(
        `${members}/${collaborator.id}`,
        "DELETE",
        undefined,
        creator.token,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await mf.dispatchFetch(
        "http://localhost/api/teacher/exams/permission-exam",
        { headers: { Cookie: cookie } },
      )
    ).status,
  ).toBe(404);
  expect((await call(stage, "POST", own, collaborator.token)).status).toBe(404);
});
it("persists semantic decisions, gates scores and recovers provider errors without losing tests", async () => {
  const id = "semantic-example";
  const published = await publish(id, {
    semanticCheck: "必須使用指標",
    template: "int solve(void);",
  });
  await active(id);
  const publicData = (await (await call(`/api/exams/${id}`)).json()) as any;
  expect(publicData.problems[0].template).toBe("int solve(void);");
  expect(publicData.problems[0]).not.toHaveProperty("semanticCheck");
  const previewData = (await (
    await call(`/api/exams/${id}?preview=1`, "GET", undefined, teacherToken)
  ).json()) as any;
  expect(previewData.problems[0]).not.toHaveProperty("semanticCheck");
  const exported = (await (
    await call(
      `/api/teacher/exams/${id}/export`,
      "GET",
      undefined,
      teacherToken,
    )
  ).json()) as any;
  expect(exported.bundles[0].content.problems[0].semanticCheck).toBe(
    "必須使用指標",
  );
  const m = JSON.parse(
    (await db
      .prepare("SELECT manifest FROM exam_catalog WHERE id=?")
      .bind(id)
      .first<any>())!.manifest,
  );
  for (const mode of ["fail", "pass", "error"] as const) {
    semanticMode = mode;
    const requestBody = {
      ...request(`semantic-${mode}`),
      problemVersion: published.version,
    };
    const callsBefore = semanticCalls;
    const created = (await (
      await call(`/api/exams/${id}/attempts`, "POST", requestBody)
    ).json()) as any;
    const socket = await connect(created.attempt.id, created.token, id);
    for (const index of [0, 1])
      socket.ws.send(
        JSON.stringify({
          type: "claim",
          claim: {
            index,
            status: "ok",
            checksum: await boundChecksum({
              salt: m.exam.salt,
              studentId: requestBody.studentId,
              problemId: "p",
              index,
              innerDigest: "a".repeat(64),
            }),
          },
        }),
      );
    if (mode === "error") {
      await socket.wait((v) => v.type === "error");
      socket.ws.close();
      expect(
        (await db
          .prepare("SELECT status FROM attempts WHERE id=?")
          .bind(created.attempt.id)
          .first<any>())!.status,
      ).toBe("running");
      expect(
        (await db
          .prepare(
            "SELECT COUNT(*) AS n FROM attempt_claims WHERE attempt_id=?",
          )
          .bind(created.attempt.id)
          .first<any>())!.n,
      ).toBe(2);
      await db
        .prepare("UPDATE semantic_checks SET lease_until=0 WHERE attempt_id=?")
        .bind(created.attempt.id)
        .run();
      semanticMode = "pass";
      const retry = await connect(created.attempt.id, created.token, id);
      expect(
        (await retry.wait((v) => v.attempt?.status === "complete")).attempt
          .score,
      ).toBe(1);
      retry.ws.close();
    } else {
      const result = (
        await socket.wait((v) => v.attempt?.status === "complete")
      ).attempt;
      expect(result.verdicts.every((v: any) => v.status === "AC")).toBe(true);
      expect(result.testScore).toBe(1);
      expect(result.score).toBe(mode === "pass" ? 1 : 0);
      expect(result.semanticCheck.passed).toBe(mode === "pass");
      socket.ws.close();
      const replay = await connect(created.attempt.id, created.token, id);
      expect(
        (await replay.wait((v) => v.attempt?.status === "complete")).attempt
          .semanticCheck,
      ).toEqual(result.semanticCheck);
      replay.ws.close();
      expect(semanticCalls - callsBefore).toBe(1);
    }
  }
  const analysis = (await (
    await call(
      `/api/teacher/exams/${id}/analysis`,
      "GET",
      undefined,
      teacherToken,
    )
  ).json()) as any;
  expect(
    analysis.submissions.find((v: any) => v.studentId === "semantic-fail")
      .passed,
  ).toBe(false);
  const stored = (
    await db
      .prepare("SELECT * FROM attempts WHERE exam_id=? ORDER BY sequence")
      .bind(id)
      .all<any>()
  ).results;
  await db
    .prepare("UPDATE exam_catalog SET ends_at=? WHERE id=?")
    .bind(Date.now() - 1, id)
    .run();
  const report = {
    examId: id,
    revision: published.revision,
    policy: "best",
    snapshot: stored.at(-1)!.sequence,
    completedAt: Date.now(),
    submissions: stored.map((a) => ({
      id: a.id,
      codeSha256: a.code_sha256,
      problemVersion: a.problem_version,
      classification: "CONFIRMED",
      verdicts: [
        { index: 0, status: "AC" },
        { index: 1, status: "AC" },
      ],
    })),
  };
  const response = await call(
    `/api/teacher/exams/${id}/results`,
    "POST",
    report,
    teacherToken,
  );
  expect(response.status).toBe(200);
  const data = (await response.json()) as any;
  expect(
    data.scores.find((s: any) => s.studentId === "semantic-fail").totalScore,
  ).toBe(0);
});
it("shares a semantic lease across sockets and does not penalize model latency at the deadline", async () => {
  const id = "semantic-concurrent";
  const published = await publish(id, { semanticCheck: "必須使用指標" });
  await active(id);
  const m = JSON.parse(
    (await db
      .prepare("SELECT manifest FROM exam_catalog WHERE id=?")
      .bind(id)
      .first<any>())!.manifest,
  );
  const req = { ...request("concurrent"), problemVersion: published.version };
  semanticMode = "pass";
  let release!: () => void;
  semanticGate = new Promise<void>((resolve) => (release = resolve));
  const started = new Promise<void>((resolve) => (semanticOnRequest = resolve));
  const before = semanticCalls;
  const created = (await (
    await call(`/api/exams/${id}/attempts`, "POST", req)
  ).json()) as any;
  await started;
  expect(
    (
      await db
        .prepare("SELECT COUNT(*) AS n FROM attempt_claims WHERE attempt_id=?")
        .bind(created.attempt.id)
        .first<any>()
    ).n,
  ).toBe(0);
  const first = await connect(created.attempt.id, created.token, id);
  try {
    for (const index of [0, 1])
      first.ws.send(
        JSON.stringify({
          type: "claim",
          claim: {
            index,
            status: "ok",
            checksum: await boundChecksum({
              salt: m.exam.salt,
              studentId: req.studentId,
              problemId: "p",
              index,
              innerDigest: "a".repeat(64),
            }),
          },
        }),
      );
    await first.wait((m) => m.type === "verdict" && m.verdict.index === 1);
    await first.wait((m) => m.type === "semantic");
    await started;
    // A second connection cannot issue a second paid request while the first holds its lease.
    const second = await connect(created.attempt.id, created.token, id);
    await db
      .prepare("UPDATE attempts SET expires_at=? WHERE id=?")
      .bind(Date.now() - 1, created.attempt.id)
      .run();
    const history = (await (
      await call(
        `/api/exams/${id}/submissions?student=concurrent&identityKind=guest`,
      )
    ).json()) as any;
    expect(history.submissions[0].status).toBe("running");
    first.ws.close();
    release();
    const result = (await second.wait((m) => m.attempt?.status === "complete"))
      .attempt;
    expect(result.score).toBe(1);
    expect(semanticCalls - before).toBe(1);
    second.ws.close();
  } finally {
    release();
    semanticGate = undefined;
    semanticOnRequest = undefined;
  }
});

it("keeps a completed early semantic rejection pending until every test is received", async () => {
  const id = "semantic-first";
  const published = await publish(id, { semanticCheck: "必須使用指標" });
  await active(id);
  semanticMode = "fail";
  const before = semanticCalls;
  const req = {
    ...request("early-rejection"),
    problemVersion: published.version,
  };
  const created = (await (
    await call(`/api/exams/${id}/attempts`, "POST", req)
  ).json()) as any;
  let result: any;
  for (let i = 0; i < 200; i++) {
    result = await db
      .prepare("SELECT result FROM semantic_checks WHERE attempt_id=?")
      .bind(created.attempt.id)
      .first<any>();
    if (result?.result) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  expect(JSON.parse(result.result).passed).toBe(false);
  expect(semanticCalls - before).toBe(1);
  const pending = (await (
    await call(`/api/exams/${id}/attempts/${created.attempt.id}`)
  ).json()) as any;
  expect(pending.status).toBe("running");
  expect(pending.verdicts).toHaveLength(0);
  const socket = await connect(created.attempt.id, created.token, id);
  socket.ws.send(
    JSON.stringify({ type: "claim", claim: { index: 0, status: "re" } }),
  );
  await socket.wait((m) => m.type === "verdict" && m.verdict.index === 0);
  expect(
    (
      (await (
        await call(`/api/exams/${id}/attempts/${created.attempt.id}`)
      ).json()) as any
    ).status,
  ).toBe("running");
  socket.ws.send(
    JSON.stringify({ type: "claim", claim: { index: 1, status: "re" } }),
  );
  const final = (await socket.wait((m) => m.attempt?.status === "complete"))
    .attempt;
  expect(final.verdicts).toHaveLength(2);
  expect(final.semanticCheck.passed).toBe(false);
  expect(final.score).toBe(0);
  expect(semanticCalls - before).toBe(1);
  socket.ws.close();
  semanticMode = "pass";
});
