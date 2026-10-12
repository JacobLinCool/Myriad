CREATE TABLE semantic_checks (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(id),
  status TEXT NOT NULL CHECK(status IN ('running','passed','failed','error')),
  lease_token TEXT NOT NULL,
  lease_until INTEGER NOT NULL,
  result TEXT,
  error TEXT
);
