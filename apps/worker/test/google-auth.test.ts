import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import type { Miniflare } from "miniflare";
import { sha256Hex, type AuthProvider } from "@myriad/shared";
import { createTestRuntime } from "./runtime";

const base = "https://judge.example.test";
const projectId = "myriad-test-project";
const apiKey = "test-firebase-api-key";
const revision = "a".repeat(64),
  version = "b".repeat(64);
let mf: Miniflare, db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
let script: string;
let signingKey: CryptoKey, wrongKey: CryptoKey;
let subject = "same";
let responseOverrides: Record<string, unknown> = {};
let authorizationTransform = (url: URL) => url;
let missingKid = false;
const firebaseSessions = new Map<
  string,
  { sessionId: string; context: string; callback: string }
>();
let claims: JWTPayload = {},
  omit: string[] = [];
let invalidSignature = false,
  missingToken = false;
let tokenRequests = 0;
function call(path: string, options: RequestInit = {}) {
  return mf.dispatchFetch(base + path, {
    redirect: "manual",
    ...options,
  } as Parameters<Miniflare["dispatchFetch"]>[1]);
}
async function migrate(runtime: Miniflare) {
  const database = await runtime.getD1Database("DB");
  for (const file of (await readdir("migrations")).sort()) {
    const sql = (await readFile(`migrations/${file}`, "utf8")).replace(
      /--[^\n]*/g,
      "",
    );
    for (const statement of sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await database.prepare(statement).run();
  }
  return database;
}
async function start(
  provider: AuthProvider = "google",
  returnTo = "/exams/auth-exam",
) {
  const response = await call(
    `/api/auth/${provider}/start?returnTo=${encodeURIComponent(returnTo)}`,
  );
  expect(response.status).toBe(302);
  const location = new URL(response.headers.get("location")!);
  return {
    response,
    location,
    state: location.searchParams.get("state")!,
    cookie: response.headers.get("set-cookie")!.split(";")[0],
    provider,
  };
}
async function callback(
  begin: Awaited<ReturnType<typeof start>>,
  oldCookie = "",
) {
  return call(
    `/api/auth/${begin.provider}/callback?code=test-code&state=${begin.state}`,
    {
      headers: { Cookie: [begin.cookie, oldCookie].filter(Boolean).join("; ") },
    },
  );
}
async function signIn(provider: AuthProvider = "google", oldCookie = "") {
  const begin = await start(provider);
  const response = await callback(begin, oldCookie);
  expect(response.headers.get("location")).toBe(base + "/exams/auth-exam");
  const raw = response.headers.get("set-cookie")!;
  expect(raw).toContain("HttpOnly");
  expect(raw).toContain("Secure");
  expect(raw).toContain("SameSite=Lax");
  return { cookie: raw.match(/myriad_student=[^;,]+/)![0], begin };
}
const authHeaders = (cookie: string) => ({
  Cookie: cookie,
  Origin: base,
  "Content-Type": "application/json",
});

beforeAll(async () => {
  const result = await build({
    entryPoints: ["src/index.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    write: false,
  });
  script = result.outputFiles[0].text;
  const keys = await generateKeyPair("RS256");
  signingKey = keys.privateKey;
  wrongKey = (await generateKeyPair("RS256")).privateKey;
  const publicKey = {
    ...(await exportJWK(keys.publicKey)),
    kid: "firebase-test-key",
    alg: "RS256",
    use: "sig",
  };
  mf = createTestRuntime({
    script,
    bindings: {
      APP_ORIGIN: base,
      NYCU_CLIENT_ID: "test-nycu-client",
      NYCU_CLIENT_SECRET: "test-nycu-secret",
      FIREBASE_PROJECT_ID: projectId,
      FIREBASE_API_KEY: apiKey,
      ATTEMPT_SECRET: "test-attempt-secret-at-least-32-characters",
      ADMIN_IDENTITIES: JSON.stringify([
        { provider: "google", subject: "admin" },
      ]),
    },
    outboundService: async (request) => {
      const url = new URL(request.url);
      if (
        url.href ===
        "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
      ) {
        expect(request.method).toBe("GET");
        return Response.json({ keys: [publicKey] });
      }
      if (url.origin === "https://identitytoolkit.googleapis.com") {
        expect(url.searchParams.get("key")).toBe(apiKey);
        expect(request.method).toBe("POST");
        const body = await request.json<Record<string, unknown>>();
        if (url.pathname === "/v1/accounts:createAuthUri") {
          expect(body).toMatchObject({
            providerId: "google.com",
            continueUri: base + "/api/auth/google/callback",
            authFlowType: "CODE_FLOW",
          });
          expect(body.context).toMatch(/^[a-f0-9]{64}$/);
          expect(Object.keys(body).sort()).toEqual([
            "authFlowType",
            "context",
            "continueUri",
            "providerId",
          ]);
          const state = "firebase-state-" + crypto.randomUUID();
          const sessionId = "firebase-session-" + crypto.randomUUID();
          firebaseSessions.set(state, {
            sessionId,
            context: body.context as string,
            callback: body.continueUri as string,
          });
          const authUri = new URL("https://accounts.google.com/o/oauth2/auth");
          authUri.search = new URLSearchParams({
            response_type: "code",
            redirect_uri: body.continueUri as string,
            state,
            client_id: "configured-in-firebase",
          }).toString();
          return Response.json({
            authUri: authorizationTransform(authUri).toString(),
            sessionId,
            providerId: "google.com",
          });
        }
        expect(url.pathname).toBe("/v1/accounts:signInWithIdp");
        tokenRequests++;
        const callbackUrl = new URL(body.requestUri as string);
        const pending = firebaseSessions.get(
          callbackUrl.searchParams.get("state")!,
        );
        expect(pending).toBeDefined();
        expect(callbackUrl.origin + callbackUrl.pathname).toBe(
          pending!.callback,
        );
        expect(callbackUrl.searchParams.get("code")).toBe("test-code");
        expect(body).toEqual({
          requestUri: callbackUrl.toString(),
          sessionId: pending!.sessionId,
          returnSecureToken: true,
          returnIdpCredential: false,
          returnRefreshToken: false,
        });
        if (missingToken)
          return Response.json({ oauthAccessToken: "unused-secret" });
        const now = Math.floor(Date.now() / 1000);
        const payload: JWTPayload = {
          iss: `https://securetoken.google.com/${projectId}`,
          aud: projectId,
          sub: "firebase-user-uid",
          iat: now,
          exp: now + 3600,
          auth_time: now,
          firebase: {
            sign_in_provider: "google.com",
            identities: { "google.com": [subject] },
          },
          name: "Google Student",
          ...claims,
        };
        for (const name of omit) delete payload[name];
        const idToken = await new SignJWT(payload)
          .setProtectedHeader({
            alg: "RS256",
            ...(missingKid ? {} : { kid: publicKey.kid }),
          })
          .sign(invalidSignature ? wrongKey : signingKey);
        return Response.json({
          idToken,
          localId: "firebase-user-uid",
          providerId: "google.com",
          context: pending!.context,
          oauthAccessToken: "unused-secret",
          refreshToken: "never-store",
          federatedId: "untrusted-subject",
          email: "unused@example.test",
          ...responseOverrides,
        });
      }
      if (url.href === "https://id.nycu.edu.tw/o/token/")
        return Response.json({
          access_token: "nycu-access",
          token_type: "Bearer",
        });
      if (url.href === "https://id.nycu.edu.tw/api/profile/")
        return Response.json({ username: subject });
      throw new Error(
        `Unexpected outbound request ${request.method} ${url.href}`,
      );
    },
  });
  db = await migrate(mf);
  await db
    .prepare("INSERT INTO accounts VALUES('owner','local','owner','Owner')")
    .run();
  const manifest = {
    exam: { salt: "salt-at-least-sixteen", policy: "best", rules: "" },
    problems: [
      { id: "p", version, testCount: 1, groups: [{ name: "all", tests: [0] }] },
    ],
    inputs: [{ problemId: "p", index: 0, expectedDigest: "a".repeat(64) }],
  };
  await db
    .prepare(
      "INSERT INTO exam_catalog(id,owner_id,revision,title,starts_at,ends_at,manifest) VALUES(?,?,?,?,?,?,?)",
    )
    .bind(
      "auth-exam",
      "owner",
      revision,
      "Auth exam",
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
beforeEach(() => {
  subject = "same";
  claims = {};
  omit = [];
  invalidSignature = false;
  missingToken = false;
  missingKid = false;
  responseOverrides = {};
  authorizationTransform = (url) => url;
});
afterAll(async () => {
  await mf.dispose();
});

it.each([
  [{}, []],
  [{ FIREBASE_PROJECT_ID: projectId, FIREBASE_API_KEY: apiKey }, []],
  [{ APP_ORIGIN: base, FIREBASE_PROJECT_ID: projectId }, []],
  [{ APP_ORIGIN: base, FIREBASE_API_KEY: apiKey }, []],
  [
    { APP_ORIGIN: base, NYCU_CLIENT_ID: "nycu", NYCU_CLIENT_SECRET: "secret" },
    ["nycu"],
  ],
  [
    {
      APP_ORIGIN: base,
      FIREBASE_PROJECT_ID: projectId,
      FIREBASE_API_KEY: apiKey,
    },
    ["google"],
  ],
] as const)(
  "exposes only fully configured providers: %j",
  async (bindings, expected) => {
    const runtime = createTestRuntime({
      script,
      bindings: { ...bindings, ATTEMPT_SECRET: "test-secret" },
    });
    try {
      for (const path of ["/api/auth/session", "/api/teacher/access"]) {
        const response = await runtime.dispatchFetch(base + path);
        expect(await response.json()).toMatchObject({
          providers: expected,
          account: null,
        });
      }
      for (const provider of ["google", "nycu"])
        if (!(expected as readonly string[]).includes(provider)) {
          const response = await runtime.dispatchFetch(
            `${base}/api/auth/${provider}/start`,
            { redirect: "manual" },
          );
          expect(response.status).toBe(503);
          expect(response.headers.get("set-cookie")).toBeNull();
        }
    } finally {
      await runtime.dispose();
    }
  },
);

it("binds the Firebase authorization state and session to one browser and provider", async () => {
  const begin = await start();
  expect(begin.location.origin).toBe("https://accounts.google.com");
  expect(begin.location.searchParams.get("response_type")).toBe("code");
  const cookie = begin.cookie.split("=")[1];
  expect(begin.state).not.toBe(cookie);
  const pending = await db
    .prepare(
      "SELECT provider,authorization_state,provider_data FROM oauth_states WHERE hash=?",
    )
    .bind(await sha256Hex(cookie))
    .first<{
      provider: string;
      authorization_state: string;
      provider_data: string;
    }>();
  expect(pending).toMatchObject({
    provider: "google",
    authorization_state: begin.state,
  });
  expect(JSON.parse(pending!.provider_data)).toEqual({
    sessionId: firebaseSessions.get(begin.state)!.sessionId,
    context: cookie,
  });
  const requestsBefore = tokenRequests;
  const confused = await call(
    `/api/auth/nycu/callback?code=test-code&state=${begin.state}`,
    { headers: { Cookie: begin.cookie } },
  );
  expect(confused.headers.get("location")).toBe(
    base + "/exams?auth_error=state&auth_provider=nycu",
  );
  expect((await callback(begin)).headers.get("location")).toContain(
    "auth_error=state&auth_provider=google",
  );
  expect(tokenRequests).toBe(requestsBefore);
  const cancelled = await start();
  expect(
    (
      await call(
        `/api/auth/google/callback?error=access_denied&state=${cancelled.state}`,
        { headers: { Cookie: cancelled.cookie } },
      )
    ).headers.get("location"),
  ).toBe(base + "/exams/auth-exam?auth_error=cancelled&auth_provider=google");
});

it.each([
  "missing cookie",
  "wrong state",
  "duplicate state",
  "duplicate code",
  "another browser",
  "expired state",
])("rejects callback %s before exchanging credentials", async (mode) => {
  const begin = await start();
  let callbackState = begin.state,
    suffix = "",
    cookie = begin.cookie;
  if (mode === "missing cookie") cookie = "";
  if (mode === "wrong state") callbackState = "wrong-state";
  if (mode === "duplicate state") suffix = "&state=another";
  if (mode === "duplicate code") suffix = "&code=another";
  if (mode === "another browser") cookie = (await start()).cookie;
  if (mode === "expired state")
    await db
      .prepare("UPDATE oauth_states SET expires_at=0 WHERE hash=?")
      .bind(await sha256Hex(cookie.split("=")[1]))
      .run();
  const before = tokenRequests;
  const response = await call(
    `/api/auth/google/callback?code=test-code&state=${callbackState}${suffix}`,
    { headers: { Cookie: cookie } },
  );
  expect(response.headers.get("location")).toContain(
    "auth_error=" + (mode === "duplicate code" ? "provider" : "state"),
  );
  expect(tokenRequests).toBe(before);
});

it.each([
  "host",
  "http",
  "credentials",
  "fragment",
  "callback",
  "implicit flow",
  "missing state",
  "duplicate state",
])("rejects unsafe Firebase authorization URL: %s", async (mode) => {
  authorizationTransform = (url) => {
    if (mode === "host") url.hostname = "evil.example";
    if (mode === "http") url.protocol = "http:";
    if (mode === "credentials") url.username = "user";
    if (mode === "fragment") url.hash = "fragment";
    if (mode === "callback")
      url.searchParams.set("redirect_uri", "https://evil.example/callback");
    if (mode === "implicit flow")
      url.searchParams.set("response_type", "id_token");
    if (mode === "missing state") url.searchParams.delete("state");
    if (mode === "duplicate state") url.searchParams.append("state", "another");
    return url;
  };
  const response = await call("/api/auth/google/start");
  expect(response.headers.get("location")).toBe(
    "/exams?auth_error=provider&auth_provider=google",
  );
  expect(response.headers.get("set-cookie")).toBeNull();
});

it("keeps an existing Google session valid after new Google logins are disabled", async () => {
  const runtime = createTestRuntime({
    script,
    bindings: { APP_ORIGIN: base, ATTEMPT_SECRET: "test-secret" },
  });
  try {
    const database = await migrate(runtime);
    await database
      .prepare(
        "INSERT INTO accounts VALUES('google-user','google','existing','Existing User')",
      )
      .run();
    await database
      .prepare("INSERT INTO student_sessions VALUES(?,'google-user',?)")
      .bind(await sha256Hex("existing-session"), Date.now() + 3600000)
      .run();
    const headers = { Cookie: "myriad_student=existing-session" };
    const session = await runtime.dispatchFetch(base + "/api/auth/session", {
      headers,
    });
    expect(await session.json()).toMatchObject({
      providers: [],
      account: { kind: "google", label: "existing" },
    });
    const access = await runtime.dispatchFetch(base + "/api/teacher/access", {
      headers,
    });
    expect(await access.json()).toMatchObject({
      providers: [],
      account: { provider: "google", subject: "existing" },
    });
    expect(
      (await runtime.dispatchFetch(base + "/api/auth/google/start")).status,
    ).toBe(503);
  } finally {
    await runtime.dispose();
  }
});

it("creates a hashed session with stable subject and separate display name, then rotates it", async () => {
  const first = await signIn();
  const session = await (
    await call("/api/auth/session", { headers: { Cookie: first.cookie } })
  ).json<{ account: { analyticsId: string } }>();
  expect(session).toMatchObject({
    providers: ["nycu", "google"],
    account: {
      kind: "google",
      label: "same",
      displayName: "Google Student",
      key: "google:same",
    },
  });
  expect(JSON.stringify(session)).not.toMatch(
    /unused-secret|never-store|id_token|access_token|email/,
  );
  expect(
    await db
      .prepare("SELECT hash FROM student_sessions WHERE hash=?")
      .bind(first.cookie.split("=")[1])
      .first(),
  ).toBeNull();
  const hash = await sha256Hex(first.cookie.split("=")[1]);
  expect(
    await db
      .prepare("SELECT hash FROM student_sessions WHERE hash=?")
      .bind(hash)
      .first(),
  ).not.toBeNull();
  claims = { name: "Renamed Student" };
  const second = await signIn("google", first.cookie);
  const updated = await (
    await call("/api/auth/session", { headers: { Cookie: second.cookie } })
  ).json();
  expect(updated).toMatchObject({
    account: {
      displayName: "Renamed Student",
      label: "same",
      key: "google:same",
      analyticsId: session.account.analyticsId,
    },
  });
  expect(
    await db
      .prepare("SELECT hash FROM student_sessions WHERE hash=?")
      .bind(hash)
      .first(),
  ).toBeNull();
  expect((await callback(second.begin)).headers.get("location")).toContain(
    "auth_error=state&auth_provider=google",
  );
});

it("uses the stable subject when the optional profile name is absent", async () => {
  subject = "no-name";
  omit = ["name"];
  const { cookie } = await signIn();
  expect(
    await (
      await call("/api/auth/session", { headers: { Cookie: cookie } })
    ).json(),
  ).toMatchObject({ account: { label: "no-name", displayName: "no-name" } });
});

it.each([
  ["signature", {}, [], true],
  ["issuer", { iss: "https://evil.example" }, []],
  ["project audience", { aud: "another-project" }, []],
  ["audience array", { aud: [projectId] }, []],
  ["expiration", { exp: 1 }, []],
  ["future issuance", { iat: 9999999999, exp: 10000000000 }, []],
  ["future authentication", { auth_time: 9999999999 }, []],
  ["missing issuance", {}, ["iat"]],
  ["missing authentication time", {}, ["auth_time"]],
  ["missing Firebase UID", {}, ["sub"]],
  ["long Firebase UID", { sub: "x".repeat(129) }, []],
  [
    "wrong sign-in provider",
    {
      firebase: {
        sign_in_provider: "password",
        identities: { "google.com": ["same"] },
      },
    },
    [],
  ],
  [
    "missing Google identity",
    { firebase: { sign_in_provider: "google.com", identities: {} } },
    [],
  ],
  [
    "ambiguous Google identities",
    {
      firebase: {
        sign_in_provider: "google.com",
        identities: { "google.com": ["first", "second"] },
      },
    },
    [],
  ],
  [
    "long Google subject",
    {
      firebase: {
        sign_in_provider: "google.com",
        identities: { "google.com": ["x".repeat(256)] },
      },
    },
    [],
  ],
  [
    "non-ASCII Google subject",
    {
      firebase: {
        sign_in_provider: "google.com",
        identities: { "google.com": ["帳號"] },
      },
    },
    [],
  ],
  [
    "tenant",
    {
      firebase: {
        sign_in_provider: "google.com",
        identities: { "google.com": ["same"] },
        tenant: "another-tenant",
      },
    },
    [],
  ],
  ["invalid display name", { name: "wrong\nname" }, []],
  ["missing ID token", {}, [], false, true],
] as [string, JWTPayload, string[], boolean?, boolean?][])(
  "rejects Firebase %s without creating a session",
  async (_, overrides, omissions, wrongSignature, absentToken) => {
    subject = "reject-me";
    claims = overrides;
    omit = omissions;
    invalidSignature = !!wrongSignature;
    missingToken = !!absentToken;
    const count = await db
      .prepare("SELECT COUNT(*) AS count FROM student_sessions")
      .first();
    const begin = await start();
    const response = await callback(begin);
    expect(response.headers.get("location")).toBe(
      base + "/exams/auth-exam?auth_error=provider&auth_provider=google",
    );
    expect(response.headers.get("set-cookie")).not.toMatch(/myriad_student=/);
    expect(
      await db
        .prepare("SELECT COUNT(*) AS count FROM student_sessions")
        .first(),
    ).toEqual(count);
    expect(
      await db
        .prepare(
          "SELECT * FROM accounts WHERE provider='google' AND subject='reject-me'",
        )
        .first(),
    ).toBeNull();
    expect(
      await db
        .prepare("SELECT * FROM oauth_states WHERE hash=?")
        .bind(await sha256Hex(begin.cookie.split("=")[1]))
        .first(),
    ).toBeNull();
  },
);

it.each([
  ["context", { context: "another-login" }],
  ["provider", { providerId: "facebook.com" }],
  ["UID mismatch", { localId: "different-firebase-user" }],
  ["account confirmation", { needConfirmation: true }],
  ["pending MFA", { mfaPendingCredential: "pending-mfa" }],
  ["pending linking", { pendingToken: "pending-token" }],
  ["provider error", { errorMessage: "ERROR" }],
] as [string, Record<string, unknown>][])(
  "rejects Firebase response %s",
  async (_, overrides) => {
    responseOverrides = overrides;
    const begin = await start();
    const response = await callback(begin);
    expect(response.headers.get("location")).toContain(
      "auth_error=provider&auth_provider=google",
    );
    expect(response.headers.get("set-cookie")).not.toMatch(/myriad_student=/);
  },
);

it("requires a key ID on a signed Firebase token", async () => {
  missingKid = true;
  expect((await callback(await start())).headers.get("location")).toContain(
    "auth_error=provider",
  );
});

it("keeps Google, NYCU and guest submissions separate and verifies telemetry by provider and subject", async () => {
  const google = await signIn();
  const nycu = await signIn("nycu");
  const attempt = (
    identityKind: string,
    cookie: string,
    studentId = "same",
    origin = base,
  ) =>
    call("/api/exams/auth-exam/attempts", {
      method: "POST",
      headers: { ...authHeaders(cookie), Origin: origin },
      body: JSON.stringify({
        operationId: crypto.randomUUID(),
        problemVersion: version,
        problemId: "p",
        studentId,
        identityKind,
        deviceId: crypto.randomUUID(),
        code: "int main(){}",
      }),
    });
  expect((await attempt("google", "")).status).toBe(401);
  expect((await attempt("google", nycu.cookie)).status).toBe(401);
  expect((await attempt("nycu", google.cookie)).status).toBe(401);
  expect((await attempt("google", google.cookie, "someone-else")).status).toBe(
    401,
  );
  expect(
    (await attempt("google", google.cookie, "same", "https://evil.example"))
      .status,
  ).toBe(403);
  for (const [provider, cookie] of [
    ["google", google.cookie],
    ["nycu", nycu.cookie],
    ["guest", ""],
  ]) {
    const response = await attempt(provider, cookie);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      attempt: { participantId: `${provider}:same` },
    });
  }
  const history = await call(
    "/api/exams/auth-exam/submissions?student=same&identityKind=google",
    { headers: { Cookie: google.cookie } },
  );
  expect(await history.json()).toMatchObject({
    submissions: [{ participantId: "google:same", identityKind: "google" }],
  });
  const events = ["google", "nycu", "guest"].map((identityKind) => ({
    id: crypto.randomUUID(),
    sessionId: crypto.randomUUID(),
    operationId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    examId: "auth-exam",
    identityKind,
    studentId: "same",
    problemId: "p",
    mode: "submission",
    kind: "compile",
    outcome: "ok",
    startedAt: Date.now(),
    durationMs: 1,
  }));
  expect(
    (
      await call("/api/telemetry", {
        method: "POST",
        headers: authHeaders(google.cookie),
        body: JSON.stringify({ events }),
      })
    ).status,
  ).toBe(200);
  for (const event of events) {
    const stored = await db
      .prepare("SELECT event FROM browser_telemetry WHERE event_id=?")
      .bind(event.id)
      .first<{ event: string }>();
    expect(JSON.parse(stored!.event).identityVerified).toBe(
      event.identityKind === "google",
    );
  }
  subject = "x".repeat(255);
  const long = await signIn();
  expect((await attempt("google", long.cookie, subject)).status).toBe(201);
});

it("uses the same Google account for management permissions without merging a matching NYCU subject", async () => {
  subject = "admin";
  const admin = await signIn();
  expect(
    await (
      await call("/api/teacher/access", { headers: { Cookie: admin.cookie } })
    ).json(),
  ).toMatchObject({
    isAdmin: true,
    account: { provider: "google", subject: "admin" },
  });
  const nycuAdmin = await signIn("nycu");
  expect(
    await (
      await call("/api/teacher/access", {
        headers: { Cookie: nycuAdmin.cookie },
      })
    ).json(),
  ).toMatchObject({
    isAdmin: false,
    account: { provider: "nycu", subject: "admin" },
  });
  subject = "new-teacher";
  const teacher = await signIn();
  for (const [provider, expected] of [
    ["nycu", false],
    ["google", true],
  ] as const) {
    expect(
      (
        await call("/api/admin/creation-grants", {
          method: "POST",
          headers: authHeaders(admin.cookie),
          body: JSON.stringify({ provider, subject }),
        })
      ).status,
    ).toBe(201);
    expect(
      await (
        await call("/api/teacher/access", {
          headers: { Cookie: teacher.cookie },
        })
      ).json(),
    ).toMatchObject({
      canCreateExams: expected,
      account: { provider: "google", subject },
    });
  }
  const credential = await (
    await call("/api/teacher/tokens", {
      method: "POST",
      headers: authHeaders(teacher.cookie),
    })
  ).json<{ token: string }>();
  expect(
    (
      await call("/api/teacher/exams", {
        headers: { Authorization: `Bearer ${credential.token}` },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await call("/api/teacher/session", {
        method: "DELETE",
        headers: authHeaders(teacher.cookie),
      })
    ).status,
  ).toBe(200);
  expect(
    await (
      await call("/api/auth/session", { headers: { Cookie: teacher.cookie } })
    ).json(),
  ).toMatchObject({ account: null });
});
