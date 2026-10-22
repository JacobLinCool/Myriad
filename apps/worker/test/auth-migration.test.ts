import { expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { createTestRuntime } from "./runtime";

const statements = (sql: string) =>
  sql
    .replace(/--[^\n]*/g, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

it("migrates populated login and submission tables without changing identities, foreign keys or sequence cursors", async () => {
  const runtime = createTestRuntime({
    script: "export default {fetch(){return new Response('ok')}}",
  });
  try {
    const db = await runtime.getD1Database("DB");
    for (const file of (await readdir("migrations"))
      .sort()
      .filter((file) => file < "0014")) {
      await db.batch(
        statements(await readFile(`migrations/${file}`, "utf8")).map((sql) =>
          db.prepare(sql),
        ),
      );
    }
    await db.batch([
      db.prepare(
        "INSERT INTO accounts VALUES('nycu-account','nycu','same','Existing name'),('google-account','google','same','Google name')",
      ),
      db.prepare(
        "INSERT INTO student_sessions VALUES('old-session','same',4000000000000)",
      ),
      db.prepare(
        "INSERT INTO management_sessions VALUES('manager','nycu-account',4000000000000)",
      ),
      db.prepare(
        "INSERT INTO account_tokens VALUES('cli','nycu-account','cli-hash',1,NULL)",
      ),
      db.prepare("INSERT INTO exam_creation_grants VALUES('nycu-account',1)"),
      db.prepare(
        "INSERT INTO oauth_states VALUES('old-state','verifier','/teacher',4000000000000)",
      ),
      db.prepare(
        "INSERT INTO exam_catalog(id,owner_id,title,starts_at,ends_at) VALUES('exam','nycu-account','Exam',1,2)",
      ),
      db.prepare(
        "INSERT INTO exam_revisions VALUES('exam','revision','bundle','{}',1)",
      ),
      db.prepare(`INSERT INTO attempts(sequence,id,exam_id,revision,problem_id,student_id,device_id,code,code_sha256,request_hash,token_hash,status,created_at,completed_at,expires_at,result,identity_kind,participant_id,preview,problem_version,client_ip,user_agent)
        VALUES(42,'attempt','exam','revision','p','same','device','int main(){}','sha','request','token','complete',1,2,3,'{}','nycu','nycu:same',1,'version','192.0.2.1','test-browser')`),
      db.prepare(`INSERT INTO attempts(sequence,id,exam_id,revision,problem_id,student_id,device_id,code,code_sha256,request_hash,token_hash,status,created_at,expires_at,identity_kind,participant_id)
        VALUES(43,'guest-attempt','exam','revision','p','same','device','code','sha','request','token','running',1,2,'guest','guest:same'),
        (1000,'deleted-attempt','exam','revision','p','same','device','code','sha','request','token','running',1,2,'guest','guest:same')`),
      db.prepare("INSERT INTO attempt_claims VALUES('attempt',0,'{}','{}')"),
      db.prepare(
        "INSERT INTO semantic_checks VALUES('attempt','passed','lease',3,'{}',NULL)",
      ),
      db.prepare(
        "INSERT INTO submission_cooldowns VALUES('exam','nycu:same','attempt',1)",
      ),
    ]);
    // A deleted row can still be held as an export cursor. Rebuilding must not reuse it.
    await db.prepare("DELETE FROM attempts WHERE id='deleted-attempt'").run();
    const attempts = (
      await db.prepare("SELECT * FROM attempts ORDER BY sequence").all()
    ).results;
    const indexes = async () =>
      (
        await db
          .prepare("PRAGMA index_list(attempts)")
          .all<{ name: string; origin: string }>()
      ).results
        .filter((index) => index.origin === "c")
        .map((index) => index.name)
        .sort();
    const beforeIndexes = await indexes();

    await db.batch(
      statements(
        await readFile("migrations/0014_auth_providers.sql", "utf8"),
      ).map((sql) => db.prepare(sql)),
    );

    expect(
      (await db.prepare("SELECT * FROM attempts ORDER BY sequence").all())
        .results,
    ).toEqual(attempts);
    expect(await indexes()).toEqual(beforeIndexes);
    expect(
      await db
        .prepare(
          "SELECT s.hash,s.expires_at,a.id,a.provider,a.subject,a.name FROM student_sessions s JOIN accounts a ON a.id=s.account_id",
        )
        .first(),
    ).toEqual({
      hash: "old-session",
      expires_at: 4000000000000,
      id: "nycu-account",
      provider: "nycu",
      subject: "same",
      name: "Existing name",
    });
    expect(
      await db.prepare("SELECT account_id FROM management_sessions").first(),
    ).toEqual({ account_id: "nycu-account" });
    expect(
      await db.prepare("SELECT account_id FROM account_tokens").first(),
    ).toEqual({ account_id: "nycu-account" });
    expect(
      await db.prepare("SELECT account_id FROM exam_creation_grants").first(),
    ).toEqual({ account_id: "nycu-account" });
    expect(
      (await db.prepare("SELECT * FROM oauth_states").all()).results,
    ).toEqual([]);
    expect(await db.prepare("SELECT * FROM attempt_claims").first()).toEqual({
      attempt_id: "attempt",
      idx: 0,
      claim: "{}",
      verdict: "{}",
    });
    expect(await db.prepare("SELECT * FROM semantic_checks").first()).toEqual({
      attempt_id: "attempt",
      status: "passed",
      lease_token: "lease",
      lease_until: 3,
      result: "{}",
      error: null,
    });
    expect(
      await db
        .prepare("SELECT participant_id FROM submission_cooldowns")
        .first(),
    ).toEqual({ participant_id: "nycu:same" });
    expect(
      (await db.prepare("PRAGMA foreign_key_check").all()).results,
    ).toEqual([]);
    for (const table of ["attempt_claims", "semantic_checks"]) {
      expect(
        (
          await db
            .prepare(`PRAGMA foreign_key_list(${table})`)
            .all<{ table: string }>()
        ).results.map((key) => key.table),
      ).toEqual(["attempts"]);
    }
    const google = await db
      .prepare(
        `INSERT INTO attempts(id,exam_id,revision,problem_id,student_id,device_id,code,code_sha256,request_hash,token_hash,status,created_at,expires_at,identity_kind,participant_id)
      VALUES('google-attempt','exam','revision','p','same','device','code','sha','request','token','running',1,2,'google','google:same') RETURNING sequence,participant_id`,
      )
      .first();
    expect(google).toEqual({ sequence: 1001, participant_id: "google:same" });
    await expect(
      db
        .prepare(
          "UPDATE attempts SET identity_kind='unknown' WHERE id='google-attempt'",
        )
        .run(),
    ).rejects.toThrow();
    await expect(
      db
        .prepare("INSERT INTO attempt_claims VALUES('absent',0,'{}','{}')")
        .run(),
    ).rejects.toThrow();
  } finally {
    await runtime.dispose();
  }
});
