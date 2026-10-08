-- Exam settings become editable on the site, separate from uploaded problem content.
ALTER TABLE exam_catalog ADD COLUMN rules TEXT NOT NULL DEFAULT '';
ALTER TABLE exam_catalog ADD COLUMN policy TEXT NOT NULL DEFAULT 'best' CHECK(policy IN ('best','last'));
UPDATE exam_catalog SET rules=COALESCE(json_extract(manifest,'$.exam.rules'),''), policy=COALESCE(json_extract(manifest,'$.exam.policy'),'best') WHERE manifest IS NOT NULL;
-- Each attempt records the problem version that judged it; uploads may replace problems at any time.
ALTER TABLE attempts ADD COLUMN problem_version TEXT;
