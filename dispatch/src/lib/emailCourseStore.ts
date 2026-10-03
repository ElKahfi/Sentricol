import 'server-only'
import { randomUUID } from 'node:crypto'
import { withTransaction } from '@/lib/db'
import {
  acknowledgeFeedback, advanceCourse, CourseError, courseView, createCourse,
  DEFAULT_CONFIG, SCORING_VERSION, submitAnswer, validateCase, validateConfig,
  type Answer, type CourseCase, type CourseConfig, type CourseState,
} from '@/lib/emailCourse'

export type CourseCommand = { action: 'resume' } |
  { action: 'submit'; requestId: string; answer: Answer } |
  { action: 'acknowledge'; assignmentId: string; attempt: number }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validateCommand(value: unknown): asserts value is CourseCommand {
  if (!value || typeof value !== 'object') throw new CourseError('Invalid course request')
  const c = value as CourseCommand
  if (c.action === 'resume') return
  if (c.action === 'submit' && uuid.test(c.requestId) && c.answer && uuid.test(c.answer.assignmentId) &&
    ['legitimate', 'phishing'].includes(c.answer.decision) && Array.isArray(c.answer.evidenceIds) &&
    c.answer.evidenceIds.length <= 20 && c.answer.evidenceIds.every(id => typeof id === 'string' && id.length < 100)) return
  if (c.action === 'acknowledge' && uuid.test(c.assignmentId) && Number.isInteger(c.attempt) && c.attempt >= 1 && c.attempt <= 3) return
  throw new CourseError('Invalid course request')
}

export async function executeCourseCommand(command: CourseCommand, userCode: string) {
  validateCommand(command)
  return withTransaction(async client => {
    const playerResult = await client.query<{
      user_id: number; company_id: number; department_code: string; rank_code: string | null;
      full_name: string; company_name: string; department_name: string; rank_name: string | null;
    }>(`SELECT u.user_id, d.company_id, d.department_code, r.rank_code,
               e.full_name, c.company_name, d.department_name, r.rank_name
          FROM users u JOIN employees e USING(employee_id)
          JOIN departments d USING(department_id) JOIN companies c USING(company_id)
          LEFT JOIN ranks r USING(rank_id)
         WHERE u.user_code = $1 FOR UPDATE OF u`, [userCode])
    const player = playerResult.rows[0]
    if (!player) throw new CourseError('The configured learner account was not found.', 404)

    let enrollment = (await client.query<{ enrollment_id: string; company_id: number; state: CourseState }>(
      'SELECT enrollment_id, company_id, state FROM email_course_enrollments WHERE user_id = $1 FOR UPDATE', [player.user_id],
    )).rows[0]
    if (enrollment && enrollment.company_id !== player.company_id) throw new CourseError('Your company assignment changed. Contact your training administrator.', 409)
    if (!enrollment) {
      const configResult = await client.query<{ configuration: CourseConfig }>('SELECT configuration FROM email_course_configs WHERE company_id = $1', [player.company_id])
      const config = configResult.rows[0]?.configuration ?? DEFAULT_CONFIG
      validateConfig(config)
      enrollment = (await client.query<{ enrollment_id: string; company_id: number; state: CourseState }>(
        'INSERT INTO email_course_enrollments(user_id, company_id, state) VALUES ($1, $2, $3) RETURNING enrollment_id, company_id, state',
        [player.user_id, player.company_id, createCourse(config)],
      )).rows[0]
    }
    const state = enrollment.state
    if (state.version !== SCORING_VERSION) throw new CourseError('This enrollment needs a scoring-version upgrade.', 409)

    if (command.action === 'submit') {
      // The same request survives a lost response. A changed payload cannot reuse it.
      const existing = (await client.query<{ answer: Answer }>(
        'SELECT answer FROM email_course_submissions WHERE enrollment_id = $1 AND request_id = $2',
        [enrollment.enrollment_id, command.requestId],
      )).rows[0]
      if (existing) {
        const a = existing.answer, b = command.answer
        if (a.assignmentId !== b.assignmentId || a.decision !== b.decision ||
          [...a.evidenceIds].sort().join('|') !== [...b.evidenceIds].sort().join('|')) throw new CourseError('This request ID belongs to a different answer.', 409)
        return { course: courseView(state), learner: player }
      }
      const feedback = submitAnswer(state, command.answer)
      const inserted = await client.query<{ submission_id: string }>(
        `INSERT INTO email_course_submissions(enrollment_id, request_id, assignment_id, attempt_number, answer, feedback)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING submission_id`,
        [enrollment.enrollment_id, command.requestId, command.answer.assignmentId, feedback.attempt, command.answer, feedback],
      )
      if (feedback.earnedUnits > 0) await client.query(
        'INSERT INTO email_course_rewards(enrollment_id, assignment_id, submission_id, earned_units) VALUES ($1,$2,$3,$4)',
        [enrollment.enrollment_id, command.answer.assignmentId, inserted.rows[0].submission_id, feedback.earnedUnits],
      )
    } else {
      if (command.action === 'acknowledge') acknowledgeFeedback(state, command.assignmentId, command.attempt)
      const catalogResult = await client.query<{ content: CourseCase }>(
        `SELECT content FROM email_course_cases
          WHERE review_status = 'approved' AND source = 'ai' AND requested_for_user_id = $5 AND scoring_version = $1
            AND (company_id IS NULL OR company_id = $2)
            AND (cardinality(department_codes) = 0 OR $3 = ANY(department_codes))
            AND (cardinality(rank_codes) = 0 OR $4 = ANY(rank_codes))
          ORDER BY case_key`,
        [SCORING_VERSION, player.company_id, player.department_code, player.rank_code, player.user_id],
      )
      const catalog: CourseCase[] = []
      for (const row of catalogResult.rows) {
        // Invalid/unreviewed cases do not become free points or partial phase plans.
        try { validateCase(row.content); catalog.push(row.content) }
        catch { console.warn('Invalid email-course case excluded:', row.content?.id) }
      }
      advanceCourse(state, catalog, randomUUID)
    }
    await client.query('UPDATE email_course_enrollments SET state = $2, updated_at = now() WHERE enrollment_id = $1', [enrollment.enrollment_id, state])
    return { course: courseView(state), learner: player }
  })
}
