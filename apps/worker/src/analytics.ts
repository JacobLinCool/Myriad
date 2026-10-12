import type { AppContext, Env } from "./core.js";
const DEFAULT_HOST = "https://us.i.posthog.com";
type Properties = Record<string, unknown>;
/** Exam venues may allow only this origin, so the browser reaches PostHog through it. */
export async function proxyPostHog(c: AppContext): Promise<Response> {
  const host = new URL(c.env.POSTHOG_HOST ?? DEFAULT_HOST);
  const path = c.req.path.slice("/ingest".length) || "/";
  // Scripts and remote config are served from the region's asset host.
  if (/^\/(static|array)\//.test(path))
    host.hostname = host.hostname.replace(/^(\w+)\.i\./, "$1-assets.i.");
  const url = new URL(path + new URL(c.req.url).search, host);
  const headers = new Headers(c.req.raw.headers);
  // Our session cookies stay on our origin.
  headers.delete("cookie");
  headers.delete("host");
  const ip = c.req.header("CF-Connecting-IP");
  if (ip) headers.set("X-Forwarded-For", ip);
  const upstream = await fetch(url, {
    method: c.req.method,
    headers,
    body: ["GET", "HEAD"].includes(c.req.method) ? undefined : c.req.raw.body,
    redirect: "manual",
  });
  const response = new Response(upstream.body, upstream);
  response.headers.delete("set-cookie");
  return response;
}
/**
 * A stable pseudonym for a person: PostHog never receives student IDs, and the
 * same NYCU user is one person whether studying or teaching.
 */
export async function analyticsId(
  env: Env,
  provider: string,
  subject: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`myriad-analytics:${env.ATTEMPT_SECRET ?? ""}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${provider}:${subject}`),
  );
  return `u_${[...new Uint8Array(digest).slice(0, 16)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")}`;
}
/** Guests are unverified, so their events never create person profiles. */
export async function participantDistinct(
  env: Env,
  kind: "guest" | "nycu",
  student: string,
): Promise<Properties & { distinct_id: string }> {
  return {
    distinct_id: await analyticsId(env, kind, student),
    identity_kind: kind,
    ...(kind === "guest" ? { $process_person_profile: false } : {}),
  };
}
export function background(c: AppContext) {
  return (work: Promise<unknown>) => {
    try {
      c.executionCtx.waitUntil(work);
    } catch {
      // Outside a request context (tests) the work simply runs unattended.
    }
  };
}
/** Server events are best effort: analytics never delays or fails a request. */
export function capture(
  env: Env,
  waitUntil: (work: Promise<unknown>) => void,
  event: string,
  properties: Properties & { distinct_id: string },
) {
  if (!env.POSTHOG_KEY) return;
  waitUntil(
    fetch(new URL("/i/v0/e/", env.POSTHOG_HOST ?? DEFAULT_HOST), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        api_key: env.POSTHOG_KEY,
        event,
        properties: {
          $lib: "myriad-worker",
          environment: env.APP_ORIGIN?.startsWith("https:")
            ? "production"
            : "development",
          ...properties,
        },
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {}),
  );
}
export function captureException(
  env: Env,
  waitUntil: (work: Promise<unknown>) => void,
  error: unknown,
  properties: Properties,
) {
  const e = error instanceof Error ? error : new Error(String(error));
  capture(env, waitUntil, "$exception", {
    distinct_id: "myriad-worker",
    $process_person_profile: false,
    $exception_list: [
      {
        type: e.name,
        value: e.message,
        mechanism: { handled: false, synthetic: false },
      },
    ],
    $exception_stack_trace_raw: e.stack,
    ...properties,
  });
}
