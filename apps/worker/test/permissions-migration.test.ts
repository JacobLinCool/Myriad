import { expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
it("migrates identities, ownership and credentials without losing referenced exam data", async () => {
  const mf = new Miniflare({
    modules: true,
    script: "export default {fetch(){return new Response('ok')}}",
    compatibilityDate: "2024-10-01",
    d1Databases: ["DB"],
  });
  try {
    const db = await mf.getD1Database("DB");
    const statements = (sql: string) =>
      sql
        .replace(/--[^\n]*/g, "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
    for (const file of (await readdir("migrations"))
      .sort()
      .filter((f) => f < "0009")) {
      for (const sql of statements(
        await readFile(`migrations/${file}`, "utf8"),
      ))
        await db.prepare(sql).run();
    }
    await db
      .prepare(
        "INSERT INTO teachers VALUES('t','Teacher','hash',NULL),('revoked','Revoked','oldhash',1)",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO teacher_sessions VALUES('session','t',1000),('revoked-session','revoked',1000)",
      )
      .run();
    await db
      .prepare("INSERT INTO student_sessions VALUES('oauth','student',1000)")
      .run();
    await db
      .prepare(
        "INSERT INTO exam_catalog(id,teacher_id,title,starts_at,ends_at) VALUES('e','t','Exam',1,2)",
      )
      .run();
    await db
      .prepare("INSERT INTO exam_revisions VALUES('e','r','key','{}',1)")
      .run();
    await db
      .prepare(
        "INSERT INTO attempts(id,exam_id,revision,problem_id,student_id,device_id,code,code_sha256,request_hash,token_hash,status,created_at,expires_at) VALUES('a','e','r','p','s','d','code','hash','req','token','running',1,2)",
      )
      .run();
    await db
      .prepare(
        "CREATE TABLE migration_teacher_identities (teacher_id TEXT PRIMARY KEY REFERENCES teachers(id),account_id TEXT NOT NULL REFERENCES teachers(id),provider TEXT NOT NULL,subject TEXT NOT NULL)",
      )
      .run();
    await expect(
      db.batch(
        statements(
          await readFile("migrations/0009_exam_permissions.sql", "utf8"),
        ).map((sql) => db.prepare(sql)),
      ),
    ).rejects.toThrow();
    expect(
      await db.prepare("SELECT COUNT(*) AS count FROM teachers").first(),
    ).toEqual({ count: 2 });
    await db
      .prepare(
        "INSERT INTO migration_teacher_identities VALUES('t','t','nycu','student'),('revoked','t','nycu','student')",
      )
      .run();
    await db.batch(
      statements(
        await readFile("migrations/0009_exam_permissions.sql", "utf8"),
      ).map((sql) => db.prepare(sql)),
    );
    expect(
      await db
        .prepare("SELECT owner_id FROM exam_catalog WHERE id='e'")
        .first(),
    ).toEqual({ owner_id: "t" });
    expect(
      (await db.prepare("SELECT account_id FROM exam_creation_grants").all())
        .results,
    ).toEqual([{ account_id: "t" }]);
    expect(
      await db
        .prepare("SELECT revoked_at FROM account_tokens WHERE id='revoked'")
        .first(),
    ).toEqual({ revoked_at: 1 });
    expect(
      await db
        .prepare(
          "SELECT account_id FROM management_sessions WHERE hash='session'",
        )
        .first(),
    ).toEqual({ account_id: "t" });
    expect(
      await db
        .prepare("SELECT provider,subject FROM accounts WHERE id='t'")
        .first(),
    ).toEqual({ provider: "nycu", subject: "student" });
    expect(
      await db.prepare("SELECT id FROM attempts WHERE exam_id='e'").first(),
    ).toEqual({ id: "a" });
    expect(
      await db
        .prepare("SELECT revision FROM exam_revisions WHERE exam_id='e'")
        .first(),
    ).toEqual({ revision: "r" });
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    expect((await db.prepare("SELECT id FROM accounts").all()).results).toEqual(
      [{ id: "t" }],
    );
    expect(
      await db
        .prepare("SELECT account_id FROM account_tokens WHERE id='revoked'")
        .first(),
    ).toEqual({ account_id: "t" });
    expect(
      await db
        .prepare(
          "SELECT hash FROM management_sessions WHERE hash='revoked-session'",
        )
        .first(),
    ).toBeNull();
  } finally {
    await mf.dispose();
  }
});
