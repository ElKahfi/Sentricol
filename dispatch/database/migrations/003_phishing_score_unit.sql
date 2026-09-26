-- Existing scores were stored on a 0–100 scale. Convert before enforcing 0–1.
BEGIN;
UPDATE cases SET phishing_score = phishing_score / 100
WHERE phishing_score IS NOT NULL;
ALTER TABLE cases ALTER COLUMN phishing_score TYPE NUMERIC(6,4);
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_phishing_score_check;
ALTER TABLE cases ADD CONSTRAINT cases_phishing_score_check
  CHECK (phishing_score IS NULL OR phishing_score BETWEEN 0 AND 1);
COMMIT;
