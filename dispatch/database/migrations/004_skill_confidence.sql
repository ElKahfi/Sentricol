-- Additive repair for databases created before confidence scoring was introduced.
-- Existing accounts, scores, attempts, and progress are preserved.
ALTER TABLE user_skill_profiles
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0
  CHECK (confidence_score BETWEEN 0 AND 100);
