-- The submission-analysis tab reads one problem version at a time.
CREATE INDEX attempts_problem ON attempts(exam_id,preview,problem_id,problem_version,sequence);
