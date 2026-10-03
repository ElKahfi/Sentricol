import { currentPlayer } from '@/lib/player-auth'
import { NextResponse } from 'next/server'
import { isDatabaseConfigured, withTransaction } from '@/lib/db'
import { TRAINING_CONFIG } from '@/lib/trainingConfig'

interface AttemptRequest {
  attemptId?: string
  decision?: string
  investigatedCategories?: string[]
  verified?: boolean
  attemptNumber?: number
}

interface AttemptContext {
  attempt_id: string
  user_id: number
  assignment_id: string
  correct_decision: string
  base_experience: number
  incident_code: 'email' | 'password' | 'data-classification'
  started_at: Date
  completed_at: Date | null
  score: number
  experience_gained: number
  raw_content: { requiredInvestigationCategories?: string[]; investigationStates?: Record<string, string> }
}

export async function POST(request: Request) {
  try {
  const player = await currentPlayer()
  if (!player) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: 'DATABASE_URL is not configured' }, { status: 503 })
  }

  const body = (await request.json()) as AttemptRequest
  if (!body || typeof body.attemptId !== 'string' || typeof body.decision !== 'string' || !body.decision ||
      (body.investigatedCategories !== undefined && (!Array.isArray(body.investigatedCategories) || body.investigatedCategories.some(value => typeof value !== 'string')))) {
    return NextResponse.json({ error: 'attemptId and decision are required' }, { status: 400 })
  }
  const decision = body.decision

    const result = await withTransaction(async (client) => {
      const contextResult = await client.query<AttemptContext>(
        `SELECT a.attempt_id,
                a.started_at,
                a.completed_at, a.score, a.experience_gained,
                ta.assignment_id,
                ta.user_id,
                c.correct_decision,
                c.raw_content,
                t.base_experience,
                it.incident_code
           FROM task_attempts a
           JOIN task_assignments ta ON ta.assignment_id = a.assignment_id
           JOIN cases c ON c.case_id = ta.case_id
           JOIN tasks t ON t.task_id = c.task_id
           JOIN incident_types it ON it.incident_type_id = t.incident_type_id
          WHERE a.attempt_id = $1 AND ta.user_id = $2
          FOR UPDATE`,
        [body.attemptId, player.userId],
      )
      const context = contextResult.rows[0]
      if (!context) return null
      // A response can be lost after COMMIT. Replay the persisted result without
      // awarding EXP or updating statistics a second time.
      if (context.completed_at) {
        const saved = await client.query<{is_correct: boolean; graduation_percentage: string}>(
          `SELECT r.is_correct, p.graduation_percentage FROM task_results r
           JOIN user_progress p ON p.user_id=$2 WHERE r.attempt_id=$1`,
          [context.attempt_id, player.userId])
        if (!saved.rows[0]) throw new Error('Completed attempt has no saved result')
        return { isCorrect: saved.rows[0].is_correct, score: Number(context.score),
          experienceGained: Number(context.experience_gained),
          graduationPercentage: Number(saved.rows[0].graduation_percentage) }
      }
      if (TRAINING_CONFIG.phaseProgressionEnabled && context.incident_code === 'email') return { emailCourseRequired: true as const }

      const decisionMatches =
        decision.trim().toLowerCase() === context.correct_decision.trim().toLowerCase()
      const investigated = [...new Set(body.investigatedCategories ?? [])]
      const content = context.raw_content
      const required = content.requiredInvestigationCategories ?? (content.investigationStates
        ? Object.keys(content.investigationStates).filter(key => content.investigationStates?.[key] === 'suspicious') : undefined)
      const isCorrect = decisionMatches && (context.incident_code !== 'email' || !required ||
        (required.length === investigated.length && required.every(key => investigated.includes(key))))
      const attemptNumber = Number.isInteger(body.attemptNumber) ? Math.max(1, Math.min(4, body.attemptNumber!)) : 1
      const progressDelta = context.incident_code === 'email'
        ? (isCorrect ? (attemptNumber === 1 ? 5 : attemptNumber === 2 ? 2 : 0) : attemptNumber >= 4 ? -1 : 0)
        : (isCorrect ? 5 : 0)
      const timeTaken = Math.max(
        0,
        Math.round((Date.now() - new Date(context.started_at).getTime()) / 1000),
      )
      const experienceGained = isCorrect ? context.base_experience : 0
      const score = isCorrect ? 100 : 0

      await client.query(
        `UPDATE task_attempts
            SET decision = $2,
                score = $3::numeric,
                experience_gained = $4::int,
                time_taken_seconds = $5::int,
                investigation_time_seconds = CASE WHEN $6::int > 0 THEN $5::int ELSE 0 END,
                completed_at = now()
          WHERE attempt_id = $1`,
        [context.attempt_id, decision, score, experienceGained, timeTaken, investigated.length],
      )

      await client.query(
        `UPDATE task_assignments
            SET status = 'completed', completed_at = now()
          WHERE assignment_id = $1`,
        [context.assignment_id],
      )

      await client.query(
        `INSERT INTO task_results
           (attempt_id, is_correct, feedback_text, feedback_details, ability_change_summary)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          context.attempt_id,
          isCorrect,
          isCorrect ? 'Correct decision' : 'Review the case indicators and try a similar case.',
          { submittedDecision: decision, correctDecision: context.correct_decision },
          { direction: isCorrect ? 'increase' : 'decrease' },
        ],
      )

      for (const category of investigated) {
        await client.query(
          `INSERT INTO attempt_actions (attempt_id, action_type, action_target)
           VALUES ($1, 'investigate', $2)`,
          [context.attempt_id, category],
        )
      }
      if (body.verified) {
        await client.query(
          `INSERT INTO attempt_actions (attempt_id, action_type, action_target)
           VALUES ($1, 'verify', 'contact')`,
          [context.attempt_id],
        )
      }

      await client.query(
        `INSERT INTO attempt_tag_results
           (attempt_id, tag_id, was_successful, score_earned, ability_delta)
         SELECT $1,
                ct.tag_id,
                $2::boolean,
                $3::numeric * ct.intensity,
                (CASE WHEN $2::boolean THEN 2 ELSE -2 END) * ct.intensity
           FROM task_assignments ta
           JOIN case_tags ct ON ct.case_id = ta.case_id
          WHERE ta.assignment_id = $4
         ON CONFLICT (attempt_id, tag_id) DO NOTHING`,
        [context.attempt_id, isCorrect, score, context.assignment_id],
      )

      await client.query(
        `INSERT INTO user_skill_profiles
           (user_id, tag_id, ability_score, confidence_score, attempts, correct, wrong,
            total_decision_seconds, total_investigation_seconds, investigated_attempts,
            verified_attempts, current_streak, best_streak, last_practiced_at)
         SELECT $1,
                atr.tag_id,
                LEAST(100, GREATEST(0, 10 + atr.ability_delta)),
                5,
                1,
                CASE WHEN $2::boolean THEN 1 ELSE 0 END,
                CASE WHEN $2::boolean THEN 0 ELSE 1 END,
                $3::numeric,
                CASE WHEN $4::int > 0 THEN $3::numeric ELSE 0 END,
                CASE WHEN $4::int > 0 THEN 1 ELSE 0 END,
                CASE WHEN $5::boolean THEN 1 ELSE 0 END,
                CASE WHEN $2::boolean THEN 1 ELSE 0 END,
                CASE WHEN $2::boolean THEN 1 ELSE 0 END,
                now()
           FROM attempt_tag_results atr
          WHERE atr.attempt_id = $6
         ON CONFLICT (user_id, tag_id) DO UPDATE SET
           ability_score = LEAST(100, GREATEST(0, user_skill_profiles.ability_score + EXCLUDED.ability_score - 10)),
           confidence_score = LEAST(100, user_skill_profiles.confidence_score + 2),
           attempts = user_skill_profiles.attempts + 1,
           correct = user_skill_profiles.correct + EXCLUDED.correct,
           wrong = user_skill_profiles.wrong + EXCLUDED.wrong,
           total_decision_seconds = user_skill_profiles.total_decision_seconds + EXCLUDED.total_decision_seconds,
           total_investigation_seconds = user_skill_profiles.total_investigation_seconds + EXCLUDED.total_investigation_seconds,
           investigated_attempts = user_skill_profiles.investigated_attempts + EXCLUDED.investigated_attempts,
           verified_attempts = user_skill_profiles.verified_attempts + EXCLUDED.verified_attempts,
           current_streak = CASE WHEN $2::boolean THEN user_skill_profiles.current_streak + 1 ELSE 0 END,
           best_streak = GREATEST(user_skill_profiles.best_streak, CASE WHEN $2::boolean THEN user_skill_profiles.current_streak + 1 ELSE 0 END),
           last_practiced_at = now(),
           updated_at = now()`,
        [context.user_id, isCorrect, timeTaken, investigated.length, Boolean(body.verified), context.attempt_id],
      )

      const progressResult = await client.query<{ graduation_percentage: string }>(
        `UPDATE user_progress
            SET experience = experience + $2::int,
                graduation_percentage = GREATEST(0, LEAST(100, graduation_percentage + $3::numeric)),
                average_score = (
                  SELECT AVG(a.score)
                    FROM task_attempts a
                    JOIN task_assignments ta ON ta.assignment_id = a.assignment_id
                   WHERE ta.user_id = $1 AND a.completed_at IS NOT NULL
                ),
                updated_at = now()
          WHERE user_id = $1
          RETURNING graduation_percentage`,
        [context.user_id, experienceGained, progressDelta],
      )

      await client.query(
        `INSERT INTO user_statistics
           (user_id, tasks_completed, correct, wrong, emails_completed,
            password_completed, classification_completed, total_decision_seconds,
            total_investigation_seconds, investigated_tasks, verified_tasks,
            current_streak, best_streak, last_played_at)
         VALUES (
           $1, 1,
           CASE WHEN $2::boolean THEN 1 ELSE 0 END,
           CASE WHEN $2::boolean THEN 0 ELSE 1 END,
           CASE WHEN $3::text = 'email' THEN 1 ELSE 0 END,
           CASE WHEN $3::text = 'password' THEN 1 ELSE 0 END,
           CASE WHEN $3::text = 'data-classification' THEN 1 ELSE 0 END,
           $4::numeric,
           CASE WHEN $5::int > 0 THEN $4::numeric ELSE 0 END,
           CASE WHEN $5::int > 0 THEN 1 ELSE 0 END,
           CASE WHEN $6::boolean THEN 1 ELSE 0 END,
           CASE WHEN $2::boolean THEN 1 ELSE 0 END,
           CASE WHEN $2::boolean THEN 1 ELSE 0 END,
           now()
         )
         ON CONFLICT (user_id) DO UPDATE SET
           tasks_completed = user_statistics.tasks_completed + 1,
           correct = user_statistics.correct + EXCLUDED.correct,
           wrong = user_statistics.wrong + EXCLUDED.wrong,
           emails_completed = user_statistics.emails_completed + EXCLUDED.emails_completed,
           password_completed = user_statistics.password_completed + EXCLUDED.password_completed,
           classification_completed = user_statistics.classification_completed + EXCLUDED.classification_completed,
           total_decision_seconds = user_statistics.total_decision_seconds + EXCLUDED.total_decision_seconds,
           total_investigation_seconds = user_statistics.total_investigation_seconds + EXCLUDED.total_investigation_seconds,
           investigated_tasks = user_statistics.investigated_tasks + EXCLUDED.investigated_tasks,
           verified_tasks = user_statistics.verified_tasks + EXCLUDED.verified_tasks,
           current_streak = CASE WHEN $2::boolean THEN user_statistics.current_streak + 1 ELSE 0 END,
           best_streak = GREATEST(user_statistics.best_streak, CASE WHEN $2::boolean THEN user_statistics.current_streak + 1 ELSE 0 END),
           last_played_at = now()`,
        [context.user_id, isCorrect, context.incident_code, timeTaken, investigated.length, Boolean(body.verified)],
      )

      return {
        isCorrect,
        score,
        experienceGained,
        graduationPercentage: Number(progressResult.rows[0]?.graduation_percentage ?? 0),
      }
    })

    if (!result) {
      return NextResponse.json({ error: 'Attempt not found or already completed' }, { status: 404 })
    }

    if ('emailCourseRequired' in result) return NextResponse.json({ error: 'Resume email investigation through the email course.' }, { status: 409 })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 })
    console.error('Attempt recording failed', error)
    return NextResponse.json({ error: 'Database attempt recording failed' }, { status: 500 })
  }
}
