-- ============================================================
-- SENTRICOL OPTIMAL POSTGRESQL DATABASE STRUCTURE
-- Designed for:
-- 1. Cybersecurity training content
-- 2. Adaptive task selection
-- 3. Per-skill user profiling
-- 4. Gameplay and investigation logging
-- 5. Milestone tests and gamification
-- 6. AI-generated case tracking
-- ============================================================

-- ============================================================
-- SEGMENT A: ORGANIZATION AND IDENTITY
-- ============================================================

CREATE TABLE companies (
    company_id SERIAL PRIMARY KEY,
    company_code VARCHAR(50) NOT NULL UNIQUE,
    company_name VARCHAR(150) NOT NULL,
    industry VARCHAR(100),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE departments (
    department_id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    department_code VARCHAR(50) NOT NULL,
    department_name VARCHAR(100) NOT NULL,
    description TEXT,
    UNIQUE (company_id, department_code),
    UNIQUE (company_id, department_name)
);

CREATE TABLE ranks (
    rank_id SERIAL PRIMARY KEY,
    rank_code VARCHAR(50) NOT NULL UNIQUE,
    rank_name VARCHAR(100) NOT NULL UNIQUE,
    seniority_level INT NOT NULL DEFAULT 1 CHECK (seniority_level >= 1),
    description TEXT
);

CREATE TABLE employees (
    employee_id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) NOT NULL UNIQUE,
    personnel_number VARCHAR(80),
    department_id INT NOT NULL REFERENCES departments(department_id),
    rank_id INT REFERENCES ranks(rank_id),
    full_name VARCHAR(150) NOT NULL,
    position_title VARCHAR(100),
    work_email VARCHAR(150) UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    user_code VARCHAR(50) NOT NULL UNIQUE,
    employee_id INT UNIQUE REFERENCES employees(employee_id),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    auth_version INTEGER NOT NULL DEFAULT 0,
    role VARCHAR(30) NOT NULL DEFAULT 'player'
        CHECK (role IN ('player', 'trainer', 'admin')),
    skipped_placement BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

-- ============================================================
-- SEGMENT B: REFERENCE AND LEARNING RULES
-- ============================================================

CREATE TABLE incident_types (
    incident_type_id SERIAL PRIMARY KEY,
    incident_code VARCHAR(50) NOT NULL UNIQUE,
    incident_name VARCHAR(100) NOT NULL,
    description TEXT,
    default_verification_limit INT NOT NULL DEFAULT 2
        CHECK (default_verification_limit >= 0)
);

CREATE TABLE tags (
    tag_id SERIAL PRIMARY KEY,
    tag_code VARCHAR(50) NOT NULL UNIQUE,
    tag_name VARCHAR(100) NOT NULL,
    tag_category VARCHAR(20) NOT NULL
        CHECK (tag_category IN ('knowledge', 'behavior')),
    description TEXT,
    default_weight NUMERIC(6,3) NOT NULL DEFAULT 1.000
        CHECK (default_weight >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE difficulty_levels (
    difficulty INT PRIMARY KEY CHECK (difficulty BETWEEN 1 AND 10),
    required_experience INT NOT NULL DEFAULT 0 CHECK (required_experience >= 0),
    default_time_limit_seconds INT NOT NULL CHECK (default_time_limit_seconds > 0),
    ai_generation_allowed BOOLEAN NOT NULL DEFAULT false,
    description TEXT
);

CREATE TABLE company_policies (
    policy_id SERIAL PRIMARY KEY,
    company_id INT NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    department_id INT REFERENCES departments(department_id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL
        CHECK (category IN (
            'Data Handling',
            'Access Control',
            'Acceptable Use',
            'Incident Reporting'
        )),
    title VARCHAR(150) NOT NULL,
    content TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE handbook_chapters (
    chapter_id SERIAL PRIMARY KEY,
    company_id INT REFERENCES companies(company_id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    content TEXT NOT NULL,
    unlock_difficulty INT NOT NULL DEFAULT 1
        REFERENCES difficulty_levels(difficulty),
    display_order INT NOT NULL DEFAULT 1,
    is_active BOOLEAN NOT NULL DEFAULT true
);

-- ============================================================
-- SEGMENT C: TASK AND CASE CONTENT LIBRARY
-- ============================================================

CREATE TABLE tasks (
    task_id SERIAL PRIMARY KEY,
    task_code VARCHAR(100) NOT NULL UNIQUE,
    incident_type_id INT NOT NULL REFERENCES incident_types(incident_type_id),
    submitted_by_employee_id INT REFERENCES employees(employee_id),
    title VARCHAR(200) NOT NULL,
    priority VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'
        CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
    difficulty INT NOT NULL REFERENCES difficulty_levels(difficulty),
    base_experience INT NOT NULL DEFAULT 30 CHECK (base_experience >= 0),
    time_limit_seconds INT NOT NULL CHECK (time_limit_seconds > 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE task_target_departments (
    task_id INT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    department_id INT NOT NULL REFERENCES departments(department_id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, department_id)
);

CREATE TABLE task_target_ranks (
    task_id INT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    rank_id INT NOT NULL REFERENCES ranks(rank_id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, rank_id)
);

CREATE TABLE cases (
    case_id SERIAL PRIMARY KEY,
    task_id INT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    case_version INT NOT NULL DEFAULT 1 CHECK (case_version >= 1),
    content_source VARCHAR(20) NOT NULL DEFAULT 'template'
        CHECK (content_source IN ('template', 'manual', 'ai_generated')),

    -- Flexible content differs for email, password, and classification cases.
    raw_content JSONB NOT NULL,

    -- Stable complexity dimensions are normal columns for validation and filtering.
    technical_complexity INT NOT NULL DEFAULT 1 CHECK (technical_complexity BETWEEN 1 AND 10),
    social_complexity INT NOT NULL DEFAULT 1 CHECK (social_complexity BETWEEN 1 AND 10),
    evidence_complexity INT NOT NULL DEFAULT 1 CHECK (evidence_complexity BETWEEN 1 AND 10),
    time_pressure INT NOT NULL DEFAULT 1 CHECK (time_pressure BETWEEN 1 AND 10),

    phishing_score NUMERIC(6,4)
        CHECK (phishing_score IS NULL OR phishing_score BETWEEN 0 AND 1),

    correct_decision VARCHAR(100) NOT NULL,
    answer_details JSONB NOT NULL DEFAULT '{}',

    review_status VARCHAR(20) NOT NULL DEFAULT 'approved'
        CHECK (review_status IN ('draft', 'pending_review', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (task_id, case_version)
);

CREATE TABLE case_tags (
    case_id INT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    tag_id INT NOT NULL REFERENCES tags(tag_id),
    intensity NUMERIC(4,3) NOT NULL
        CHECK (intensity BETWEEN 0 AND 1),
    scoring_weight NUMERIC(6,3) NOT NULL DEFAULT 1.000
        CHECK (scoring_weight >= 0),
    is_primary BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (case_id, tag_id)
);

CREATE TABLE indicators (
    indicator_id SERIAL PRIMARY KEY,
    incident_type_id INT NOT NULL REFERENCES incident_types(incident_type_id),
    indicator_code VARCHAR(80) NOT NULL,
    indicator_name VARCHAR(150) NOT NULL,
    description TEXT,
    default_weight NUMERIC(6,3) NOT NULL DEFAULT 1.000
        CHECK (default_weight >= 0),
    UNIQUE (incident_type_id, indicator_code)
);

CREATE TABLE case_indicators (
    case_id INT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    indicator_id INT NOT NULL REFERENCES indicators(indicator_id),
    is_present BOOLEAN NOT NULL DEFAULT true,
    weight_override NUMERIC(6,3)
        CHECK (weight_override IS NULL OR weight_override >= 0),
    evidence JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (case_id, indicator_id)
);

CREATE TABLE case_contact_options (
    contact_option_id SERIAL PRIMARY KEY,
    case_id INT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    contact_type VARCHAR(30) NOT NULL
        CHECK (contact_type IN (
            'IT Helpdesk',
            'Supervisor',
            'Human Resources',
            'Finance',
            'Sender'
        )),
    display_name VARCHAR(150),
    is_available BOOLEAN NOT NULL DEFAULT true,
    is_correct_choice BOOLEAN NOT NULL DEFAULT false,
    response_text TEXT,
    extra_data JSONB NOT NULL DEFAULT '{}'
);

-- ============================================================
-- SEGMENT D: PLAYER PROFILE AND ADAPTIVE LEARNING STATE
-- ============================================================

CREATE TABLE user_progress (
    user_id INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    experience INT NOT NULL DEFAULT 0 CHECK (experience >= 0),
    unlocked_difficulty INT NOT NULL DEFAULT 1
        REFERENCES difficulty_levels(difficulty),
    graduation_percentage NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (graduation_percentage BETWEEN 0 AND 100),
    current_stage VARCHAR(20) NOT NULL DEFAULT 'placement'
        CHECK (current_stage IN (
            'placement',
            'normal',
            'mid_test',
            'final_test',
            'graduated'
        )),
    average_score NUMERIC(5,2)
        CHECK (average_score IS NULL OR average_score BETWEEN 0 AND 100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_skill_profiles (
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    tag_id INT NOT NULL REFERENCES tags(tag_id),

    -- Current adaptive skill/vulnerability score.
    ability_score NUMERIC(5,2) NOT NULL DEFAULT 10
        CHECK (ability_score BETWEEN 0 AND 100),
    confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0
        CHECK (confidence_score BETWEEN 0 AND 100),

    -- Raw totals. Accuracy and averages should be calculated from these.
    attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    correct INT NOT NULL DEFAULT 0 CHECK (correct >= 0),
    wrong INT NOT NULL DEFAULT 0 CHECK (wrong >= 0),
    perfect_attempts INT NOT NULL DEFAULT 0 CHECK (perfect_attempts >= 0),

    total_decision_seconds NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (total_decision_seconds >= 0),
    total_investigation_seconds NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (total_investigation_seconds >= 0),
    investigated_attempts INT NOT NULL DEFAULT 0 CHECK (investigated_attempts >= 0),
    verified_attempts INT NOT NULL DEFAULT 0 CHECK (verified_attempts >= 0),

    current_streak INT NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
    best_streak INT NOT NULL DEFAULT 0 CHECK (best_streak >= 0),

    last_practiced_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, tag_id),

    CHECK (correct + wrong <= attempts),
    CHECK (perfect_attempts <= correct),
    CHECK (investigated_attempts <= attempts),
    CHECK (verified_attempts <= attempts)
);

CREATE TABLE user_statistics (
    user_id INT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    tasks_completed INT NOT NULL DEFAULT 0 CHECK (tasks_completed >= 0),
    correct INT NOT NULL DEFAULT 0 CHECK (correct >= 0),
    wrong INT NOT NULL DEFAULT 0 CHECK (wrong >= 0),

    emails_completed INT NOT NULL DEFAULT 0 CHECK (emails_completed >= 0),
    password_completed INT NOT NULL DEFAULT 0 CHECK (password_completed >= 0),
    classification_completed INT NOT NULL DEFAULT 0 CHECK (classification_completed >= 0),

    total_decision_seconds NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_investigation_seconds NUMERIC(14,2) NOT NULL DEFAULT 0,
    investigated_tasks INT NOT NULL DEFAULT 0,
    verified_tasks INT NOT NULL DEFAULT 0,

    false_positives INT NOT NULL DEFAULT 0,
    false_negatives INT NOT NULL DEFAULT 0,
    perfect_tasks INT NOT NULL DEFAULT 0,

    current_streak INT NOT NULL DEFAULT 0,
    best_streak INT NOT NULL DEFAULT 0,
    last_played_at TIMESTAMPTZ,

    CHECK (correct + wrong <= tasks_completed),
    CHECK (investigated_tasks <= tasks_completed),
    CHECK (verified_tasks <= tasks_completed)
);

-- ============================================================
-- SEGMENT E: SESSIONS, ASSIGNMENTS, TESTS, AND ATTEMPTS
-- ============================================================

CREATE TABLE game_sessions (
    session_id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    session_time_limit_seconds INT NOT NULL CHECK (session_time_limit_seconds > 0),
    tasks_completed_in_session INT NOT NULL DEFAULT 0 CHECK (tasks_completed_in_session >= 0),
    end_reason VARCHAR(30)
        CHECK (end_reason IN (
            'time_limit_reached',
            'manual_quit',
            'completed_plan',
            'system_ended'
        )),
    CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE milestone_tests (
    test_id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    test_type VARCHAR(20) NOT NULL
        CHECK (test_type IN ('placement', 'mid', 'final')),
    status VARCHAR(20) NOT NULL DEFAULT 'created'
        CHECK (status IN ('created', 'in_progress', 'completed', 'expired')),
    target_case_count INT NOT NULL CHECK (target_case_count > 0),
    time_limit_seconds INT CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0),
    score NUMERIC(5,2) CHECK (score IS NULL OR score BETWEEN 0 AND 100),
    recommended_difficulty INT REFERENCES difficulty_levels(difficulty),
    passed BOOLEAN,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE milestone_test_cases (
    test_id BIGINT NOT NULL REFERENCES milestone_tests(test_id) ON DELETE CASCADE,
    case_id INT NOT NULL REFERENCES cases(case_id),
    sequence_number INT NOT NULL CHECK (sequence_number > 0),
    PRIMARY KEY (test_id, case_id),
    UNIQUE (test_id, sequence_number)
);

CREATE TABLE task_assignments (
    assignment_id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    case_id INT NOT NULL REFERENCES cases(case_id),
    session_id BIGINT REFERENCES game_sessions(session_id) ON DELETE SET NULL,
    milestone_test_id BIGINT REFERENCES milestone_tests(test_id) ON DELETE SET NULL,

    assignment_source VARCHAR(20) NOT NULL DEFAULT 'adaptive'
        CHECK (assignment_source IN ('adaptive', 'manual', 'milestone', 'tutorial')),
    status VARCHAR(20) NOT NULL DEFAULT 'assigned'
        CHECK (status IN ('assigned', 'started', 'completed', 'expired', 'skipped')),

    match_score NUMERIC(6,3),
    match_reason JSONB NOT NULL DEFAULT '{}',

    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE TABLE task_attempts (
    attempt_id BIGSERIAL PRIMARY KEY,
    assignment_id BIGINT NOT NULL REFERENCES task_assignments(assignment_id) ON DELETE CASCADE,
    attempt_number INT NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),

    decision VARCHAR(100),
    score NUMERIC(5,2) CHECK (score IS NULL OR score BETWEEN 0 AND 100),
    experience_gained INT NOT NULL DEFAULT 0 CHECK (experience_gained >= 0),

    time_limit_seconds INT NOT NULL CHECK (time_limit_seconds > 0),
    time_taken_seconds INT CHECK (time_taken_seconds IS NULL OR time_taken_seconds >= 0),
    investigation_time_seconds INT
        CHECK (investigation_time_seconds IS NULL OR investigation_time_seconds >= 0),

    expired BOOLEAN NOT NULL DEFAULT false,
    player_notes VARCHAR(500),

    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,

    UNIQUE (assignment_id, attempt_number),
    CHECK (completed_at IS NULL OR completed_at >= started_at)
);

CREATE TABLE attempt_actions (
    action_id BIGSERIAL PRIMARY KEY,
    attempt_id BIGINT NOT NULL REFERENCES task_attempts(attempt_id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    action_target VARCHAR(150),
    action_details JSONB NOT NULL DEFAULT '{}',
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attempt_tag_results (
    attempt_id BIGINT NOT NULL REFERENCES task_attempts(attempt_id) ON DELETE CASCADE,
    tag_id INT NOT NULL REFERENCES tags(tag_id),
    was_tested BOOLEAN NOT NULL DEFAULT true,
    was_successful BOOLEAN,
    score_earned NUMERIC(6,2),
    ability_delta NUMERIC(6,2) NOT NULL DEFAULT 0,
    result_evidence JSONB NOT NULL DEFAULT '{}',
    PRIMARY KEY (attempt_id, tag_id)
);

CREATE TABLE task_results (
    result_id BIGSERIAL PRIMARY KEY,
    attempt_id BIGINT NOT NULL UNIQUE
        REFERENCES task_attempts(attempt_id) ON DELETE CASCADE,
    is_correct BOOLEAN NOT NULL,
    feedback_text TEXT,
    feedback_details JSONB NOT NULL DEFAULT '{}',
    ability_change_summary JSONB NOT NULL DEFAULT '{}',
    generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- SEGMENT F: GAMIFICATION
-- ============================================================

CREATE TABLE achievements (
    achievement_id SERIAL PRIMARY KEY,
    achievement_code VARCHAR(80) NOT NULL UNIQUE,
    title VARCHAR(150) NOT NULL,
    description TEXT,
    reward_experience INT NOT NULL DEFAULT 0 CHECK (reward_experience >= 0),
    criteria JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE user_achievements (
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    achievement_id INT NOT NULL REFERENCES achievements(achievement_id),
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, achievement_id)
);

-- ============================================================
-- SEGMENT G: AI GENERATION AND AUDIT
-- ============================================================

CREATE TABLE ai_generation_jobs (
    generation_job_id BIGSERIAL PRIMARY KEY,
    requested_by_user_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    target_user_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    incident_type_id INT REFERENCES incident_types(incident_type_id),
    requested_difficulty INT REFERENCES difficulty_levels(difficulty),

    prompt_version VARCHAR(50),
    model_name VARCHAR(100),
    input_context JSONB NOT NULL DEFAULT '{}',

    status VARCHAR(20) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'completed', 'failed', 'rejected')),

    output_case_id INT REFERENCES cases(case_id) ON DELETE SET NULL,
    error_message TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_departments_company
    ON departments(company_id);

CREATE INDEX idx_employees_department_rank
    ON employees(department_id, rank_id);

CREATE INDEX idx_tasks_type_difficulty_active
    ON tasks(incident_type_id, difficulty, is_active);

CREATE INDEX idx_task_target_departments_department
    ON task_target_departments(department_id, task_id);

CREATE INDEX idx_task_target_ranks_rank
    ON task_target_ranks(rank_id, task_id);

CREATE INDEX idx_cases_task_review
    ON cases(task_id, review_status);

CREATE INDEX idx_cases_raw_content_gin
    ON cases USING GIN(raw_content);

CREATE INDEX idx_case_tags_tag_intensity
    ON case_tags(tag_id, intensity);

CREATE INDEX idx_user_skill_profiles_user_score
    ON user_skill_profiles(user_id, ability_score);

CREATE INDEX idx_assignments_user_status
    ON task_assignments(user_id, status, assigned_at);

CREATE INDEX idx_assignments_session
    ON task_assignments(session_id);

CREATE INDEX idx_attempts_assignment
    ON task_attempts(assignment_id);

CREATE INDEX idx_attempt_actions_attempt_time
    ON attempt_actions(attempt_id, occurred_at);

CREATE INDEX idx_attempt_tag_results_tag
    ON attempt_tag_results(tag_id, was_successful);

CREATE INDEX idx_sessions_user_time
    ON game_sessions(user_id, started_at);

CREATE INDEX idx_ai_generation_status
    ON ai_generation_jobs(status, created_at);



SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename;
