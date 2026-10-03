import 'server-only'
import { getDatabase } from '@/lib/db'
import { COURSE_AI_POOL_TARGET, generateCourseCase } from '@/lib/courseGeneration'
import { PHASES, type CourseCase, type CourseState, type Knowledge, type Phase } from '@/lib/emailCourse'
import type { Player } from '@/lib/player-auth'

type PoolRow = { review_status: string; content: CourseCase }
type Need = { phase: Phase; objective: Knowledge; challenge?: string }

async function rowsFor(player: Player, phase: Phase): Promise<PoolRow[]> {
  const result = await getDatabase().query<PoolRow>(
    `SELECT review_status,content FROM email_course_cases
     WHERE requested_for_user_id=$1 AND source='ai' AND content->>'phase'=$2
       AND review_status IN ('approved','pending_review')`, [player.userId, phase])
  return result.rows
}

export async function requiredCourseCase(player: Player, state: CourseState): Promise<{need: Need; waitingReview: boolean} | null> {
  if (state.pendingEvent || state.status === 'graduated' || state.status === 'needs-follow-up') return null
  const phase = state.phase
  const rows = await rowsFor(player, phase)
  const used = new Set(state.slots.flatMap(slot => slot.assignments.map(a => a.case.campaignId)))
  const slots = state.slots.filter(slot => slot.phase === phase)
  if (!slots.length) {
    const required = new Map<Knowledge, number>()
    for (const objective of state.config.phases[phase]) required.set(objective, (required.get(objective) ?? 0) + 1)
    for (const [objective, count] of required) {
      const available = rows.filter(row => row.review_status === 'approved' && row.content.objective === objective && !used.has(row.content.campaignId))
      if (available.length < count) {
        const pending = rows.some(row => row.review_status === 'pending_review' && row.content.objective === objective)
        return {need:{phase,objective},waitingReview:pending}
      }
    }
    return null
  }
  for (const slot of slots.filter(slot => !slot.passed || slot.earnedUnits < slot.allocationUnits)) {
    const challenge = slot.assignments[0]?.case.challenge
    if (!challenge) continue
    const approved = rows.some(row => row.review_status === 'approved' && row.content.objective === slot.objective &&
      row.content.challenge === challenge && !used.has(row.content.campaignId))
    if (!approved) {
      const pending = rows.some(row => row.review_status === 'pending_review' && row.content.objective === slot.objective && row.content.challenge === challenge)
      return {need:{phase,objective:slot.objective,challenge},waitingReview:pending}
    }
  }
  return null
}

export async function generateLocked(player: Player, need: Need): Promise<'created' | 'busy'> {
  const client = await getDatabase().connect()
  const key = Number(player.userId)
  let locked = false
  try {
    // A transaction pins the backend on transaction-pooled PostgreSQL services.
    // Session locks can otherwise be acquired and released on different backends.
    await client.query('BEGIN')
    locked = Boolean((await client.query<{locked:boolean}>('SELECT pg_try_advisory_xact_lock(620503,$1::int) AS locked', [key])).rows[0]?.locked)
    if (!locked) return 'busy'
    await generateCourseCase(player, need.phase, need.objective, need.challenge)
    return 'created'
  } finally {
    try { await client.query('ROLLBACK') } finally { client.release() }
  }
}

// Best-effort pre-generation on the self-hosted server. A missing draft never
// silently falls back to authored cases; the required path generates on demand.
export async function preGenerateOne(player: Player, state: CourseState) {
  if (state.status === 'graduated') return
  const current = PHASES.indexOf(state.phase)
  for (const phase of PHASES.slice(current, Math.min(current + 2, PHASES.length))) {
    const rows = await rowsFor(player, phase)
    for (const objective of new Set(state.config.phases[phase])) {
      const count = rows.filter(row => row.content.objective === objective).length
      if (count < COURSE_AI_POOL_TARGET[phase]) {
        await generateLocked(player, {phase,objective})
        return
      }
    }
  }
}
