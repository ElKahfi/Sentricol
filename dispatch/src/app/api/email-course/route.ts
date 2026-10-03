import { currentPlayer, localAdminPlayer } from '@/lib/player-auth'
import { NextResponse, after } from 'next/server'
import { getDatabase, isDatabaseConfigured } from '@/lib/db'
import { CourseError, type CourseState } from '@/lib/emailCourse'
import { executeCourseCommand, validateCommand } from '@/lib/emailCourseStore'
import { TRAINING_CONFIG } from '@/lib/trainingConfig'
import { generateLocked, preGenerateOne, requiredCourseCase } from '@/lib/coursePool'

const generationJobs = new Map<string, { running: boolean; retryAfter: number }>()

export async function POST(request: Request) {
  try {
  const player = await currentPlayer()
  if (!player) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
  if (!TRAINING_CONFIG.phaseProgressionEnabled && !await localAdminPlayer()) return NextResponse.json({ error: 'Phase progression is currently disabled. Use regular task practice.' }, { status: 409 })
  if (!isDatabaseConfigured()) return NextResponse.json({ error: 'The training database is not configured.' }, { status: 503 })
    const input: unknown = await request.json()
    validateCommand(input)
    let result = await executeCourseCommand(input, player.userCode)
    const getState = async () => (await getDatabase().query<{state:CourseState}>(
      'SELECT state FROM email_course_enrollments WHERE user_id=$1', [player.userId])).rows[0]?.state
    let generation: {status:'created'|'busy'|'waiting-review'|'unavailable'} | undefined
    try {
    if (result.course.status === 'content-blocked') {
      // Saving progress is independent of model availability and latency.
      const state = await getState()
      const required = state && await requiredCourseCase(player, state)
      const job = generationJobs.get(player.userId)
      if (required?.waitingReview) generation = { status: 'waiting-review' }
      else if (job?.running) generation = { status: 'busy' }
      else if (job && job.retryAfter > Date.now()) generation = { status: 'unavailable' }
      else {
        generation = { status: 'busy' }
        generationJobs.set(player.userId, { running: true, retryAfter: 0 })
        after(async () => {
          try {
            const state = await getState()
            const required = state && await requiredCourseCase(player, state)
            if (required && !required.waitingReview) await generateLocked(player, required.need)
            generationJobs.delete(player.userId)
          } catch (error) {
            generationJobs.set(player.userId, { running: false, retryAfter: Date.now() + 30000 })
            console.error('Course generation unavailable:', error instanceof Error ? error.message : 'unknown')
          }
        })
      }
      result = { ...result, course: { ...result.course, message: generation.status === 'unavailable'
        ? 'Your progress is saved. AI generation is unavailable; try Resume again shortly.'
        : 'Your progress is saved. Preparing the next email or waiting for admin review.' } }
    }
    if (result.course.status === 'active' && !result.course.active?.feedback) {
      after(async () => { try { const state = await getState(); if (state) await preGenerateOne(player,state) }
        catch (error) { console.error('Course AI pre-generation failed:', error instanceof Error ? error.message : error) } })
    }
    } catch {
      generation = { status: 'unavailable' }
      result = { ...result, course: { ...result.course, message: 'Your progress is saved. New email preparation is temporarily unavailable.' } }
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
