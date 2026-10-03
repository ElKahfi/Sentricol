import { NextRequest, NextResponse } from 'next/server'
import { localAdminPlayer } from '@/lib/player-auth'
import { getDatabase } from '@/lib/db'
import { SCORING_VERSION, validateCase, type CourseCase } from '@/lib/emailCourse'

const reply = (data: unknown, status = 200) => NextResponse.json(data, {status, headers:{'Cache-Control':'no-store'}})

async function admin() {
  const player = await localAdminPlayer()
  return player?.userCode === 'usr_0001' ? player : null
}

export async function GET() {
  const player = await admin()
  if (!player) return reply({error:'Admin controls are unavailable.'},403)
  try {
    const result = await getDatabase().query<{case_key:string; content:CourseCase}>(
      `SELECT case_key,content FROM email_course_cases
       WHERE requested_for_user_id=$1 AND source='ai' AND review_status='pending_review'
         AND scoring_version=$2 ORDER BY created_at,case_key`, [player.userId,SCORING_VERSION])
    return reply({cases:result.rows.map(row => ({key:row.case_key,phase:row.content.phase,
      objective:row.content.objective,subject:row.content.public.subject,
      from:row.content.public.from,body:row.content.public.body,
      evidence:row.content.public.evidence,decision:row.content.rubric.decision,
      explanation:row.content.rubric.explanation}))})
  } catch { return reply({error:'Review queue is unavailable.'},503) }
}

export async function POST(request: NextRequest) {
  const player = await admin()
  if (!player) return reply({error:'Admin controls are unavailable.'},403)
  if (request.headers.get('origin') !== request.nextUrl.origin) return reply({error:'Invalid request origin.'},403)
  let input: {key?:unknown; action?:unknown}
  try { input = await request.json() } catch { return reply({error:'Invalid request.'},400) }
  if (typeof input?.key !== 'string' || !/^ai:[0-9a-f-]{36}$/i.test(input.key) || !['approve','reject'].includes(String(input.action)))
    return reply({error:'Invalid review action.'},400)
  try {
    const db = getDatabase()
    const row = (await db.query<{content:CourseCase}>(
      `SELECT content FROM email_course_cases WHERE case_key=$1 AND requested_for_user_id=$2
       AND source='ai' AND review_status='pending_review' AND scoring_version=$3`,
      [input.key,player.userId,SCORING_VERSION])).rows[0]
    if (!row) return reply({error:'This draft is no longer awaiting review.'},409)
    if (input.action === 'approve') {
      try { validateCase(row.content) } catch { return reply({error:'This draft failed case validation. Reject it and generate another.'},422) }
    }
    const status = input.action === 'approve' ? 'approved' : 'rejected'
    const updated = await db.query(
      `UPDATE email_course_cases SET review_status=$1 WHERE case_key=$2 AND requested_for_user_id=$3
       AND review_status='pending_review'`,[status,input.key,player.userId])
    if (!updated.rowCount) return reply({error:'This draft was already reviewed.'},409)
    return reply({status})
  } catch { return reply({error:'Could not save the review.'},503) }
}
