CREATE TABLE teachers (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, revoked_at INTEGER);
CREATE TABLE teacher_sessions (hash TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES teachers(id), expires_at INTEGER NOT NULL);
CREATE TABLE legacy_owners (exam_id TEXT PRIMARY KEY REFERENCES exams(id), teacher_id TEXT NOT NULL REFERENCES teachers(id));
CREATE TABLE exam_catalog (
 id TEXT PRIMARY KEY, teacher_id TEXT NOT NULL REFERENCES teachers(id), revision TEXT,
 title TEXT NOT NULL, starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL,
 manifest TEXT, result_revision TEXT, published_at INTEGER
);
CREATE TABLE exam_revisions (
 exam_id TEXT NOT NULL REFERENCES exam_catalog(id), revision TEXT NOT NULL, bundle_key TEXT NOT NULL,
 manifest TEXT NOT NULL, staged_at INTEGER NOT NULL, PRIMARY KEY(exam_id, revision)
);
CREATE TABLE attempts (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
 exam_id TEXT NOT NULL REFERENCES exam_catalog(id), revision TEXT NOT NULL,
 problem_id TEXT NOT NULL, student_id TEXT NOT NULL, device_id TEXT NOT NULL,
 code TEXT NOT NULL, code_sha256 TEXT NOT NULL, request_hash TEXT NOT NULL,
 token_hash TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('running','complete','failed','expired')),
 created_at INTEGER NOT NULL, completed_at INTEGER, expires_at INTEGER NOT NULL,
 result TEXT
);
CREATE INDEX idx_attempt_exam ON attempts(exam_id, sequence);
CREATE INDEX idx_attempt_student ON attempts(exam_id, student_id, sequence);
CREATE TABLE submission_cooldowns (exam_id TEXT NOT NULL, student_id TEXT NOT NULL, operation_id TEXT NOT NULL, reserved_at INTEGER NOT NULL, PRIMARY KEY(exam_id, student_id));
CREATE TABLE attempt_claims (
 attempt_id TEXT NOT NULL REFERENCES attempts(id), idx INTEGER NOT NULL, claim TEXT NOT NULL, verdict TEXT NOT NULL,
 PRIMARY KEY(attempt_id, idx)
);
CREATE TABLE result_reports (
 exam_id TEXT NOT NULL REFERENCES exam_catalog(id), revision TEXT NOT NULL, report TEXT NOT NULL,
 scores TEXT NOT NULL, uploaded_at INTEGER NOT NULL, PRIMARY KEY(exam_id, revision)
);
