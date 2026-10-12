import { ensureAccount } from "./permissions.js";
import { analyticsId, background, capture } from "./analytics.js";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { sha256Hex } from "@myriad/shared";
import { fail, token, type AppContext, type Env } from "./core.js";
const SESSION = "myriad_student",
  STATE = "myriad_oauth_state";
const provider = "https://id.nycu.edu.tw";
export const participantId = (kind: "guest" | "nycu", label: string) =>
  `${kind}:${label}`;
function cookieOptions(c: AppContext) {
  return {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax" as const,
    path: "/",
  };
}
/** The validated origin NYCU returns to. */
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
function configured(c: AppContext) {
  return !!(
    c.env.APP_ORIGIN &&
    c.env.NYCU_CLIENT_ID &&
    c.env.NYCU_CLIENT_SECRET
  );
}
function sameOrigin(c: AppContext) {
  if (c.req.header("Origin") !== new URL(c.req.url).origin)
    fail("請重新開啟登入頁面", 403);
}
export async function studentAccount(c: AppContext) {
  const value = getCookie(c, SESSION);
  if (!value) return null;
  return c.env.DB.prepare(
    "SELECT username,expires_at FROM student_sessions WHERE hash=? AND expires_at>?",
  )
    .bind(await sha256Hex(value), Date.now())
    .first<{ username: string; expires_at: number }>();
}
export async function requireParticipant(
  c: AppContext,
  kind: "guest" | "nycu",
  label: string,
) {
  if (kind === "nycu") {
    const account = await studentAccount(c);
    if (!account || account.username !== label)
      fail("請重新使用 NYCU 登入，或切換訪客作答", 401);
    if (!["GET", "HEAD"].includes(c.req.method)) sameOrigin(c);
  }
  return participantId(kind, label);
}
export const auth = new Hono<{ Bindings: Env }>();
auth.get("/api/auth/session", async (c) => {
  const account = await studentAccount(c);
  return c.json({
    nycuEnabled: configured(c),
    account: account
      ? {
          analyticsId: await analyticsId(c.env, "nycu", account.username),
          kind: "nycu",
          label: account.username,
          key: participantId("nycu", account.username),
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
auth.get("/api/auth/nycu/start", async (c) => {
  if (!configured(c)) fail("NYCU 登入尚未設定", 503);
  const returnTo = c.req.query("returnTo") ?? "/exams";
  if (
    returnTo !== "/teacher" &&
    !/^\/exams(?:\/[A-Za-z0-9_-]+)*(?:\/)?$/.test(returnTo)
  )
    fail("返回網址無效");
  // NYCU only returns to APP_ORIGIN, so another address (such as a different
  // local port) goes back to the page with an explanation instead of failing.
  const expected = appOrigin(c);
  if (new URL(c.req.url).origin !== expected)
    return c.redirect(
      `${returnTo}?auth_error=origin&expected=${encodeURIComponent(expected)}`,
    );
  const base = expected,
    state = token(),
    verifier = token();
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
    c.env.DB.prepare("INSERT INTO oauth_states VALUES(?,?,?,?)").bind(
      await sha256Hex(state),
      verifier,
      returnTo,
      Date.now() + 600000,
    ),
  ]);
  setCookie(c, STATE, state, { ...cookieOptions(c), maxAge: 600 });
  const digest = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  const challenge = btoa(String.fromCharCode(...digest))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  const url = new URL("/o/authorize/", provider);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: c.env.NYCU_CLIENT_ID!,
    redirect_uri: `${base}/api/auth/nycu/callback`,
    scope: "profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return c.redirect(url.toString());
});
auth.get("/api/auth/nycu/callback", async (c) => {
  const base = origin(c),
    state = c.req.query("state"),
    cookie = getCookie(c, STATE);
  deleteCookie(c, STATE, cookieOptions(c));
  if (!state || !cookie || state !== cookie)
    return c.redirect(`${base}/exams?auth_error=state`);
  const pending = await c.env.DB.prepare(
    "DELETE FROM oauth_states WHERE hash=? AND expires_at>? RETURNING verifier,return_to",
  )
    .bind(await sha256Hex(state), Date.now())
    .first<{ verifier: string; return_to: string }>();
  if (!pending) return c.redirect(`${base}/exams?auth_error=state`);
  const failed = (reason: string) =>
    c.redirect(`${base}${pending.return_to}?auth_error=${reason}`);
  if (c.req.query("error")) return failed("cancelled");
  const code = c.req.query("code");
  if (!code || code.length > 4096 || !configured(c)) return failed("provider");
  try {
    const response = await fetch(`${provider}/o/token/`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${base}/api/auth/nycu/callback`,
        client_id: c.env.NYCU_CLIENT_ID!,
        client_secret: c.env.NYCU_CLIENT_SECRET!,
        code_verifier: pending.verifier,
      }),
    });
    if (!response.ok) return failed("provider");
    const credentials = await response.json<{
      access_token?: string;
      token_type?: string;
    }>();
    if (
      typeof credentials.access_token !== "string" ||
      credentials.token_type?.toLowerCase() !== "bearer"
    )
      return failed("provider");
    const profileResponse = await fetch(`${provider}/api/profile/`, {
      redirect: "manual",
      signal: AbortSignal.timeout(15000),
      headers: {
        Authorization: `Bearer ${credentials.access_token}`,
        Accept: "application/json",
      },
    });
    if (!profileResponse.ok) return failed("provider");
    const profile = await profileResponse.json<{ username?: string }>();
    if (
      typeof profile.username !== "string" ||
      !profile.username.trim() ||
      profile.username !== profile.username.trim() ||
      profile.username.length > 64 ||
      /[\x00-\x1f\x7f]/.test(profile.username)
    )
      return failed("profile");
    await ensureAccount(c, { provider: "nycu", subject: profile.username });
    deleteCookie(c, "myriad_teacher", { path: "/api" });
    const session = token(),
      old = getCookie(c, SESSION);
    const statements = [
      c.env.DB.prepare("INSERT INTO student_sessions VALUES(?,?,?)").bind(
        await sha256Hex(session),
        profile.username,
        Date.now() + 86400000,
      ),
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
      distinct_id: await analyticsId(c.env, "nycu", profile.username),
      provider: "nycu",
      app_area: pending.return_to === "/teacher" ? "teacher" : "student",
    });
    return c.redirect(`${base}${pending.return_to}`);
  } catch {
    return failed("provider");
  }
});
