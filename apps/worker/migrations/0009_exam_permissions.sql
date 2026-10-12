-- Authentication identities are independent of permission to create or manage exams.
PRAGMA defer_foreign_keys=ON;
-- Existing installations must populate this reviewed mapping before migration.
-- Fresh installations have no teachers and need no mapping rows.
CREATE TABLE IF NOT EXISTS migration_teacher_identities (
  teacher_id TEXT PRIMARY KEY REFERENCES teachers(id),
  account_id TEXT NOT NULL REFERENCES teachers(id),
  provider TEXT NOT NULL,
  subject TEXT NOT NULL
);
CREATE TABLE migration_identity_check (valid INTEGER NOT NULL CHECK(valid=1));
INSERT INTO migration_identity_check SELECT CASE WHEN EXISTS (
  SELECT 1 FROM teachers t LEFT JOIN migration_teacher_identities m ON m.teacher_id=t.id WHERE m.teacher_id IS NULL
) THEN 0 ELSE 1 END;
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  name TEXT NOT NULL,
  UNIQUE(provider,subject)
);
INSERT INTO accounts
SELECT DISTINCT m.account_id,m.provider,m.subject,t.name FROM migration_teacher_identities m JOIN teachers t ON t.id=m.account_id;
INSERT INTO accounts SELECT 'nycu:' || username,'nycu',username,username FROM student_sessions s WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.provider='nycu' AND a.subject=s.username) GROUP BY username;
CREATE TABLE account_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
INSERT INTO account_tokens SELECT t.id,m.account_id,t.token_hash,0,t.revoked_at FROM teachers t JOIN migration_teacher_identities m ON m.teacher_id=t.id;
CREATE TABLE management_sessions (
  hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  expires_at INTEGER NOT NULL
);
INSERT INTO management_sessions SELECT s.hash,m.account_id,s.expires_at FROM teacher_sessions s JOIN teachers t ON t.id=s.teacher_id JOIN migration_teacher_identities m ON m.teacher_id=t.id WHERE t.revoked_at IS NULL;
CREATE TABLE exam_creation_grants (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id),
  granted_at INTEGER NOT NULL
);
INSERT INTO exam_creation_grants SELECT DISTINCT m.account_id,0 FROM teachers t JOIN migration_teacher_identities m ON m.teacher_id=t.id WHERE t.revoked_at IS NULL;
CREATE TABLE exam_catalog_scoped (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES accounts(id),
  revision TEXT,
  title TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  manifest TEXT,
  published_at INTEGER,
  rules TEXT NOT NULL DEFAULT '',
  policy TEXT NOT NULL DEFAULT 'best' CHECK(policy IN ('best','last'))
);
INSERT INTO exam_catalog_scoped SELECT e.id,m.account_id,e.revision,e.title,e.starts_at,e.ends_at,e.manifest,e.published_at,e.rules,e.policy FROM exam_catalog e JOIN migration_teacher_identities m ON m.teacher_id=e.teacher_id;
DROP TABLE exam_catalog;
ALTER TABLE exam_catalog_scoped RENAME TO exam_catalog;
CREATE INDEX exam_catalog_owner ON exam_catalog(owner_id,starts_at);
CREATE TABLE exam_collaborators (
  exam_id TEXT NOT NULL REFERENCES exam_catalog(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  invited_by TEXT NOT NULL REFERENCES accounts(id),
  invited_at INTEGER NOT NULL,
  PRIMARY KEY(exam_id,account_id)
);
CREATE INDEX exam_collaborators_account ON exam_collaborators(account_id,exam_id);
-- Preserve old ownership records as archival data, outside the active API.
CREATE TABLE archived_exam_owners (exam_id TEXT PRIMARY KEY REFERENCES exams(id),account_id TEXT NOT NULL REFERENCES accounts(id));
INSERT INTO archived_exam_owners SELECT l.exam_id,m.account_id FROM legacy_owners l JOIN migration_teacher_identities m ON m.teacher_id=l.teacher_id;
DROP TABLE legacy_owners;
DROP TABLE teacher_sessions;
DROP TABLE migration_teacher_identities;
DROP TABLE migration_identity_check;
DROP TABLE teachers;
PRAGMA defer_foreign_keys=OFF;
