import { currentPlayer, localAdminPlayer } from '@/lib/player-auth'
import { NextResponse, after } from 'next/server'
import { getDatabase, isDatabaseConfigured } from '@/lib/db'
import { CourseError, type CourseState } from '@/lib/emailCourse'
import { executeCourseCommand, validateCommand } from '@/lib/emailCourseStore'
import { TRAINING_CONFIG } from '@/lib/trainingConfig'
import { generateLocked, preGenerateOne, requiredCourseCase } from '@/lib/coursePool'

export async function POST(request: Request) {
  const player = await currentPlayer()
  if (!player) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  if (!TRAINING_CONFIG.phaseProgressionEnabled && !await localAdminPlayer()) return NextResponse.json({ error: 'Phase progression is currently disabled. Use regular task practice.' }, { status: 409 })
  if (!isDatabaseConfigured()) return NextResponse.json({ error: 'The training database is not configured.' }, { status: 503 })
  try {
    const input: unknown = await request.json()
    validateCommand(input)
    let result = await executeCourseCommand(input, player.userCode)
    const getState = async () => (await getDatabase().query<{state:CourseState}>(
      'SELECT state FROM email_course_enrollments WHERE user_id=$1', [player.userId])).rows[0]?.state
    let generation: {status:'created'|'busy'|'waiting-review'} | undefined
    if (result.course.status === 'content-blocked') {
      const state = await getState()
      const required = state && await requiredCourseCase(player,state)
      if (required?.waitingReview) {
        generation = {status:'waiting-review'}
        result = {...result,course:{...result.course,message:'AI email case is awaiting admin review. Your progress is saved.'}}
      } else if (required) {
        const status = await generateLocked(player,required.need)
        generation = {status}
        if (status === 'created' && (required.need.phase === 'easy' || required.need.phase === 'normal')) {
          result = await executeCourseCommand({action:'resume'},player.userCode)
        } else if (status === 'created') {
          result = {...result,course:{...result.course,message:'AI email case is awaiting admin review. Your progress is saved.'}}
          generation = {status:'waiting-review'}
        }
      }
    }
    if (result.course.status === 'active' && !result.course.active?.feedback) {
      after(async () => { try { const state = await getState(); if (state) await preGenerateOne(player,state) }
        catch (error) { console.error('Course AI pre-generation failed:', error instanceof Error ? error.message : error) } })
    }
    return NextResponse.json({...result, ...(generation ? {generation} : {})}, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON request.' }, { status: 400 })
    if (error instanceof CourseError) return NextResponse.json({ error: error.message }, { status: error.status })
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined
    console.error('Email course request failed:', code ?? 'unknown')
    return NextResponse.json({ error: code === '42P01'
      ? 'The email-course database upgrade has not been applied yet.'
      : 'Your course could not be saved. Retry to safely resume.' }, { status: 503 })
  }
}
