-- Migration 0001: Initial schema for light-judge

CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  salt TEXT NOT NULL,
  config TEXT
);

CREATE TABLE IF NOT EXISTS problems (
  exam_id TEXT NOT NULL,
  id TEXT NOT NULL,
  ord INTEGER NOT NULL,
  title TEXT NOT NULL,
  statement_md TEXT NOT NULL,
  test_count INTEGER NOT NULL,
  groups TEXT NOT NULL,          -- JSON array of { name: string, tests: number[] }
  limits TEXT NOT NULL,          -- JSON object of ProblemLimits
  normalize TEXT NOT NULL,       -- "trim" | "exact"
  sample_cases TEXT NOT NULL,    -- JSON array of sample cases
  PRIMARY KEY (exam_id, id),
  FOREIGN KEY (exam_id) REFERENCES exams (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expected (
  exam_id TEXT NOT NULL,
  problem_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  digest TEXT NOT NULL,          -- secret SHA-256 inner digest of expected normalized output
  PRIMARY KEY (exam_id, problem_id, idx),
  FOREIGN KEY (exam_id, problem_id) REFERENCES problems (exam_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  problem_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  code TEXT NOT NULL,
  code_sha256 TEXT NOT NULL,
  claims TEXT NOT NULL,          -- JSON of submitted TestClaim[]
  verdicts TEXT NOT NULL,        -- JSON of TestVerdict[]
  groups TEXT NOT NULL,          -- JSON of GroupVerdict[]
  groups_passed INTEGER NOT NULL,
  groups_total INTEGER NOT NULL,
  score REAL NOT NULL,
  client TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions (exam_id, student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_problem ON submissions (exam_id, problem_id, created_at);
CREATE INDEX IF NOT EXISTS idx_submissions_created_at ON submissions (exam_id, created_at);
