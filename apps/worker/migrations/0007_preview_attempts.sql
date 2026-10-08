-- Teacher preview submissions are judged like real ones but never count as student work.
ALTER TABLE attempts ADD COLUMN preview INTEGER NOT NULL DEFAULT 0 CHECK(preview IN (0,1));
CREATE INDEX attempts_preview ON attempts(exam_id,preview,sequence);
