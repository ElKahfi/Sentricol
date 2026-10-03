import 'server-only'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { getDatabase } from '@/lib/db'
import { harnessProfile } from '@/lib/harnessProfile'
import { phishingScore, SCORING_VERSION, validateCase, type CourseCase, type Knowledge, type Phase } from '@/lib/emailCourse'
import type { Player } from '@/lib/player-auth'

export const COURSE_AI_POOL_TARGET: Record<Phase, number> = { easy: 1, normal: 2, hard: 3, master: 4 }
type RecordDraft = { label: string; detail: string; tag: Knowledge; relevant: boolean; critical: boolean }
type Generated = {
  task: { id: string; phase: Phase; objective: Knowledge; decision: 'legitimate' | 'phishing'; scenarioBrief: string;
    behavior: CourseCase['behavior']; indicators: CourseCase['indicators']; phishingScore: number }
  email: { id: string; senderName: string; senderEmail: string; recipientEmail: string; subject: string; body: string; threat: string }
  courseEvidence: { workContext: string; records: RecordDraft[]; explanation: string; hints: string[] }
}

function runCourseHarness(profile: Awaited<ReturnType<typeof harnessProfile>>, objective: Knowledge): Promise<Generated> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.SENTRI_PYTHON ?? 'python3',
      [path.join(/* turbopackIgnore: true */ process.cwd(), 'py', 'harness_bridge.py')],
      {stdio:['pipe','pipe','pipe']})
    let output = '', errors = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('AI course generation timed out')) }, 310000)
    child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; if (output.length > 300000) { child.kill(); reject(new Error('AI course response too large')) } })
    child.stderr.setEncoding('utf8').on('data', chunk => { errors = (errors + chunk).slice(-2000) })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => { clearTimeout(timer); if (code) reject(new Error(errors || 'AI course generation failed'))
      else { try { resolve(JSON.parse(output) as Generated) } catch { reject(new Error('Invalid AI course response')) } } })
    child.stdin.end(JSON.stringify({operation:'generate_course', profile, objective}))
  })
}

export function toCourseCase(generated: Generated, phase: Phase, objective: Knowledge, challenge?: string): CourseCase {
  const {task, email, courseEvidence} = generated
  if (task.phase !== phase || task.objective !== objective || task.id !== email.id ||
      (email.threat === 'legitimate') !== (task.decision === 'legitimate')) throw new Error('AI course task does not match its requested phase, objective, or decision')
  if (!courseEvidence || !Array.isArray(courseEvidence.records)) throw new Error('AI course evidence is missing')
  const records = courseEvidence.records
  const relevant = records.flatMap((record, index) => record.relevant ? [`record-${index + 1}`] : [])
  const critical = records.flatMap((record, index) => record.critical ? [`record-${index + 1}`] : [])
  if (records.length < 2 || records.length > 6 || !relevant.length || !critical.length ||
      !records.some(record => !record.relevant) || !records.some(record => record.relevant && record.tag === objective) ||
      records.some(record => record.critical && !record.relevant)) throw new Error('AI course rubric is incomplete')
  const c: CourseCase = {
    id: task.id, campaignId: task.id, phase, objective,
    challenge: challenge ?? `${phase}-${objective}-ai-v1`,
    public: {from:`${email.senderName} <${email.senderEmail}>`, to:email.recipientEmail, subject:email.subject,
      body:email.body, context:courseEvidence.workContext,
      evidence:records.map((record,index) => ({id:`record-${index + 1}`,label:record.label,detail:record.detail}))},
    behavior:task.behavior, indicators:task.indicators,
    primaryBehavior:(Object.entries(task.behavior).sort((a,b)=>b[1]-a[1])[0]?.[1] ?? 0) > 0
      ? Object.entries(task.behavior).sort((a,b)=>b[1]-a[1])[0][0] as CourseCase['primaryBehavior'] : null,
    rubric:{decision:task.decision, evidenceAlternatives:[relevant], criticalEvidence:critical,
      knowledgeChecks:records.map((record,index)=>({tag:record.tag,evidenceId:`record-${index + 1}`,expectedSelected:record.relevant})),
      explanation:courseEvidence.explanation,hints:courseEvidence.hints},
  }
  validateCase(c)
  if (Math.abs(phishingScore(c) - task.phishingScore) > .00011) throw new Error('AI phishing score does not match course scoring')
  return c
}

export async function generateCourseCase(player: Player, phase: Phase, objective: Knowledge, challenge?: string) {
  const profile = {...await harnessProfile(player), phase}
  const generated = await runCourseHarness(profile, objective)
  const content = toCourseCase(generated, phase, objective, challenge)
  const reviewStatus = phase === 'hard' || phase === 'master' ? 'pending_review' : 'approved'
  await getDatabase().query(
    `INSERT INTO email_course_cases(case_key,company_id,requested_for_user_id,source,review_status,scoring_version,content)
     VALUES($1,$2,$3,'ai',$4,$5,$6) ON CONFLICT(case_key) DO NOTHING`,
    [`ai:${content.id}`, Number(profile.companyId), Number(player.userId), reviewStatus, SCORING_VERSION, content])
  return {content, reviewStatus}
}
