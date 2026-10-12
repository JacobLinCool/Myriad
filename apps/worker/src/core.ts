import { account, isAdministrator, canManage } from "./permissions.js";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { sha256Hex, type BundleContent } from "@myriad/shared";
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  ASSETS?: Fetcher;
  OPENAI_API_KEY?: string;
  OPENAI_SEMANTIC_MODEL?: string;
  /** PostHog project key; analytics is off without it. */
  POSTHOG_KEY?: string;
  /** PostHog ingestion host, e.g. https://us.i.posthog.com. */
  POSTHOG_HOST?: string;
  ADMIN_TOKEN?: string;
  ADMIN_IDENTITIES?: string;
  APP_ORIGIN?: string;
  NYCU_CLIENT_ID?: string;
  NYCU_CLIENT_SECRET?: string;
  ATTEMPT_SECRET: string;
}
export type AppContext = Context<{ Bindings: Env }>;
export interface ExamRow {
  id: string;
  owner_id: string;
  revision: string | null;
  title: string;
  starts_at: number;
  ends_at: number;
  manifest: string;
  rules: string;
  policy: "best" | "last";
  published_at: number | null;
}
export type Manifest = Omit<BundleContent, "inputs"> & {
  inputs: Omit<BundleContent["inputs"][number], "content">[];
};
export function fail(
  message: string,
  status: 400 | 401 | 403 | 404 | 409 | 429 | 503 = 400,
): never {
  throw new HTTPException(status, { message });
}
export function bearer(c: AppContext) {
  return c.req.header("Authorization")?.match(/^Bearer (.+)$/)?.[1];
}
export async function requireAdmin(c: AppContext) {
  if (c.env.ADMIN_TOKEN && bearer(c) === c.env.ADMIN_TOKEN) return;
  const identity = await account(c);
  if (!identity) fail("Administrator authentication required", 401);
  if (!isAdministrator(c, identity)) fail("Administrator required", 403);
}
export async function teacher(c: AppContext): Promise<string> {
  const identity = await account(c);
  if (!identity) fail("Management authentication required", 401);
  return identity.id;
}
// Middleware and handlers of one request share the exam row and preview check.
const examOf = new WeakMap<AppContext, Promise<ExamRow>>();
const previewOf = new WeakMap<AppContext, Promise<boolean>>();
export function exam(c: AppContext, owned = false): Promise<ExamRow> {
  if (owned) return loadExam(c, true);
  let row = examOf.get(c);
  if (!row) examOf.set(c, (row = loadExam(c, false)));
  return row;
}
async function loadExam(c: AppContext, owned: boolean): Promise<ExamRow> {
  const owner = owned ? await teacher(c) : null;
  const row = await c.env.DB.prepare("SELECT * FROM exam_catalog WHERE id=?")
    .bind(c.req.param("eid"))
    .first<ExamRow>();
  if (
    !row ||
    (owner && !(await canManage(c, row.id, row.owner_id, owner))) ||
    (!owned && !row.revision)
  )
    fail("Exam not found", 404);
  return row;
}
/**
 * A teacher opening a published exam they manage with `?preview=1` sees it as a
 * student would, outside its schedule. A preview request from anyone else is
 * rejected rather than silently downgraded.
 */
export function previewing(c: AppContext, e: ExamRow): Promise<boolean> {
  let result = previewOf.get(c);
  if (!result) {
    result = (async () => {
      if (c.req.query("preview") !== "1") return false;
      const tid = await teacher(c).catch(() => null);
      if (!tid || !(await canManage(c, e.id, e.owner_id, tid)))
        fail("Teacher preview requires exam management permission", 403);
      return true;
    })();
    previewOf.set(c, result);
  }
  return result;
}
/** Whether students (or a previewing teacher) may use the exam right now. */
export async function examOpen(c: AppContext, e: ExamRow) {
  const now = Date.now();
  if (now >= e.ends_at) return false;
  return now >= e.starts_at || (await previewing(c, e));
}
export function manifest(row: ExamRow): Manifest {
  return JSON.parse(row.manifest);
}
/** The manifest of a specific upload, so work started on it finishes on it. */
export async function revisionManifest(
  db: D1Database,
  examId: string,
  revision: string,
): Promise<Manifest> {
  const row = await db
    .prepare(
      "SELECT manifest FROM exam_revisions WHERE exam_id=? AND revision=?",
    )
    .bind(examId, revision)
    .first<{ manifest: string }>();
  if (!row) fail("Revision not found", 404);
  return JSON.parse(row.manifest);
}
export function inputKey(
  examId: string,
  problemId: string,
  version: string,
  index: number,
) {
  return `inputs/${examId}/${problemId}/${version}/${index}.in`;
}
/**
 * Serves an R2 object through the Workers cache in front of R2. Only for
 * content-addressed keys (toolchains by path, tests by problem version): a
 * cached copy is never revalidated. Access checks stay with the caller.
 */
export async function immutableObject(
  c: AppContext,
  key: string,
  contentType?: string,
): Promise<Response | null> {
  const cache =
    typeof caches === "undefined"
      ? undefined
      : (caches as unknown as { default: Cache }).default;
  const url = new URL(
    `/__r2/${key.split("/").map(encodeURIComponent).join("/")}`,
    c.req.url,
  ).toString();
  const hit = await cache?.match(url);
  if (hit) {
    // Copy so later middleware can still set headers.
    const response = new Response(hit.body, hit);
    response.headers.set("X-Myriad-Cache", "hit");
    return response;
  }
  const object = await c.env.BUCKET.get(key);
  if (!object) return null;
  const response = new Response(object.body, {
    headers: {
      "Content-Type":
        contentType ??
        object.httpMetadata?.contentType ??
        "application/octet-stream",
      "Content-Length": String(object.size),
      "Cache-Control": "public,max-age=31536000,immutable",
    },
  });
  if (!cache) return response;
  const stored = cache.put(url, response.clone()).catch(() => {});
  try {
    c.executionCtx.waitUntil(stored);
  } catch {
    await stored;
  }
  const served = new Response(response.body, response);
  served.headers.set("X-Myriad-Cache", "miss");
  return served;
}
export function token() {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replaceAll("-", "");
}
export async function attemptToken(
  secret: string,
  id: string,
  hash: string,
): Promise<string> {
  if (!secret || secret.length < 32)
    fail("ATTEMPT_SECRET is not configured", 503);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return [
    ...new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${id}:${hash}`),
      ),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function page(c: AppContext) {
  const after = Number(c.req.query("after") ?? 0),
    limit = Number(c.req.query("limit") ?? 500);
  if (
    !Number.isSafeInteger(after) ||
    after < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 1000
  )
    fail("Invalid pagination");
  return { after, limit };
}
