import 'server-only'
import { getDatabase } from '@/lib/db'
import type { Player } from '@/lib/player-auth'
import { TRAINING_CONFIG } from '@/lib/trainingConfig'

const phases = ['easy', 'normal', 'hard', 'master'] as const
const skillTags = new Set([
  'senderIdentity', 'linkDestination', 'attachmentSafety', 'requestContext',
  'credentialProtection', 'mfaSafety', 'sensitiveDataHandling', 'authorizationChecks',
  'authority', 'urgency', 'fear', 'curiosity', 'rewardIncentive', 'helpfulness',
  'familiarityImpersonation',
])
const objectiveTags = new Set([
  'senderIdentity', 'linkDestination', 'attachmentSafety', 'requestContext',
  'credentialProtection', 'mfaSafety', 'sensitiveDataHandling', 'authorizationChecks',
])
const legacyTags: Record<string, string> = {
  senderVerification: 'senderIdentity', spoofing: 'senderIdentity',
  urlInspection: 'linkDestination', domainAwareness: 'linkDestination',
  dataHandling: 'sensitiveDataHandling', classification: 'sensitiveDataHandling',
  mfa: 'mfaSafety', greed: 'rewardIncentive', trust: 'familiarityImpersonation',
}

export async function harnessProfile(player: Player) {
  const database = getDatabase()
  const [employee, skillRows, recentRows] = await Promise.all([
    database.query<{ company_id: number; position_title: string | null; unlocked_difficulty: number }>(
      `SELECT d.company_id, e.position_title, COALESCE(p.unlocked_difficulty, 1) AS unlocked_difficulty
         FROM users u JOIN employees e USING(employee_id)
         JOIN departments d USING(department_id)
         LEFT JOIN user_progress p USING(user_id)
        WHERE u.user_id = $1`, [player.userId]),
    database.query<{ tag_code: string; ability_score: string; attempts: number }>(
      `SELECT t.tag_code, s.ability_score::text, s.attempts
         FROM user_skill_profiles s JOIN tags t USING(tag_id)
        WHERE s.user_id = $1`, [player.userId]),
    database.query<{ objective: string }>(
      `SELECT c.answer_details->'harness'->>'objective' AS objective
         FROM task_assignments a JOIN cases c USING(case_id)
        WHERE a.user_id=$1 AND a.status='completed' AND c.content_source='ai_generated'
        ORDER BY a.completed_at DESC LIMIT 20`, [player.userId]),
  ])
  const row = employee.rows[0]
  if (!row) throw new Error('Learner profile is unavailable')
  const unlocked = Number(row.unlocked_difficulty) || 1
  const stage = !TRAINING_CONFIG.phaseProgressionEnabled ? 0 : unlocked <= 2 ? 0 : unlocked <= 5 ? 1 : unlocked <= 8 ? 2 : 3
  const configuredPhase = process.env.SENTRI_AI_PHASE
  const phase = phases.find(value => value === configuredPhase) ?? phases[stage]
  return {
    userCode: player.userCode,
    companyId: String(row.company_id),
    companyName: player.company,
    department: player.department,
    position: row.position_title || player.rank,
    rank: player.rank,
    phase,
    skills: Object.values(skillRows.rows.reduce<Record<string, { tag: string; ability: number; attempts: number }>>((acc, s) => {
      const tag = legacyTags[s.tag_code] ?? s.tag_code
      if (!skillTags.has(tag) || s.attempts <= 0) return acc
      const current = acc[tag]
      if (!current || Number(s.ability_score) < current.ability) acc[tag] = {
        tag, ability: Number(s.ability_score), attempts: s.attempts,
      }
      return acc
    }, {})),
    recentObjectives: recentRows.rows.map(row => row.objective).filter(value => objectiveTags.has(value)),
  }
}
