import { beforeAll, afterAll, it, expect } from "vitest";
import type { Miniflare } from "miniflare";
import { createTestRuntime } from "./runtime";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import { sha256Hex } from "@myriad/shared";
let mf: Miniflare, db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
let profileName = "same",
  tokenStatus = 200;

const base = "https://judge.example.test",
  revision = "a".repeat(64),
  version = "b".repeat(64);
function call(path: string, options: RequestInit = {}) {
  return mf.dispatchFetch(base + path, {
    redirect: "manual",
    ...options,
  } as Parameters<Miniflare["dispatchFetch"]>[1]);
}
async function start(returnTo = "/exams/auth-exam/problems/p") {
  const response = await call(
    "/api/auth/nycu/start?returnTo=" + encodeURIComponent(returnTo),
  );
  const location = new URL(response.headers.get("location")!);
  return {
    response,
    state: location.searchParams.get("state")!,
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    location,
  };
}
async function signIn(username = "same") {
  const begin = await start();
  profileName = username;
  tokenStatus = 200;
  const response = await call(
    `/api/auth/nycu/callback?code=test-code&state=${begin.state}`,
    { headers: { Cookie: begin.cookie } },
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    base + "/exams/auth-exam/problems/p",
  );
  const raw = response.headers.get("set-cookie")!;
  const cookie = raw.match(/myriad_student=[^;,]+/)![0];
  expect(raw).toContain("HttpOnly");
  expect(raw).toContain("Secure");
  expect(raw).toContain("SameSite=Lax");
  return { cookie, begin };
}
beforeAll(async () => {
  const result = await build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
  });
  mf = createTestRuntime({
    script: result.outputFiles[0].text,
    outboundService: async (request) => {
      const url = new URL(request.url);
      expect(url.origin).toBe("https://id.nycu.edu.tw");
      if (url.pathname === "/o/token/") {
        const p = new URLSearchParams(await request.text());
        expect(request.method).toBe("POST");
        expect(p.get("client_secret")).toBe("test-oauth-secret");
        expect(p.get("redirect_uri")).toBe(base + "/api/auth/nycu/callback");
        expect(p.get("code_verifier")).toMatch(/^[a-f0-9]{64}$/);
        return new Response(
          JSON.stringify(
            tokenStatus === 200
              ? { access_token: "access-token", token_type: "Bearer" }
              : { error: "invalid_grant" },
          ),
          { status: tokenStatus },
        );
      }
      expect(url.pathname).toBe("/api/profile/");
      expect(request.headers.get("Authorization")).toBe("Bearer access-token");
      return new Response(
        JSON.stringify({ username: profileName, email: "unused@example.test" }),
      );
    },
    bindings: {
      APP_ORIGIN: base,
      NYCU_CLIENT_ID: "test-client",
      ADMIN_IDENTITIES: JSON.stringify([
        { provider: "nycu", subject: "platform-admin" },
      ]),
      NYCU_CLIENT_SECRET: "test-oauth-secret",
      ATTEMPT_SECRET: "test-attempt-secret-at-least-32-characters",
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
  await db
    .prepare("INSERT INTO accounts VALUES(?,'local',?,?)")
    .bind("t", "t", "Teacher")
    .run();
  await db
    .prepare("INSERT INTO account_tokens VALUES('t','t',?,1,NULL)")
    .bind(await sha256Hex("teacher-token"))
    .run();
  const manifest = {
    exam: { salt: "salt-at-least-sixteen", policy: "best", rules: "" },
    problems: [
      {
        id: "p",
        version,
        testCount: 1,
        groups: [{ name: "all", tests: [0] }],
      },
    ],
    inputs: [{ problemId: "p", index: 0, expectedDigest: "a".repeat(64) }],
  };
  await db
    .prepare(
      "INSERT INTO exam_catalog(id,owner_id,revision,title,starts_at,ends_at,manifest) VALUES(?,?,?,?,?,?,?)",
    )
    .bind(
      "auth-exam",
      "t",
      revision,
      "OAuth exam",
      Date.now() - 10000,
      Date.now() + 3600000,
      JSON.stringify(manifest),
    )
    .run();
  await db
    .prepare("INSERT INTO exam_revisions VALUES(?,?,?,?,?)")
    .bind("auth-exam", revision, "bundle", JSON.stringify(manifest), Date.now())
    .run();
});
afterAll(async () => {
  await mf.dispose();
});
it("binds an expiring state cookie to a PKCE authorization request and rejects open redirects", async () => {
  const { response, location, state } = await start();
  expect(location.origin).toBe("https://id.nycu.edu.tw");
  expect(location.searchParams.get("scope")).toBe("profile");
  expect(location.searchParams.get("code_challenge_method")).toBe("S256");
  expect(location.searchParams.get("code_challenge")).toMatch(
    /^[A-Za-z0-9_-]{43}$/,
  );
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  const callback = await call(
    `/api/auth/nycu/callback?code=stolen&state=${state}`,
  );
  expect(callback.headers.get("location")).toContain("auth_error=state");
  expect((await call("/api/auth/nycu/start?returnTo=//evil.test")).status).toBe(
    400,
  );
  // Another origin never starts OAuth; it only returns to its own page.
  const foreign = await mf.dispatchFetch(
    "https://evil.test/api/auth/nycu/start",
    { redirect: "manual" } as Parameters<Miniflare["dispatchFetch"]>[1],
  );
  expect(foreign.headers.get("location")).toMatch(
    /^\/exams\?auth_error=origin/,
  );
  expect(foreign.headers.get("set-cookie")).toBeNull();
});
it("creates a hashed session, returns only account identity and consumes the callback once", async () => {
  const { cookie, begin } = await signIn();
  const session = await (
    await call("/api/auth/session", { headers: { Cookie: cookie } })
  ).json<any>();
  expect(session.account).toMatchObject({
    kind: "nycu",
    label: "same",
    key: "nycu:same",
  });
  expect(JSON.stringify(session)).not.toContain("access-token");
  expect(JSON.stringify(session)).not.toContain("email");
  const raw = cookie.split("=")[1];
  expect(
    await db
      .prepare("SELECT hash FROM student_sessions WHERE hash=?")
      .bind(raw)
      .first(),
  ).toBeNull();
  expect(
    await db
      .prepare("SELECT hash FROM student_sessions WHERE hash=?")
      .bind(await sha256Hex(raw))
      .first(),
  ).not.toBeNull();
  expect(
    (
      await call(
        `/api/auth/nycu/callback?code=test-code&state=${begin.state}`,
        { headers: { Cookie: begin.cookie } },
      )
    ).headers.get("location"),
  ).toContain("auth_error=state");
});
it("handles cancellation, expired state and provider failure without creating sessions", async () => {
  const cancelled = await start();
  expect(
    (
      await call(
        `/api/auth/nycu/callback?error=access_denied&state=${cancelled.state}`,
        { headers: { Cookie: cancelled.cookie } },
      )
    ).headers.get("location"),
  ).toContain("auth_error=cancelled");
  const expired = await start();
  await db
    .prepare("UPDATE oauth_states SET expires_at=0 WHERE hash=?")
    .bind(await sha256Hex(expired.state))
    .run();
  expect(
    (
      await call(`/api/auth/nycu/callback?code=x&state=${expired.state}`, {
        headers: { Cookie: expired.cookie },
      })
    ).headers.get("location"),
  ).toContain("auth_error=state");
  const failed = await start();
  tokenStatus = 400;
  expect(
    (
      await call(`/api/auth/nycu/callback?code=x&state=${failed.state}`, {
        headers: { Cookie: failed.cookie },
      })
    ).headers.get("location"),
  ).toContain("auth_error=provider");
});
it("separates same-name guests from NYCU submissions, cooldowns and internal scores", async () => {
  const { cookie } = await signIn();
  const create = (kind: "guest" | "nycu", auth = "") =>
    call("/api/exams/auth-exam/attempts", {
      method: "POST",
      headers: {
        Cookie: auth,
        Origin: base,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        operationId: crypto.randomUUID(),
        problemVersion: version,
        problemId: "p",
        studentId: "same",
        identityKind: kind,
        deviceId: crypto.randomUUID(),
        code: "int main(){}",
      }),
    });
  expect((await create("nycu")).status).toBe(401);
  const schoolResponse = await create("nycu", cookie),
    guestResponse = await create("guest");
  expect(schoolResponse.status).toBe(201);
  expect(guestResponse.status).toBe(201);
  const school = await schoolResponse.json<any>(),
    guest = await guestResponse.json<any>();
  expect(school.attempt.participantId).toBe("nycu:same");
  expect(guest.attempt.participantId).toBe("guest:same");
  const guestHistory = await (
    await call(
      "/api/exams/auth-exam/submissions?student=same&identityKind=guest",
    )
  ).json<any>();
  expect(guestHistory.submissions.map((s: any) => s.id)).toEqual([
    guest.attempt.id,
  ]);
  expect(
    (
      await call(
        "/api/exams/auth-exam/submissions?student=same&identityKind=nycu",
      )
    ).status,
  ).toBe(401);
  expect(
    (await call(`/api/exams/auth-exam/attempts/${school.attempt.id}`)).status,
  ).toBe(401);
  const schoolHistory = await (
    await call(
      "/api/exams/auth-exam/submissions?student=same&identityKind=nycu",
      { headers: { Cookie: cookie } },
    )
  ).json<any>();
  expect(schoolHistory.submissions.map((s: any) => s.id)).toEqual([
    school.attempt.id,
  ]);
  await db
    .prepare("UPDATE attempts SET status='complete' WHERE exam_id='auth-exam'")
    .run();
  await db
    .prepare("UPDATE exam_catalog SET ends_at=0 WHERE id='auth-exam'")
    .run();
  const rows = (
    await db
      .prepare(
        "SELECT * FROM attempts WHERE exam_id='auth-exam' ORDER BY sequence",
      )
      .all<any>()
  ).results;
  const report = {
    examId: "auth-exam",
    revision,
    policy: "best",
    snapshot: rows.at(-1).sequence,
    completedAt: Date.now(),
    submissions: rows.map((r: any) => ({
      id: r.id,
      codeSha256: r.code_sha256,
      problemVersion: r.problem_version,
      classification: "CONFIRMED",
      verdicts: [{ index: 0, status: "AC" }],
    })),
  };
  const uploaded = await call("/api/teacher/exams/auth-exam/results", {
    method: "POST",
    headers: {
      Authorization: "Bearer teacher-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(report),
  });
  expect(uploaded.status).toBe(200);
  const data = await uploaded.json<any>();
  expect(data.scores.map((s: any) => s.participantId).sort()).toEqual([
    "guest:same",
    "nycu:same",
  ]);
});
it("requires same-origin logout and rejects expired sessions", async () => {
  const { cookie } = await signIn("logout");
  expect(
    (
      await call("/api/auth/session", {
        method: "DELETE",
        headers: { Cookie: cookie, Origin: "https://evil.test" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call("/api/auth/session", {
        method: "DELETE",
        headers: { Cookie: cookie, Origin: base },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await (
        await call("/api/auth/session", { headers: { Cookie: cookie } })
      ).json<any>()
    ).account,
  ).toBeNull();
  const next = await signIn("expired");
  await db.prepare("UPDATE student_sessions SET expires_at=0").run();
  expect(
    (
      await (
        await call("/api/auth/session", { headers: { Cookie: next.cookie } })
      ).json<any>()
    ).account,
  ).toBeNull();
});
it("a login started from another address returns to the page with the expected origin", async () => {
  const response = await mf.dispatchFetch(
    "http://localhost:8787/api/auth/nycu/start?returnTo=%2Fexams%2Fquiz",
    { redirect: "manual" } as Parameters<Miniflare["dispatchFetch"]>[1],
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(
    `/exams/quiz?auth_error=origin&auth_provider=nycu&expected=${encodeURIComponent(base)}`,
  );
  expect(response.headers.get("set-cookie")).toBeNull();
});
it("maps verified OAuth identities to administrator and creation permissions without provider confusion", async () => {
  const admin = await signIn("platform-admin"),
    ordinary = await signIn("ta-user");
  const request = (
    path: string,
    cookie: string,
    method = "GET",
    body?: unknown,
  ) =>
    call(path, {
      method,
      headers: {
        Cookie: cookie,
        Origin: base,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const access = await (
    await request("/api/teacher/access", admin.cookie)
  ).json<any>();
  expect(access).toMatchObject({
    isAdmin: true,
    canCreateExams: false,
    account: { provider: "nycu", subject: "platform-admin" },
  });
  expect(
    (await request("/api/admin/creation-grants", ordinary.cookie)).status,
  ).toBe(403);
  // Another provider with the same subject must not grant NYCU creation rights.
  expect(
    (
      await request("/api/admin/creation-grants", admin.cookie, "POST", {
        provider: "other",
        subject: "ta-user",
      })
    ).status,
  ).toBe(201);
  expect(
    (await (await request("/api/teacher/access", ordinary.cookie)).json<any>())
      .canCreateExams,
  ).toBe(false);
  const granted = await (
    await request("/api/admin/creation-grants", admin.cookie, "POST", {
      provider: "nycu",
      subject: "ta-user",
    })
  ).json<any>();
  expect(
    (await (await request("/api/teacher/access", ordinary.cookie)).json<any>())
      .canCreateExams,
  ).toBe(true);
  expect(
    (
      await call("/api/admin/creation-grants", {
        method: "POST",
        headers: {
          Cookie: admin.cookie,
          Origin: "https://evil.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider: "nycu", subject: "evil" }),
      })
    ).status,
  ).toBe(403);
  const credential = await (
    await request("/api/teacher/tokens", ordinary.cookie, "POST", {})
  ).json<any>();
  expect(credential.token).toHaveLength(64);
  expect(
    (
      await call("/api/teacher/exams", {
        headers: { Authorization: `Bearer ${credential.token}` },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await request(
        `/api/admin/creation-grants/${granted.id}`,
        admin.cookie,
        "DELETE",
      )
    ).status,
  ).toBe(200);
  expect(
    (await (await request("/api/teacher/access", ordinary.cookie)).json<any>())
      .canCreateExams,
  ).toBe(false);
  expect(
    (
      await request(
        `/api/teacher/tokens/${credential.id}`,
        ordinary.cookie,
        "DELETE",
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await call("/api/teacher/exams", {
        headers: { Authorization: `Bearer ${credential.token}` },
      })
    ).status,
  ).toBe(401);
  const begin = await start("/teacher");
  expect(begin.response.status).toBe(302);
  expect((await call("/api/auth/nycu/start?returnTo=//evil.test")).status).toBe(
    400,
  );
});
