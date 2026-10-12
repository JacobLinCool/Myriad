import { getCookie } from "hono/cookie";
import { z } from "zod";
import { sha256Hex } from "@myriad/shared";
import { bearer, fail, type AppContext } from "./core.js";
export const IdentitySchema = z
  .object({
    provider: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    subject: z.string().trim().min(1).max(256),
  })
  .strict();
export interface Account {
  id: string;
  provider: string;
  subject: string;
  name: string;
}
export async function ensureAccount(
  c: AppContext,
  identity: z.infer<typeof IdentitySchema>,
): Promise<Account> {
  await c.env.DB.prepare(
    "INSERT INTO accounts(id,provider,subject,name) VALUES(?,?,?,?) ON CONFLICT(provider,subject) DO NOTHING",
  )
    .bind(
      crypto.randomUUID(),
      identity.provider,
      identity.subject,
      identity.subject,
    )
    .run();
  return (await c.env.DB.prepare(
    "SELECT * FROM accounts WHERE provider=? AND subject=?",
  )
    .bind(identity.provider, identity.subject)
    .first<Account>())!;
}
export function checkSessionOrigin(c: AppContext) {
  if (
    !["GET", "HEAD"].includes(c.req.method) &&
    c.req.header("Origin") !== new URL(c.req.url).origin
  )
    fail("Invalid session origin", 403);
}
/** Only verified provider sessions and explicitly issued API credentials resolve identities. */
export async function account(c: AppContext): Promise<Account | null> {
  const credential = bearer(c);
  if (credential)
    return c.env.DB.prepare(
      "SELECT a.* FROM accounts a JOIN account_tokens t ON t.account_id=a.id WHERE t.hash=? AND t.revoked_at IS NULL",
    )
      .bind(await sha256Hex(credential))
      .first<Account>();
  const management = getCookie(c, "myriad_teacher");
  if (management) {
    checkSessionOrigin(c);
    const found = await c.env.DB.prepare(
      "SELECT a.* FROM accounts a JOIN management_sessions s ON s.account_id=a.id WHERE s.hash=? AND s.expires_at>?",
    )
      .bind(await sha256Hex(management), Date.now())
      .first<Account>();
    if (found) return found;
  }
  const oauth = getCookie(c, "myriad_student");
  if (!oauth) return null;
  checkSessionOrigin(c);
  // NYCU's verified subject is username. New providers must implement their own verified-session adapter.
  return c.env.DB.prepare(
    "SELECT a.* FROM accounts a JOIN student_sessions s ON a.provider='nycu' AND a.subject=s.username WHERE s.hash=? AND s.expires_at>?",
  )
    .bind(await sha256Hex(oauth), Date.now())
    .first<Account>();
}
export function isAdministrator(c: AppContext, identity: Account | null) {
  if (!identity) return false;
  const configured = JSON.parse(c.env.ADMIN_IDENTITIES ?? "[]");
  const administrators = z.array(IdentitySchema).parse(configured);
  return administrators.some(
    (a) => a.provider === identity.provider && a.subject === identity.subject,
  );
}
export async function canCreate(c: AppContext, id: string) {
  return !!(await c.env.DB.prepare(
    "SELECT account_id FROM exam_creation_grants WHERE account_id=?",
  )
    .bind(id)
    .first());
}
export async function requireCreator(c: AppContext, id: string) {
  if (!(await canCreate(c, id))) fail("建立考試需要助教許可", 403);
}
export async function canManage(
  c: AppContext,
  examId: string,
  ownerId: string,
  id: string,
) {
  return (
    ownerId === id ||
    !!(await c.env.DB.prepare(
      "SELECT account_id FROM exam_collaborators WHERE exam_id=? AND account_id=?",
    )
      .bind(examId, id)
      .first())
  );
}
