CREATE TABLE browser_telemetry (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  exam_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  student_id TEXT,
  operation_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  user_agent TEXT,
  event TEXT NOT NULL
);
CREATE INDEX idx_telemetry_exam_sequence ON browser_telemetry (exam_id, sequence);
CREATE INDEX idx_telemetry_operation ON browser_telemetry (exam_id, operation_id);
CREATE INDEX idx_telemetry_device ON browser_telemetry (exam_id, device_id, sequence);
