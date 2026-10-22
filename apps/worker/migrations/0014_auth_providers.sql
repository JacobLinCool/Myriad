-- Keep existing NYCU sessions and identity keys while allowing other providers.
PRAGMA defer_foreign_keys=ON;
INSERT INTO accounts(id,provider,subject,name)
SELECT 'nycu:' || username,'nycu',username,username FROM student_sessions s
WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a.provider='nycu' AND a.subject=s.username)
GROUP BY username;
CREATE TABLE student_sessions_accounts (
  hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  expires_at INTEGER NOT NULL
);
INSERT INTO student_sessions_accounts
SELECT s.hash,a.id,s.expires_at FROM student_sessions s
JOIN accounts a ON a.provider='nycu' AND a.subject=s.username;
DROP TABLE student_sessions;
ALTER TABLE student_sessions_accounts RENAME TO student_sessions;
CREATE INDEX student_sessions_expiry ON student_sessions(expires_at);
-- Pending logins expire at deployment; fresh logins bind the provider and authorization state.
DROP TABLE oauth_states;
CREATE TABLE oauth_states (
  hash TEXT PRIMARY KEY,
  authorization_state TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('nycu','google')),
  provider_data TEXT NOT NULL CHECK(json_valid(provider_data))
);
CREATE INDEX oauth_states_expiry ON oauth_states(expires_at);
-- Preserve the high-water mark even when the latest attempts were deleted.
CREATE TABLE migration_attempt_sequence (seq INTEGER NOT NULL);
INSERT INTO migration_attempt_sequence SELECT seq FROM sqlite_sequence WHERE name='attempts';
CREATE TABLE attempts_providers (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  exam_id TEXT NOT NULL REFERENCES exam_catalog(id),
  revision TEXT NOT NULL,
  problem_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  code TEXT NOT NULL,
  code_sha256 TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','complete','failed','expired')),
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  expires_at INTEGER NOT NULL,
  result TEXT,
  identity_kind TEXT NOT NULL DEFAULT 'guest' CHECK(identity_kind IN ('guest','nycu','google')),
  participant_id TEXT NOT NULL DEFAULT '',
  preview INTEGER NOT NULL DEFAULT 0 CHECK(preview IN (0,1)),
  problem_version TEXT,
  client_ip TEXT,
  user_agent TEXT
);
INSERT INTO attempts_providers (
  sequence,id,exam_id,revision,problem_id,student_id,device_id,code,code_sha256,
  request_hash,token_hash,status,created_at,completed_at,expires_at,result,
  identity_kind,participant_id,preview,problem_version,client_ip,user_agent
)
SELECT sequence,id,exam_id,revision,problem_id,student_id,device_id,code,code_sha256,
  request_hash,token_hash,status,created_at,completed_at,expires_at,result,
  identity_kind,participant_id,preview,problem_version,client_ip,user_agent
FROM attempts;
DROP TABLE attempts;
ALTER TABLE attempts_providers RENAME TO attempts;
UPDATE sqlite_sequence SET seq=MAX(seq,COALESCE((SELECT seq FROM migration_attempt_sequence),0)) WHERE name='attempts';
INSERT INTO sqlite_sequence(name,seq)
SELECT 'attempts',seq FROM migration_attempt_sequence WHERE NOT EXISTS (SELECT 1 FROM sqlite_sequence WHERE name='attempts');
DROP TABLE migration_attempt_sequence;
CREATE INDEX idx_attempt_exam ON attempts(exam_id,sequence);
CREATE INDEX idx_attempt_student ON attempts(exam_id,student_id,sequence);
CREATE INDEX attempts_participant ON attempts(exam_id,participant_id,sequence);
CREATE INDEX attempts_preview ON attempts(exam_id,preview,sequence);
CREATE INDEX attempts_problem ON attempts(exam_id,preview,problem_id,problem_version,sequence);
CREATE INDEX attempts_participant_preview ON attempts(exam_id,participant_id,preview,sequence);
CREATE INDEX attempts_running ON attempts(exam_id,status,expires_at);
PRAGMA defer_foreign_keys=OFF;
