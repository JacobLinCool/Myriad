CREATE TABLE student_sessions (
  hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX student_sessions_expiry ON student_sessions(expires_at);
CREATE TABLE oauth_states (
  hash TEXT PRIMARY KEY,
  verifier TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX oauth_states_expiry ON oauth_states(expires_at);
ALTER TABLE attempts ADD COLUMN identity_kind TEXT NOT NULL DEFAULT 'guest' CHECK(identity_kind IN ('guest','nycu'));
ALTER TABLE attempts ADD COLUMN participant_id TEXT NOT NULL DEFAULT '';
UPDATE attempts SET participant_id='guest:' || student_id;
CREATE INDEX attempts_participant ON attempts(exam_id,participant_id,sequence);
-- Cooldown keys now identify a participant, including the identity provider.
ALTER TABLE submission_cooldowns RENAME COLUMN student_id TO participant_id;
UPDATE submission_cooldowns SET participant_id='guest:' || participant_id;
