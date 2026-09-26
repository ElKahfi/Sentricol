import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import pg from 'pg'

const { Pool } = pg
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function readJson(relativePath) {
  const source = await readFile(path.join(root, relativePath), 'utf8')
  return JSON.parse(source.replace(/[\u2028\u2029]/g, '\n'))
}

const label = (code) =>
  code.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase())
const countFromRate = (rate, attempts) =>
  Math.min(attempts, Math.max(0, Math.round((rate ?? 0) * attempts)))

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required. Configure it before running npm run db:seed.')
  process.exit(1)
}

const user = await readJson('database/demo-user.json')
const task = await readJson('database/demo-task.json')
const caseContent = await readJson('database/demo-case.json')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
})
const client = await pool.connect()

try {
  await client.query('BEGIN')

  for (let difficulty = 1; difficulty <= 10; difficulty += 1) {
    await client.query(
      `INSERT INTO difficulty_levels
         (difficulty, required_experience, default_time_limit_seconds, ai_generation_allowed, description)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (difficulty) DO UPDATE SET
         required_experience = EXCLUDED.required_experience,
         default_time_limit_seconds = EXCLUDED.default_time_limit_seconds,
         ai_generation_allowed = EXCLUDED.ai_generation_allowed`,
      [difficulty, (difficulty - 1) * 250, Math.max(60, 360 - difficulty * 20),
        difficulty >= 4, `Difficulty ${difficulty}`],
    )
  }

  const company = await client.query(
    `INSERT INTO companies (company_code, company_name)
     VALUES ($1, 'Sentricol Demo Company')
     ON CONFLICT (company_code) DO UPDATE SET company_name = EXCLUDED.company_name
     RETURNING company_id`,
    [user.companyId],
  )
  const companyId = company.rows[0].company_id

  const departmentIds = new Map()
  for (const name of new Set([user.department, ...task.targetDepartment])) {
    const result = await client.query(
      `INSERT INTO departments (company_id, department_code, department_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (company_id, department_code) DO UPDATE SET department_name = EXCLUDED.department_name
       RETURNING department_id`,
      [companyId, name.toUpperCase().replace(/\s+/g, '_'), name],
    )
    departmentIds.set(name, result.rows[0].department_id)
  }

  const rankName = task.targetRank[0] ?? 'Staff'
  const rank = await client.query(
    `INSERT INTO ranks (rank_code, rank_name, seniority_level)
     VALUES ($1, $2, 1)
     ON CONFLICT (rank_code) DO UPDATE SET rank_name = EXCLUDED.rank_name
     RETURNING rank_id`,
    [rankName.toUpperCase().replace(/\s+/g, '_'), rankName],
  )
  const rankId = rank.rows[0].rank_id

  const employee = await client.query(
    `INSERT INTO employees
       (employee_code, department_id, rank_id, full_name, position_title, work_email, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (employee_code) DO UPDATE SET
       department_id = EXCLUDED.department_id,
       rank_id = EXCLUDED.rank_id,
       full_name = EXCLUDED.full_name,
       position_title = EXCLUDED.position_title,
       work_email = EXCLUDED.work_email
     RETURNING employee_id`,
    [user.employeeId, departmentIds.get(user.department), rankId, user.name,
      user.position, user.email, user.joinedAt],
  )

  const player = await client.query(
    `INSERT INTO users (user_code, employee_id, username, email, password_hash, created_at)
     VALUES ($1, $2, $3, $4, '$demo-account-no-login$', $5)
     ON CONFLICT (user_code) DO UPDATE SET
       employee_id = EXCLUDED.employee_id,
       username = EXCLUDED.username,
       email = EXCLUDED.email
     RETURNING user_id`,
    [user.userId, employee.rows[0].employee_id, user.email.split('@')[0], user.email, user.joinedAt],
  )
  const userId = player.rows[0].user_id
  const graduation = Math.min(100,
    (user.progression.experience / user.progression.nextLevelExp) * 100)

  await client.query(
    `INSERT INTO user_progress
       (user_id, experience, unlocked_difficulty, graduation_percentage, current_stage, average_score)
     VALUES ($1, $2, $3, $4, 'normal', $5)
     ON CONFLICT (user_id) DO UPDATE SET
       experience = EXCLUDED.experience,
       unlocked_difficulty = EXCLUDED.unlocked_difficulty,
       graduation_percentage = EXCLUDED.graduation_percentage,
       current_stage = EXCLUDED.current_stage,
       average_score = EXCLUDED.average_score,
       updated_at = now()`,
    [userId, user.progression.experience, Math.min(10, user.progression.level), graduation,
      user.statistics.tasksCompleted
        ? (user.statistics.correct / user.statistics.tasksCompleted) * 100
        : 0],
  )

  const behaviorCodes = new Set([
    ...Object.keys(user.behavior),
    ...Object.keys(task.behaviorTags),
  ])
  const allTagCodes = new Set([
    ...Object.keys(user.knowledge),
    ...Object.keys(user.behavior),
    ...Object.keys(user.skillStatistics),
    ...Object.keys(task.knowledgeTags),
    ...Object.keys(task.behaviorTags),
  ])
  const tagIds = new Map()
  for (const code of allTagCodes) {
    const tag = await client.query(
      `INSERT INTO tags (tag_code, tag_name, tag_category)
       VALUES ($1, $2, $3)
       ON CONFLICT (tag_code) DO UPDATE SET
         tag_name = EXCLUDED.tag_name,
         tag_category = EXCLUDED.tag_category,
         is_active = true
       RETURNING tag_id`,
      [code, label(code), behaviorCodes.has(code) ? 'behavior' : 'knowledge'],
    )
    tagIds.set(code, tag.rows[0].tag_id)
  }

  for (const [code, stats] of Object.entries(user.skillStatistics)) {
    const attempts = stats.attempts ?? 0
    const ability = user.knowledge[code] ?? user.behavior[code] ?? stats.accuracy ?? 10
    await client.query(
      `INSERT INTO user_skill_profiles
         (user_id, tag_id, ability_score, confidence_score, attempts, correct, wrong,
          perfect_attempts, total_decision_seconds, total_investigation_seconds,
          investigated_attempts, verified_attempts, current_streak, best_streak,
          last_practiced_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (user_id, tag_id) DO UPDATE SET
         ability_score = EXCLUDED.ability_score,
         confidence_score = EXCLUDED.confidence_score,
         attempts = EXCLUDED.attempts,
         correct = EXCLUDED.correct,
         wrong = EXCLUDED.wrong,
         perfect_attempts = EXCLUDED.perfect_attempts,
         total_decision_seconds = EXCLUDED.total_decision_seconds,
         total_investigation_seconds = EXCLUDED.total_investigation_seconds,
         investigated_attempts = EXCLUDED.investigated_attempts,
         verified_attempts = EXCLUDED.verified_attempts,
         current_streak = EXCLUDED.current_streak,
         best_streak = EXCLUDED.best_streak,
         last_practiced_at = EXCLUDED.last_practiced_at,
         updated_at = EXCLUDED.updated_at`,
      [userId, tagIds.get(code), ability, Math.min(100, attempts * 5), attempts,
        stats.correct, stats.wrong, stats.perfectAttempts,
        (stats.averageDecisionTime ?? 0) * attempts,
        (stats.averageInvestigationTime ?? 0) * attempts,
        countFromRate(stats.investigationRate, attempts),
        countFromRate(stats.verificationRate, attempts), stats.currentStreak,
        stats.bestStreak, stats.lastPracticed, stats.lastUpdated],
    )
  }

  const statistics = user.statistics
  await client.query(
    `INSERT INTO user_statistics
       (user_id, tasks_completed, correct, wrong, emails_completed, password_completed,
        classification_completed, total_decision_seconds, total_investigation_seconds,
        investigated_tasks, verified_tasks, false_positives, false_negatives,
        perfect_tasks, current_streak, best_streak, last_played_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16)
     ON CONFLICT (user_id) DO UPDATE SET
       tasks_completed = EXCLUDED.tasks_completed,
       correct = EXCLUDED.correct,
       wrong = EXCLUDED.wrong,
       emails_completed = EXCLUDED.emails_completed,
       password_completed = EXCLUDED.password_completed,
       classification_completed = EXCLUDED.classification_completed,
       total_decision_seconds = EXCLUDED.total_decision_seconds,
       total_investigation_seconds = EXCLUDED.total_investigation_seconds,
       investigated_tasks = EXCLUDED.investigated_tasks,
       verified_tasks = EXCLUDED.verified_tasks,
       false_positives = EXCLUDED.false_positives,
       false_negatives = EXCLUDED.false_negatives,
       perfect_tasks = EXCLUDED.perfect_tasks,
       current_streak = EXCLUDED.current_streak,
       best_streak = EXCLUDED.best_streak,
       last_played_at = EXCLUDED.last_played_at`,
    [userId, statistics.tasksCompleted, statistics.correct, statistics.wrong,
      statistics.emailsCompleted, statistics.passwordCompleted,
      statistics.classificationCompleted,
      statistics.avgDecisionTime * statistics.tasksCompleted,
      statistics.avgInvestigationTime * statistics.tasksCompleted,
      countFromRate(statistics.investigationRate, statistics.tasksCompleted),
      countFromRate(statistics.verificationRate, statistics.tasksCompleted),
      Math.round(statistics.falsePositiveRate * statistics.wrong),
      Math.round(statistics.falseNegativeRate * statistics.wrong),
      statistics.perfectTasks, statistics.streak, statistics.lastPlayed],
  )

  const incident = await client.query(
    `INSERT INTO incident_types (incident_code, incident_name, description)
     VALUES ($1, $2, 'Cybersecurity training case')
     ON CONFLICT (incident_code) DO UPDATE SET incident_name = EXCLUDED.incident_name
     RETURNING incident_type_id`,
    [task.type, label(task.type)],
  )
  const taskRow = await client.query(
    `INSERT INTO tasks
       (task_code, incident_type_id, title, priority, difficulty, base_experience, time_limit_seconds)
     VALUES ($1, $2, 'Investigate HR payroll verification email', 'HIGH', $3, 30, 180)
     ON CONFLICT (task_code) DO UPDATE SET
       incident_type_id = EXCLUDED.incident_type_id,
       title = EXCLUDED.title,
       difficulty = EXCLUDED.difficulty,
       updated_at = now()
     RETURNING task_id`,
    [task.id, incident.rows[0].incident_type_id, task.difficulty],
  )
  const taskId = taskRow.rows[0].task_id

  await client.query('DELETE FROM task_target_departments WHERE task_id = $1', [taskId])
  for (const name of task.targetDepartment) {
    await client.query(
      `INSERT INTO task_target_departments (task_id, department_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [taskId, departmentIds.get(name)],
    )
  }
  await client.query('DELETE FROM task_target_ranks WHERE task_id = $1', [taskId])
  for (const name of task.targetRank) {
    const targetRank = await client.query('SELECT rank_id FROM ranks WHERE rank_name = $1', [name])
    if (targetRank.rows[0]) {
      await client.query(
        'INSERT INTO task_target_ranks (task_id, rank_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [taskId, targetRank.rows[0].rank_id],
      )
    }
  }

  const caseRow = await client.query(
    `INSERT INTO cases
       (task_id, case_version, content_source, raw_content, technical_complexity,
        social_complexity, evidence_complexity, time_pressure, phishing_score,
        correct_decision, answer_details, review_status)
     VALUES ($1,1,'manual',$2,$3,$4,$5,$6,$7,'phishing',$8,'approved')
     ON CONFLICT (task_id, case_version) DO UPDATE SET
       raw_content = EXCLUDED.raw_content,
       technical_complexity = EXCLUDED.technical_complexity,
       social_complexity = EXCLUDED.social_complexity,
       evidence_complexity = EXCLUDED.evidence_complexity,
       time_pressure = EXCLUDED.time_pressure,
       phishing_score = EXCLUDED.phishing_score,
       correct_decision = EXCLUDED.correct_decision,
       answer_details = EXCLUDED.answer_details,
       review_status = 'approved'
     RETURNING case_id`,
    [taskId, caseContent, task.complexity.technical, task.complexity.social,
      task.complexity.evidence, task.complexity.timePressure, task.phisingScore,
      { sourceTaskJson: task.id, normalizedField: 'phisingScore -> phishing_score' }],
  )
  const caseId = caseRow.rows[0].case_id

  await client.query('DELETE FROM case_tags WHERE case_id = $1', [caseId])
  for (const [code, weight] of Object.entries({ ...task.knowledgeTags, ...task.behaviorTags })) {
    await client.query(
      `INSERT INTO case_tags (case_id, tag_id, intensity, scoring_weight, is_primary)
       VALUES ($1, $2, $3, 1, false)`,
      [caseId, tagIds.get(code), weight],
    )
  }

  await client.query('COMMIT')
  console.log(`Seeded ${user.userId} and ${task.id}.`)
  console.log(`Eligibility note: ${user.name} is in ${user.department}; the task targets ${task.targetDepartment.join(', ')}.`)
} catch (error) {
  await client.query('ROLLBACK')
  console.error(error)
  process.exitCode = 1
} finally {
  client.release()
  await pool.end()
}
