import 'server-only'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { getDatabase, withTransaction } from '@/lib/db'
import { harnessProfile } from '@/lib/harnessProfile'
import type { Player } from '@/lib/player-auth'
import type { DispatchItem, Email } from '@/lib/types'

type Generated = {
  task: { id: string; phase: string; phishingScore: number; objective: string; behavior: Record<string, number>; indicators: Record<string, number> }
  email: { id: string; senderName: string; senderEmail: string; recipientEmail: string; subject: string; body: string; timestamp: string;
    links: { text: string; url: string }[]; attachments: { fileName: string; fileType: string; description: string }[];
    threat: string; clues: { profileAnalysis: string; linkAnalysis: string; fileAnalysis: string; languageAnalysis: string; contextAnalysis: string; requestAnalysis: string } }
}

function runHarness(profile: Awaited<ReturnType<typeof harnessProfile>>): Promise<Generated> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.SENTRI_PYTHON ?? 'python3',
      [path.join(/* turbopackIgnore: true */ process.cwd(), 'py', 'harness_bridge.py')],
      { stdio: ['pipe', 'pipe', 'pipe'] })
    let output = '', errors = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('AI generation timed out')) }, 310000)
    child.stdout.setEncoding('utf8').on('data', chunk => {
      output += chunk
      if (output.length > 200000) { child.kill(); reject(new Error('AI response too large')) }
    })
    child.stderr.setEncoding('utf8').on('data', chunk => { errors = (errors + chunk).slice(-2000) })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => {
      clearTimeout(timer)
      if (code) { reject(new Error(errors || 'AI generation failed')); return }
      try { resolve(JSON.parse(output) as Generated) } catch { reject(new Error('Invalid AI response')) }
    })
    child.stdin.end(JSON.stringify({ operation: 'generate', profile }))
  })
}

function playableEmail(generated: Generated['email'], recipient: string): Email {
  return {
    id: generated.id, from: generated.senderName, senderDomain: generated.senderEmail,
    to: recipient, subject: generated.subject, body: generated.body, timestamp: generated.timestamp,
    links: generated.links,
    attachments: generated.attachments.map(a => ({ name: a.fileName, type: a.fileType, size: 0, suspicious: false, details: a.description })),
    isLegitimate: generated.threat === 'legitimate',
    threat: generated.threat === 'legitimate' ? 'legitimate' : 'phishing',
    clues: {
      senderProfile: generated.clues.profileAnalysis,
      linkDetails: generated.links.length ? [generated.clues.linkAnalysis] : [],
      attachmentAnalysis: generated.clues.fileAnalysis,
      languageAnalysis: generated.clues.languageAnalysis,
      contextAnalysis: generated.clues.contextAnalysis,
      requestAnalysis: generated.clues.requestAnalysis,
    },
  }
}

export async function generatePlayableEmail(player: Player): Promise<DispatchItem | null> {
  const profile = await harnessProfile(player)
  const requiresReview = profile.phase === 'hard' || profile.phase === 'master'
  if (requiresReview) {
    const available = await getDatabase().query(
      `SELECT 1 FROM cases c JOIN tasks t USING(task_id)
        WHERE c.content_source='ai_generated' AND c.review_status IN ('pending_review','approved')
          AND c.answer_details->>'requestedForUser'=$1
          AND c.answer_details->>'phase'=$2
          AND NOT EXISTS (SELECT 1 FROM task_assignments a WHERE a.case_id=c.case_id)
        LIMIT 1`, [player.userId, profile.phase])
    if (available.rowCount) return null
  }
  // Resume existing work rather than generating a second case on a refresh.
  const active = await getDatabase().query(
    `SELECT 1 FROM task_assignments a JOIN users u USING(user_id)
      JOIN cases c USING(case_id) JOIN tasks t USING(task_id)
      JOIN incident_types i USING(incident_type_id)
      JOIN task_attempts x USING(assignment_id)
     WHERE u.user_id=$1 AND i.incident_code='email' AND a.status IN ('assigned','started')
       AND x.completed_at IS NULL LIMIT 1`, [player.userId])
  if (active.rowCount) return null
  const generated = await runHarness(profile)
  if (!generated?.task || !generated.email || generated.task.id !== generated.email.id) throw new Error('AI task mismatch')
  if (generated.task.phase !== profile.phase) throw new Error('AI task phase mismatch')
  const email = playableEmail(generated.email, player.email)
  const decision = email.isLegitimate ? 'legitimate' : 'phishing'
  return withTransaction(async client => {
    await client.query('SELECT user_id FROM users WHERE user_id=$1 FOR UPDATE', [player.userId])
    if (requiresReview) {
      const available = await client.query(
        `SELECT 1 FROM cases c WHERE c.content_source='ai_generated' AND c.review_status IN ('pending_review','approved')
          AND c.answer_details->>'requestedForUser'=$1
          AND c.answer_details->>'phase'=$2
          AND NOT EXISTS (SELECT 1 FROM task_assignments a WHERE a.case_id=c.case_id)
          LIMIT 1`, [player.userId, profile.phase])
      if (available.rowCount) return null
    }
    const duplicate = await client.query(
      `SELECT 1 FROM task_assignments a JOIN cases c USING(case_id) JOIN tasks t USING(task_id)
        JOIN incident_types i USING(incident_type_id) JOIN task_attempts x USING(assignment_id)
       WHERE a.user_id=$1 AND i.incident_code='email' AND a.status IN ('assigned','started')
         AND x.completed_at IS NULL LIMIT 1`, [player.userId])
    if (duplicate.rowCount && !requiresReview) return null
    const incident = await client.query<{ incident_type_id: number }>("SELECT incident_type_id FROM incident_types WHERE incident_code='email'")
    if (!incident.rows[0]) throw new Error('Email incident type is missing')
    const task = await client.query<{ task_id: number }>(
      `INSERT INTO tasks(task_code,incident_type_id,title,priority,difficulty,base_experience,time_limit_seconds)
       VALUES($1,$2,$3,'MEDIUM',$4,30,180) RETURNING task_id`,
      [generated.task.id, incident.rows[0].incident_type_id, email.subject.slice(0, 200),
        profile.phase === 'easy' ? 1 : profile.phase === 'normal' ? 2 : profile.phase === 'hard' ? 3 : 4])
    await client.query(
      `INSERT INTO task_target_departments(task_id,department_id)
       SELECT $1,e.department_id FROM users u JOIN employees e USING(employee_id)
        WHERE u.user_id=$2`, [task.rows[0].task_id, player.userId])
    const caseResult = await client.query<{ case_id: number }>(
      `INSERT INTO cases(task_id,content_source,raw_content,phishing_score,correct_decision,answer_details,review_status)
       VALUES($1,'ai_generated',$2,$3,$4,$5,$6) RETURNING case_id`,
      [task.rows[0].task_id, email, generated.task.phishingScore, decision,
        { harness: generated.task, links: generated.email.links, originalClues: generated.email.clues,
          requestedForUser: player.userId, phase: profile.phase }, requiresReview ? 'pending_review' : 'approved'])
    for (const [tag, intensity] of Object.entries({ ...generated.task.behavior, ...generated.task.indicators })) {
      if (!intensity) continue
      const tagRow = await client.query<{ tag_id: number }>(
        `INSERT INTO tags(tag_code,tag_name,tag_category)
         VALUES($1,$2,$3) ON CONFLICT(tag_code) DO UPDATE SET is_active=true RETURNING tag_id`,
        [tag, tag.replace(/([A-Z])/g, ' $1').trim(), tag in generated.task.behavior ? 'behavior' : 'knowledge'])
      await client.query(
        'INSERT INTO case_tags(case_id,tag_id,intensity) VALUES($1,$2,$3)',
        [caseResult.rows[0].case_id, tagRow.rows[0].tag_id, intensity])
    }
    if (requiresReview) return null
    const assignment = await client.query<{ assignment_id: string }>(
      `INSERT INTO task_assignments(user_id,case_id,assignment_source,status,match_reason,started_at)
       VALUES($1,$2,'adaptive','started',$3,now()) RETURNING assignment_id`,
      [player.userId, caseResult.rows[0].case_id, { selection: 'ai-harness', objective: generated.task.objective }])
    const attempt = await client.query<{ attempt_id: string }>(
      'INSERT INTO task_attempts(assignment_id,time_limit_seconds) VALUES($1,180) RETURNING attempt_id',
      [assignment.rows[0].assignment_id])
    return {
      id: email.id, type: 'email', timestamp: Date.now(), payload: email,
      assignmentId: assignment.rows[0].assignment_id, attemptId: attempt.rows[0].attempt_id,
      caseId: caseResult.rows[0].case_id, taskCode: generated.task.id, priority: 'MEDIUM',
      matchReason: { selection: 'ai-harness', objective: generated.task.objective }, source: 'database',
    }
  })
}
