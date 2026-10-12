-- A student's own submission history, without scanning the whole exam.
CREATE INDEX attempts_participant_preview ON attempts(exam_id,participant_id,preview,sequence);
-- Finding running attempts past their deadline.
CREATE INDEX attempts_running ON attempts(exam_id,status,expires_at);
