import { ensureAccount } from "./permissions.js";
import { analyticsId, background, capture } from "./analytics.js";
import { authProviders, enabledProviders } from "./auth-providers.js";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  AuthProviderSchema,
  identityLabel,
  sha256Hex,
  type AuthProvider,
  type IdentityKind,
} from "@myriad/shared";
import { fail, token, type AppContext, type Env } from "./core.js";
const SESSION = "myriad_student",
  STATE = "myriad_oauth_state";
export const participantId = (kind: IdentityKind, subject: string) =>
  `${kind}:${subject}`;
function cookieOptions(c: AppContext) {
  return {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax" as const,
    path: "/",
  };
}
/** The one validated origin registered with every enabled identity provider. */
function appOrigin(c: AppContext) {
  if (!c.env.APP_ORIGIN) fail("登入網址尚未設定", 503);
  const url = new URL(c.env.APP_ORIGIN);
  if (
    url.origin !== c.env.APP_ORIGIN ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    fail("登入網址設定錯誤", 503);
  return url.origin;
}
function origin(c: AppContext) {
  const expected = appOrigin(c);
  if (new URL(c.req.url).origin !== expected) fail("請使用正式登入網址", 403);
  return expected;
}
function sameOrigin(c: AppContext) {
  if (c.req.header("Origin") !== new URL(c.req.url).origin)
    fail("請重新開啟登入頁面", 403);
}
export async function studentAccount(c: AppContext) {
  const value = getCookie(c, SESSION);
  if (!value) return null;
  return c.env.DB.prepare(
    "SELECT a.provider,a.subject,a.name,s.expires_at FROM student_sessions s JOIN accounts a ON a.id=s.account_id WHERE s.hash=? AND s.expires_at>?",
  )
    .bind(await sha256Hex(value), Date.now())
    .first<{
      provider: AuthProvider;
      subject: string;
      name: string;
      expires_at: number;
    }>();
}
export async function requireParticipant(
  c: AppContext,
  kind: IdentityKind,
  subject: string,
) {
  if (kind !== "guest") {
    const account = await studentAccount(c);
    if (!account || account.provider !== kind || account.subject !== subject)
      fail(`請重新使用 ${identityLabel(kind)} 登入，或切換訪客作答`, 401);
    if (!["GET", "HEAD"].includes(c.req.method)) sameOrigin(c);
  }
  return participantId(kind, subject);
}
export const auth = new Hono<{ Bindings: Env }>();
auth.get("/api/auth/session", async (c) => {
  const account = await studentAccount(c);
  return c.json({
    providers: enabledProviders(c.env),
    account: account
      ? {
          analyticsId: await analyticsId(
            c.env,
            account.provider,
            account.subject,
          ),
          kind: account.provider,
          label: account.subject,
          displayName: account.name,
          key: participantId(account.provider, account.subject),
          expiresAt: account.expires_at,
        }
      : null,
  });
});
auth.delete("/api/auth/session", async (c) => {
  sameOrigin(c);
  const value = getCookie(c, SESSION);
  if (value)
    await c.env.DB.prepare("DELETE FROM student_sessions WHERE hash=?")
      .bind(await sha256Hex(value))
      .run();
  deleteCookie(c, SESSION, cookieOptions(c));
  return c.json({ ok: true });
});
auth.get("/api/auth/:provider/start", async (c) => {
  const provider = AuthProviderSchema.parse(c.req.param("provider"));
  if (!enabledProviders(c.env).includes(provider))
    fail(`${identityLabel(provider)} 登入尚未設定`, 503);
  const returnTo = c.req.query("returnTo") ?? "/exams";
  if (
    returnTo !== "/teacher" &&
    !/^\/exams(?:\/[A-Za-z0-9_-]+)*(?:\/)?$/.test(returnTo)
  )
    fail("返回網址無效");
  const expected = appOrigin(c);
  if (new URL(c.req.url).origin !== expected)
    return c.redirect(
      `${returnTo}?auth_error=origin&auth_provider=${provider}&expected=${encodeURIComponent(expected)}`,
    );
  const cookie = token();
  let login;
  try {
    login = await authProviders[provider].start(
      c.env,
      `${expected}/api/auth/${provider}/callback`,
      cookie,
    );
  } catch {
    return c.redirect(
      `${returnTo}?auth_error=provider&auth_provider=${provider}`,
    );
  }
  const previous = getCookie(c, STATE);
  if (previous)
    await c.env.DB.prepare("DELETE FROM oauth_states WHERE hash=?")
      .bind(await sha256Hex(previous))
      .run();
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM oauth_states WHERE expires_at<=?").bind(
      Date.now(),
    ),
    c.env.DB.prepare("DELETE FROM student_sessions WHERE expires_at<=?").bind(
      Date.now(),
    ),
    c.env.DB.prepare(
      "INSERT INTO oauth_states(hash,authorization_state,return_to,expires_at,provider,provider_data) VALUES(?,?,?,?,?,?)",
    ).bind(
      await sha256Hex(cookie),
      login.authorizationState,
      returnTo,
      Date.now() + 600000,
      provider,
      JSON.stringify(login.data),
    ),
  ]);
  setCookie(c, STATE, cookie, { ...cookieOptions(c), maxAge: 600 });
  return c.redirect(login.authorizationUrl);
});
auth.get("/api/auth/:provider/callback", async (c) => {
  const provider = AuthProviderSchema.parse(c.req.param("provider"));
  const base = origin(c),
    callback = new URL(c.req.url),
    state = callback.searchParams.get("state"),
    cookie = getCookie(c, STATE);
  const failed = (reason: string, returnTo = "/exams") =>
    c.redirect(
      `${base}${returnTo}?auth_error=${reason}&auth_provider=${provider}`,
    );
  deleteCookie(c, STATE, cookieOptions(c));
  if (!cookie) return failed("state");
  const pending = await c.env.DB.prepare(
    "DELETE FROM oauth_states WHERE hash=? AND expires_at>? RETURNING authorization_state,return_to,provider,provider_data",
  )
    .bind(await sha256Hex(cookie), Date.now())
    .first<{
      authorization_state: string;
      return_to: string;
      provider: AuthProvider;
      provider_data: string;
    }>();
  if (
    !pending ||
    pending.provider !== provider ||
    !state ||
    callback.searchParams.getAll("state").length !== 1 ||
    state !== pending.authorization_state
  )
    return failed("state");
  if (callback.searchParams.has("error"))
    return failed("cancelled", pending.return_to);
  const code = callback.searchParams.get("code");
  if (
    !code ||
    code.length > 4096 ||
    callback.searchParams.getAll("code").length !== 1 ||
    callback.toString().length > 16384 ||
    !enabledProviders(c.env).includes(provider)
  )
    return failed("provider", pending.return_to);
  try {
    const profile = await authProviders[provider].complete(
      c.env,
      callback,
      JSON.parse(pending.provider_data),
    );
    const account = await ensureAccount(
      c,
      { provider, subject: profile.subject },
      provider === "google" ? profile.displayName : undefined,
    );
    deleteCookie(c, "myriad_teacher", { path: "/api" });
    const session = token(),
      old = getCookie(c, SESSION);
    const statements = [
      c.env.DB.prepare(
        "INSERT INTO student_sessions(hash,account_id,expires_at) VALUES(?,?,?)",
      ).bind(await sha256Hex(session), account.id, Date.now() + 86400000),
    ];
    if (old)
      statements.push(
        c.env.DB.prepare("DELETE FROM student_sessions WHERE hash=?").bind(
          await sha256Hex(old),
        ),
      );
    await c.env.DB.batch(statements);
    setCookie(c, SESSION, session, { ...cookieOptions(c), maxAge: 86400 });
    capture(c.env, background(c), "login_succeeded", {
      distinct_id: await analyticsId(c.env, provider, profile.subject),
      provider,
      app_area: pending.return_to === "/teacher" ? "teacher" : "student",
    });
    return c.redirect(`${base}${pending.return_to}`);
  } catch {
    return failed("provider", pending.return_to);
  }
});
