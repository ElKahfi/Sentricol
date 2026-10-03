-- Additive migration. Legacy task history and EXP are retained unchanged.
CREATE TABLE IF NOT EXISTS email_course_configs (
  company_id INT PRIMARY KEY REFERENCES companies(company_id),
  configuration JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only explicitly reviewed v1 metadata participates in the email course.
-- Public evidence and private rubrics live inside the case snapshot.
CREATE TABLE IF NOT EXISTS email_course_cases (
  case_key TEXT PRIMARY KEY,
  company_id INT REFERENCES companies(company_id),
  requested_for_user_id INT REFERENCES users(user_id),
  source TEXT NOT NULL DEFAULT 'authored' CHECK (source IN ('authored', 'ai')),
  department_codes TEXT[] NOT NULL DEFAULT '{}',
  rank_codes TEXT[] NOT NULL DEFAULT '{}',
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft', 'pending_review', 'approved', 'retired', 'rejected')),
  scoring_version TEXT NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Older installations already have this table. Preserve existing cases while
-- extending its review workflow for AI-generated course cases.
ALTER TABLE email_course_cases ADD COLUMN IF NOT EXISTS requested_for_user_id INT REFERENCES users(user_id);
ALTER TABLE email_course_cases ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'authored';
ALTER TABLE email_course_cases DROP CONSTRAINT IF EXISTS email_course_cases_review_status_check;
ALTER TABLE email_course_cases ADD CONSTRAINT email_course_cases_review_status_check
  CHECK (review_status IN ('draft', 'pending_review', 'approved', 'retired', 'rejected'));
ALTER TABLE email_course_cases DROP CONSTRAINT IF EXISTS email_course_cases_source_check;
ALTER TABLE email_course_cases ADD CONSTRAINT email_course_cases_source_check
  CHECK (source IN ('authored', 'ai'));

CREATE TABLE IF NOT EXISTS email_course_enrollments (
  enrollment_id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE REFERENCES users(user_id),
  company_id INT NOT NULL REFERENCES companies(company_id),
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_course_submissions (
  submission_id BIGSERIAL PRIMARY KEY,
  enrollment_id BIGINT NOT NULL REFERENCES email_course_enrollments(enrollment_id),
  request_id UUID NOT NULL,
  assignment_id UUID NOT NULL,
  attempt_number INT NOT NULL CHECK (attempt_number BETWEEN 1 AND 3),
  answer JSONB NOT NULL,
  feedback JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, request_id),
  UNIQUE (enrollment_id, assignment_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS email_course_rewards (
  enrollment_id BIGINT NOT NULL REFERENCES email_course_enrollments(enrollment_id),
  assignment_id UUID NOT NULL,
  submission_id BIGINT NOT NULL UNIQUE REFERENCES email_course_submissions(submission_id),
  earned_units BIGINT NOT NULL CHECK (earned_units > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (enrollment_id, assignment_id)
);

CREATE INDEX IF NOT EXISTS email_course_catalog_audience ON email_course_cases(company_id, review_status);
CREATE INDEX IF NOT EXISTS email_course_ai_pool ON email_course_cases(requested_for_user_id, review_status, source);
