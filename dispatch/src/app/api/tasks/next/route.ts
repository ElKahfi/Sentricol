import { currentPlayer } from '@/lib/player-auth'
import { NextResponse } from 'next/server'
import { isDatabaseConfigured, withTransaction } from '@/lib/db'
import { TRAINING_CONFIG, regularTaskType } from '@/lib/trainingConfig'
import { generatePlayableEmail } from '@/lib/harnessTasks'

interface NextTaskRequest {
  userCode?: string
  taskType?: string
  knownAssignmentIds?: string[]
}

interface CandidateRow {
  user_id: number
  case_id: number
  task_code: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  time_limit_seconds: number
  incident_code: 'email' | 'password' | 'data-classification'
  raw_content: Record<string, unknown>
  match_score: string
  match_reason: Record<string, unknown>
}

interface ActiveTaskRow extends CandidateRow {
  assignment_id: string
  attempt_id: string
}

function toDispatchItem(
  task: CandidateRow,
  assignmentId: string,
  attemptId: string,
) {
  return {
    id: String(task.raw_content.id ?? task.task_code),
    type: task.incident_code,
    timestamp: Date.now(),
    payload: task.raw_content,
    assignmentId,
    attemptId,
    caseId: task.case_id,
    taskCode: task.task_code,
    priority: task.priority,
    matchScore: Number(task.match_score),
    matchReason: task.match_reason,
    source: 'database' as const,
  }
}

export async function POST(request: Request) {
  try {
  const player = await currentPlayer()
  if (!player) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 })
  }

  const body = (await request.json()) as NextTaskRequest
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  body.userCode = player.userCode
  if (!body.userCode) {
    return NextResponse.json({ error: 'userCode is required' }, { status: 400 })
  }

  if (TRAINING_CONFIG.phaseProgressionEnabled && body.taskType === 'email') {
    return NextResponse.json({ error: 'Email investigation now uses /api/email-course.' }, { status: 409 })
  }


  if ((body.taskType && !['email', 'password', 'data-classification'].includes(body.taskType)) ||
      (body.knownAssignmentIds !== undefined && (!Array.isArray(body.knownAssignmentIds) || body.knownAssignmentIds.some(id => typeof id !== 'string')))) {
    return NextResponse.json({ error: 'Invalid task generation options' }, { status: 400 })
  }

    const taskType = body.taskType ?? (TRAINING_CONFIG.phaseProgressionEnabled ? null : regularTaskType(Math.floor(Math.random() * 10)))
    if (taskType === 'email' && !TRAINING_CONFIG.phaseProgressionEnabled) {
      try {
        const generated = await generatePlayableEmail(player)
        if (generated) return NextResponse.json(generated)
      } catch (error) {
        console.error('AI email generation failed; using approved catalog:', error instanceof Error ? error.message : error)
      }
    }
    const result = await withTransaction(async (client) => {
      // Serialize assignment creation for this user, including duplicate mount requests.
      await client.query('SELECT user_id FROM users WHERE user_code = $1 FOR UPDATE', [body.userCode])
      // A browser refresh clears the in-memory queue, but the database assignment
      // remains active. Resume it before trying to create another assignment.
      const activeResult = await client.query<ActiveTaskRow>(
        `SELECT ta.user_id,
                ta.assignment_id,
                a.attempt_id,
                c.case_id,
                t.task_code,
                t.priority,
                t.time_limit_seconds,
                it.incident_code,
                c.raw_content,
                COALESCE(ta.match_score, 50)::text AS match_score,
                ta.match_reason
           FROM task_assignments ta
           JOIN users u ON u.user_id = ta.user_id
           JOIN task_attempts a
             ON a.assignment_id = ta.assignment_id
            AND a.completed_at IS NULL
           JOIN cases c ON c.case_id = ta.case_id
           JOIN tasks t ON t.task_id = c.task_id
           JOIN incident_types it ON it.incident_type_id = t.incident_type_id
          WHERE u.user_code = $1
            AND ($4::boolean = false OR it.incident_code <> 'email')
            AND ta.status IN ('assigned', 'started')
            AND NOT (ta.assignment_id::text = ANY($2::text[]))
            AND ($3::text IS NULL OR it.incident_code = $3)
          ORDER BY ta.assignment_id DESC, a.attempt_number DESC
          LIMIT 1`,
        [body.userCode, body.knownAssignmentIds ?? [], taskType, TRAINING_CONFIG.phaseProgressionEnabled],
      )

      const activeTask = activeResult.rows[0]
      if (activeTask) {
        return toDispatchItem(activeTask, activeTask.assignment_id, activeTask.attempt_id)
      }

      const candidateResult = await client.query<CandidateRow>(
        `WITH player AS (
           SELECT u.user_id, e.department_id, e.rank_id, up.unlocked_difficulty
             FROM users u
             JOIN employees e ON e.employee_id = u.employee_id
             JOIN user_progress up ON up.user_id = u.user_id
            WHERE u.user_code = $1 AND e.is_active = true
         ), candidates AS (
           SELECT p.user_id,
                  c.case_id,
                  t.task_code,
                  t.priority,
                  t.time_limit_seconds,
                  it.incident_code,
                  c.raw_content,
                  COALESCE(
                    SUM((100 - COALESCE(usp.ability_score, 50)) * ct.intensity * ct.scoring_weight)
                      / NULLIF(SUM(ct.intensity * ct.scoring_weight), 0),
                    50
                  ) AS match_score,
                  jsonb_build_object(
                    'departmentMatched', true,
                    'rankMatched', true,
                    'difficulty', t.difficulty,
                    'selection', 'lowest ability weighted by case tags'
                  ) AS match_reason
             FROM player p
             JOIN tasks t ON t.is_active = true
                         AND ($3::boolean = false OR t.difficulty <= p.unlocked_difficulty)
             JOIN incident_types it ON it.incident_type_id = t.incident_type_id
             JOIN cases c ON c.task_id = t.task_id AND c.review_status = 'approved'
             LEFT JOIN case_tags ct ON ct.case_id = c.case_id
             LEFT JOIN user_skill_profiles usp
                    ON usp.user_id = p.user_id AND usp.tag_id = ct.tag_id
            WHERE ($2::text IS NULL OR it.incident_code = $2)
              AND ($3::boolean = false OR it.incident_code <> 'email')
              AND (c.content_source <> 'ai_generated' OR c.answer_details->>'requestedForUser' = p.user_id::text)
              AND (
                    NOT EXISTS (SELECT 1 FROM task_target_departments td WHERE td.task_id = t.task_id)
                    OR EXISTS (
                      SELECT 1 FROM task_target_departments td
                       WHERE td.task_id = t.task_id AND td.department_id = p.department_id
                    )
                  )
              AND (
                    NOT EXISTS (SELECT 1 FROM task_target_ranks tr WHERE tr.task_id = t.task_id)
                    OR EXISTS (
                      SELECT 1 FROM task_target_ranks tr
                       WHERE tr.task_id = t.task_id AND tr.rank_id = p.rank_id
                    )
                  )
              AND NOT EXISTS (
                    SELECT 1
                      FROM task_assignments previous
                     WHERE previous.user_id = p.user_id
                       AND previous.case_id = c.case_id
                       AND previous.status IN ('assigned', 'started')
              )
              AND (c.content_source <> 'ai_generated' OR NOT EXISTS (
                    SELECT 1 FROM task_assignments used
                     WHERE used.user_id = p.user_id AND used.case_id = c.case_id
                  ))
            GROUP BY p.user_id, c.case_id, t.task_code, t.priority,
                     t.time_limit_seconds, it.incident_code, c.raw_content, t.difficulty
         )
         SELECT *
           FROM candidates
          ORDER BY match_score DESC, random()
          LIMIT 1`,
        [body.userCode, taskType, TRAINING_CONFIG.phaseProgressionEnabled],
      )

      const candidate = candidateResult.rows[0]
      if (!candidate) return null

      const assignmentResult = await client.query<{ assignment_id: string }>(
        `INSERT INTO task_assignments
           (user_id, case_id, assignment_source, status, match_score, match_reason, started_at)
         VALUES ($1, $2, 'adaptive', 'started', $3, $4, now())
         RETURNING assignment_id`,
        [candidate.user_id, candidate.case_id, candidate.match_score, candidate.match_reason],
      )
      const assignmentId = assignmentResult.rows[0].assignment_id

      const attemptResult = await client.query<{ attempt_id: string }>(
        `INSERT INTO task_attempts (assignment_id, time_limit_seconds)
         VALUES ($1, $2)
         RETURNING attempt_id`,
        [assignmentId, candidate.time_limit_seconds],
      )

      return toDispatchItem(candidate, assignmentId, attemptResult.rows[0].attempt_id)
    })

    if (!result) {
      return NextResponse.json(
        { error: `No eligible ${taskType ?? 'practice'} task is available for this learner.` },
        { status: 404 },
      )
    }

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 })
    console.error('Personalized task selection failed', error)
    return NextResponse.json({ error: 'Database task selection failed' }, { status: 500 })
  }
}
