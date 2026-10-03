import { NextRequest, NextResponse } from 'next/server'
import { localAdminPlayer } from '@/lib/player-auth'
import { getDatabase, withTransaction } from '@/lib/db'
import { courseView, createCourse, DEFAULT_CONFIG, skipCourseDifficulty, skipCourseEvent, validateConfig, type CourseConfig, type CourseState } from '@/lib/emailCourse'
import { randomUUID } from 'node:crypto'

const noStore = { 'Cache-Control': 'no-store' }
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: noStore })

async function authorized() {
  const player = await localAdminPlayer()
  return player?.userCode === 'usr_0001' ? player : null
}

export async function GET() {
  const player = await authorized()
  if (!player) return reply({ error: 'Admin controls are unavailable.' }, 403)
  try {
    const result = await getDatabase().query<{state: CourseState}>(
      'SELECT state FROM email_course_enrollments WHERE user_id=$1', [player.userId])
    const state = result.rows[0]?.state
    return reply({ active: Boolean(state), config: state?.config ?? {...DEFAULT_CONFIG, adminEventGates: true}, course: state ? courseView(state) : null })
  } catch { return reply({ error: 'Progression data is unavailable.' }, 503) }
}

export async function POST(request: NextRequest) {
  const player = await authorized()
  if (!player) return reply({ error: 'Admin controls are unavailable.' }, 403)
  if (request.headers.get('origin') !== request.nextUrl.origin) return reply({ error: 'Invalid request origin.' }, 403)
  let input: Record<string, unknown>
  try { input = await request.json() } catch { return reply({ error: 'Invalid request.' }, 400) }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return reply({ error: 'Invalid request.' }, 400)
  const action = input.action
  if (!['activate', 'skip-difficulty', 'skip-event', 'reset', 'configure'].includes(String(action))) return reply({ error: 'Unknown admin action.' }, 400)
  try {
    const result = await withTransaction(async client => {
      const owner = await client.query<{company_id: number}>(
        `SELECT d.company_id FROM users u JOIN employees e USING(employee_id)
         JOIN departments d USING(department_id) WHERE u.user_id=$1 FOR UPDATE OF u`, [player.userId])
      if (!owner.rows[0]) throw new Error('Demo learner is missing.')
      const companyId = owner.rows[0].company_id
      const row = (await client.query<{enrollment_id: string; state: CourseState}>(
        'SELECT enrollment_id,state FROM email_course_enrollments WHERE user_id=$1 FOR UPDATE', [player.userId])).rows[0]
      if (action === 'activate') {
        if (row) return { active: true, config: row.state.config, course: courseView(row.state) }
        const config = {...DEFAULT_CONFIG, adminEventGates: true}
        const state = createCourse(config)
        await client.query('INSERT INTO email_course_enrollments(user_id,company_id,state) VALUES($1,$2,$3)', [player.userId, companyId, state])
        return { active: true, config, course: courseView(state) }
      }
      if (!row) throw new Error('Activate the four-stage course first.')
      let state = row.state
      if (action === 'configure') {
        const config: CourseConfig = {
          version: DEFAULT_CONFIG.version,
          targetMinutes: input.targetMinutes as number,
          recoveryAllowance: input.recoveryAllowance as number,
          adminEventGates: true,
          phases: input.phases as CourseConfig['phases'],
        }
        validateConfig(config)
        // A new plan starts a new demo course, so old allocations and answer
        // ledgers cannot conflict with the edited objectives.
        await client.query('DELETE FROM email_course_rewards WHERE enrollment_id=$1', [row.enrollment_id])
        await client.query('DELETE FROM email_course_submissions WHERE enrollment_id=$1', [row.enrollment_id])
        state = createCourse(config)
      } else if (action === 'skip-difficulty') {
        // Local-only fast-forward credits the phase so the 1,000-EXP gate
        // stays coherent during testing.
        skipCourseDifficulty(state, randomUUID)
      } else if (action === 'skip-event') {
        skipCourseEvent(state)
      } else if (action === 'reset') {
        await client.query('DELETE FROM email_course_rewards WHERE enrollment_id=$1', [row.enrollment_id])
        await client.query('DELETE FROM email_course_submissions WHERE enrollment_id=$1', [row.enrollment_id])
        state = createCourse(state.config)
        await client.query(`UPDATE user_progress SET experience=0,graduation_percentage=0,unlocked_difficulty=1,
          current_stage='placement',average_score=NULL,updated_at=now() WHERE user_id=$1`, [player.userId])
        await client.query("UPDATE task_assignments SET status='skipped' WHERE user_id=$1 AND status IN ('assigned','started')", [player.userId])
      }
      await client.query('UPDATE email_course_enrollments SET state=$2,updated_at=now() WHERE enrollment_id=$1', [row.enrollment_id,state])
      return { active: true, config: state.config, course: courseView(state) }
    })
    return reply(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Admin action failed.'
    return reply({ error: message }, 400)
  }
}
