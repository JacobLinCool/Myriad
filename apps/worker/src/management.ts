import { Hono } from "hono";
import { analyticsId } from "./analytics.js";
import { enabledProviders } from "./auth-providers.js";
import { sha256Hex } from "@myriad/shared";
import {
  account,
  canCreate,
  ensureAccount,
  IdentitySchema,
  isAdministrator,
} from "./permissions.js";
import { exam, fail, requireAdmin, teacher, token, type Env } from "./core.js";
export const management = new Hono<{ Bindings: Env }>();
management.get("/api/teacher/access", async (c) => {
  const identity = await account(c);
  return c.json({
    account: identity && {
      ...identity,
      analyticsId: await analyticsId(
        c.env,
        identity.provider,
        identity.subject,
      ),
    },
    canCreateExams: identity ? await canCreate(c, identity.id) : false,
    isAdmin: isAdministrator(c, identity),
    providers: enabledProviders(c.env),
  });
});
management.get("/api/admin/creation-grants", async (c) => {
  await requireAdmin(c);
  return c.json(
    (
      await c.env.DB.prepare(
        "SELECT a.id,a.provider,a.subject,a.name,g.granted_at AS grantedAt FROM exam_creation_grants g JOIN accounts a ON a.id=g.account_id ORDER BY a.provider,a.subject",
      ).all()
    ).results,
  );
});
management.post("/api/admin/creation-grants", async (c) => {
  await requireAdmin(c);
  const identity = await ensureAccount(
    c,
    IdentitySchema.parse(await c.req.json()),
  );
  await c.env.DB.prepare(
    "INSERT INTO exam_creation_grants VALUES(?,?) ON CONFLICT(account_id) DO NOTHING",
  )
    .bind(identity.id, Date.now())
    .run();
  return c.json(identity, 201);
});
management.delete("/api/admin/creation-grants/:id", async (c) => {
  await requireAdmin(c);
  await c.env.DB.prepare("DELETE FROM exam_creation_grants WHERE account_id=?")
    .bind(c.req.param("id"))
    .run();
  return c.json({ revoked: true });
});
management.get("/api/teacher/exams/:eid/members", async (c) => {
  const e = await exam(c, true),
    id = await teacher(c);
  if (e.owner_id !== id) fail("只有考試擁有者可管理共同管理者", 403);
  return c.json(
    (
      await c.env.DB.prepare(
        "SELECT a.id,a.provider,a.subject,a.name FROM exam_collaborators m JOIN accounts a ON a.id=m.account_id WHERE m.exam_id=? ORDER BY a.provider,a.subject",
      )
        .bind(e.id)
        .all()
    ).results,
  );
});
management.post("/api/teacher/exams/:eid/members", async (c) => {
  const e = await exam(c, true),
    id = await teacher(c);
  if (e.owner_id !== id) fail("只有考試擁有者可管理共同管理者", 403);
  const member = await ensureAccount(
    c,
    IdentitySchema.parse(await c.req.json()),
  );
  if (member.id === id) fail("擁有者已具備管理權限", 409);
  await c.env.DB.prepare(
    "INSERT INTO exam_collaborators VALUES(?,?,?,?) ON CONFLICT(exam_id,account_id) DO NOTHING",
  )
    .bind(e.id, member.id, id, Date.now())
    .run();
  return c.json(member, 201);
});
management.delete("/api/teacher/exams/:eid/members/:id", async (c) => {
  const e = await exam(c, true),
    id = await teacher(c);
  if (e.owner_id !== id) fail("只有考試擁有者可管理共同管理者", 403);
  await c.env.DB.prepare(
    "DELETE FROM exam_collaborators WHERE exam_id=? AND account_id=?",
  )
    .bind(e.id, c.req.param("id"))
    .run();
  return c.json({ removed: true });
});
management.get("/api/teacher/tokens", async (c) => {
  const id = await teacher(c);
  return c.json(
    (
      await c.env.DB.prepare(
        "SELECT id,created_at AS createdAt FROM account_tokens WHERE account_id=? AND revoked_at IS NULL ORDER BY created_at DESC",
      )
        .bind(id)
        .all()
    ).results,
  );
});
management.post("/api/teacher/tokens", async (c) => {
  const id = await teacher(c);
  const credential = token(),
    tokenId = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO account_tokens VALUES(?,?,?,?,NULL)")
    .bind(tokenId, id, await sha256Hex(credential), Date.now())
    .run();
  return c.json({ id: tokenId, token: credential }, 201);
});
management.delete("/api/teacher/tokens/:id", async (c) => {
  const id = await teacher(c);
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE account_tokens SET revoked_at=? WHERE id=? AND account_id=?",
    ).bind(Date.now(), c.req.param("id"), id),
    c.env.DB.prepare("DELETE FROM management_sessions WHERE account_id=?").bind(
      id,
    ),
  ]);
  return c.json({ revoked: true });
});
