-- Existing submissions predate device tracking; do not invent identifiers for them.
ALTER TABLE submissions ADD COLUMN device_id TEXT;
CREATE INDEX idx_submissions_device ON submissions (exam_id, device_id, student_id, created_at);
