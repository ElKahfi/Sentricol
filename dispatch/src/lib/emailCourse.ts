import scoring from '../../../ai-harness/scoring.json'
// Pure, versioned course rules. The browser receives CourseView, never CourseState.
export const SCORING_VERSION = 'email-exp-v1.1'
export const PHASES = ['easy', 'normal', 'hard', 'master'] as const
export type Phase = typeof PHASES[number]
export const ATTEMPTS: Record<Phase, number> = { easy: 3, normal: 2, hard: 2, master: 1 }
export const ATTEMPT_PERCENT = [100, 70, 40] as const
// Integer millionths of EXP prevent floating-point drift at phase gates.
export const EXP_UNIT = 1_000_000
export const PHASE_BUDGET = 250 * EXP_UNIT
export const TARGET_EXP = 1000
export const BEHAVIOR_WEIGHTS = scoring.behaviorWeights
export const PS_KNOWLEDGE_WEIGHTS = scoring.knowledgeWeights
export const KNOWLEDGE_WEIGHTS = {
  ...PS_KNOWLEDGE_WEIGHTS, independentVerification: 10, incidentReporting: 8,
  passwordStrength: 6, passwordUniqueness: 8, dataClassification: 8, sharingPermissions: 8,
} as const
export type Behavior = keyof typeof BEHAVIOR_WEIGHTS
export type Knowledge = keyof typeof KNOWLEDGE_WEIGHTS
export type Skill = Behavior | Knowledge
export type Decision = 'legitimate' | 'phishing'
export interface Evidence { id: string; label: string; detail: string }
export interface PublicCase {
  from: string; to: string; subject: string; body: string; context: string;
  evidence: Evidence[];
}
export interface CourseCase {
  id: string; campaignId: string; phase: Phase; objective: Knowledge; challenge: string;
  public: PublicCase;
  behavior: Record<Behavior, number>;
  indicators: Record<keyof typeof PS_KNOWLEDGE_WEIGHTS, number>;
  primaryBehavior: Behavior | null;
  rubric: {
    decision: Decision;
    // Select evidence supporting the decision, including legitimate evidence.
    evidenceAlternatives: string[][];
    criticalEvidence: string[];
    knowledgeChecks: { tag: Knowledge; evidenceId: string; expectedSelected: boolean }[];
    explanation: string;
    hints: string[];
  };
}
export interface CourseConfig {
  version: string;
  targetMinutes: number;
  recoveryAllowance: number;
  adminEventGates?: boolean;
  phases: Record<Phase, Knowledge[]>;
}
export const DEFAULT_CONFIG: CourseConfig = {
  version: 'email-course-1', targetMinutes: 30, recoveryAllowance: 8,
  phases: {
    easy: ['senderIdentity', 'linkDestination'],
    normal: ['attachmentSafety', 'requestContext'],
    hard: ['credentialProtection', 'authorizationChecks'],
    master: ['linkDestination', 'authorizationChecks'],
  },
}
export interface Observation { tag: Skill; phase: Phase; campaignId: string; q: number }
export interface SkillSummary {
  tag: Skill; phase: Phase; samples: number; ability: number | null;
  confidence: number; weight: number; bucket: string;
}
export interface Answer { assignmentId: string; decision: Decision; evidenceIds: string[] }
export interface Feedback {
  attempt: number; attemptLimit: number; passed: boolean; terminal: boolean;
  performance: number; earnedUnits: number; message: string;
  decision?: Decision; supportingEvidence?: string[];
}
export interface Assignment {
  id: string; case: CourseCase; rewardUnits: number; recovery: boolean;
  submissions: { answer: Answer; feedback: Feedback }[];
  acknowledged: boolean;
}
export interface Slot {
  id: string; phase: Phase; objective: Knowledge; allocationUnits: number;
  earnedUnits: number; passed: boolean; assignments: Assignment[];
}
export interface CourseState {
  version: typeof SCORING_VERSION; config: CourseConfig; phase: Phase;
  status: 'active' | 'content-blocked' | 'needs-follow-up' | 'event-pending' | 'graduated';
  pendingEvent?: 'event-1' | 'event-2' | null;
  message: string | null; slots: Slot[]; observations: Observation[];
}
export interface CourseView {
  version: string; status: CourseState['status']; phase: Phase; message: string | null;
  pendingEvent?: 'event-1' | 'event-2' | null;
  exp: number; targetExp: number; progress: number; targetMinutes: number;
  phases: { phase: Phase; exp: number; budget: number; passed: number; planned: number; unlocked: boolean }[];
  recoveryUsed: number; recoveryAllowance: number; skills: SkillSummary[];
  active: null | {
    id: string; objective: Knowledge; recovery: boolean; attemptLimit: number;
    submissionsUsed: number; rewardExp: number; nextRewardExp: number;
    public: PublicCase; feedback: Feedback | null;
  };
}
export class CourseError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CourseError(message)
}
export function validateConfig(config: CourseConfig) {
  requireRule(config && typeof config.version === 'string' && config.version.length > 0, 'Course version is required')
  requireRule(Number.isInteger(config.targetMinutes) && config.targetMinutes >= 5 && config.targetMinutes <= 180, 'Target duration must be 5–180 minutes')
  requireRule(Number.isInteger(config.recoveryAllowance) && config.recoveryAllowance >= 0 && config.recoveryAllowance <= 80, 'Invalid recovery allowance')
  requireRule(config.adminEventGates === undefined || typeof config.adminEventGates === 'boolean', 'Invalid event-gate setting')
  for (const phase of PHASES) {
    const objectives = config.phases?.[phase]
    requireRule(Array.isArray(objectives) && objectives.length >= 1 && objectives.length <= 20, `Configure 1–20 ${phase} slots`)
    requireRule(objectives.every(tag => Object.hasOwn(KNOWLEDGE_WEIGHTS, tag)), 'Unknown coverage objective')
  }
}
export function validateCase(c: CourseCase) {
  requireRule(c && typeof c.id === 'string' && c.id.length > 0 && typeof c.campaignId === 'string' && c.campaignId.length > 0, 'Case and campaign IDs are required')
  requireRule(PHASES.includes(c.phase) && Object.hasOwn(KNOWLEDGE_WEIGHTS, c.objective) && typeof c.challenge === 'string' && c.challenge.length > 0, 'Case phase, objective and challenge are required')
  for (const [catalog, values] of [[BEHAVIOR_WEIGHTS, c.behavior], [PS_KNOWLEDGE_WEIGHTS, c.indicators]] as const) {
    requireRule(values && Object.keys(values).length === Object.keys(catalog).length, 'Every static indicator must be explicit')
    for (const tag of Object.keys(catalog)) {
      const value = (values as Record<string, number>)[tag]
      requireRule([0, .25, .5, .75, 1].includes(value), `Invalid intensity for ${tag}`)
    }
  }
  requireRule(c.primaryBehavior === null || (Object.hasOwn(BEHAVIOR_WEIGHTS, c.primaryBehavior) && c.behavior[c.primaryBehavior] > 0), 'Invalid primary behavior')
  const p = c.public
  requireRule(p && ['from', 'to', 'subject', 'body', 'context'].every(k => typeof p[k as keyof PublicCase] === 'string'), 'Incomplete public content')
  requireRule(Array.isArray(p.evidence) && p.evidence.length > 0 && p.evidence.length <= 20, 'Case needs inspectable evidence')
  const ids = p.evidence.map(e => e.id)
  requireRule(new Set(ids).size === ids.length && p.evidence.every(e => e.id && typeof e.label === 'string' && typeof e.detail === 'string'), 'Invalid evidence')
  const r = c.rubric
  requireRule(r && ['legitimate', 'phishing'].includes(r.decision), 'Reviewed decision is required')
  requireRule(Array.isArray(r.evidenceAlternatives) && r.evidenceAlternatives.length > 0 && r.evidenceAlternatives.every(a => Array.isArray(a) && a.length > 0 && new Set(a).size === a.length && a.every(id => ids.includes(id))), 'Invalid evidence alternatives')
  requireRule(Array.isArray(r.criticalEvidence) && r.criticalEvidence.every(id => r.evidenceAlternatives.every(a => a.includes(id))), 'Critical evidence must occur in every valid answer')
  requireRule(Array.isArray(r.knowledgeChecks) && r.knowledgeChecks.length > 0 && r.knowledgeChecks.every(check => Object.hasOwn(KNOWLEDGE_WEIGHTS, check.tag) && ids.includes(check.evidenceId) && typeof check.expectedSelected === 'boolean'), 'Invalid knowledge checks')
  requireRule(r.knowledgeChecks.some(check => check.tag === c.objective), 'Objective must be assessed')
  requireRule(typeof r.explanation === 'string' && r.explanation.length > 0 && Array.isArray(r.hints) && r.hints.every(h => typeof h === 'string'), 'Reviewed feedback is required')
}
export function phishingScore(c: Pick<CourseCase, 'behavior' | 'indicators'>) {
  const b = Object.entries(BEHAVIOR_WEIGHTS).reduce((s, [tag, w]) => s + w * c.behavior[tag as Behavior], 0) / Object.values(BEHAVIOR_WEIGHTS).reduce((a, b) => a + b, 0)
  const k = Object.entries(PS_KNOWLEDGE_WEIGHTS).reduce((s, [tag, w]) => s + w * c.indicators[tag as keyof typeof PS_KNOWLEDGE_WEIGHTS], 0) / Object.values(PS_KNOWLEDGE_WEIGHTS).reduce((a, b) => a + b, 0)
  return .4 * b + .6 * k
}
export function skillSummary(observations: Observation[], tag: Skill, phase: Phase): SkillSummary {
  const distinct = new Map<string, Observation>()
  for (const o of observations) if (o.tag === tag && o.phase === phase) distinct.set(o.campaignId, o)
  const recent = [...distinct.values()].slice(-10)
  const n = recent.length
  const ability = n ? recent.reduce((s, o) => s + o.q, 0) / n : .5
  const confidence = n / (n + 5)
  const base = ({ ...BEHAVIOR_WEIGHTS, ...KNOWLEDGE_WEIGHTS })[tag]
  const weight = base * (1 + .5 * confidence * (1 - 2 * ability))
  const bucket = n < 3 ? 'Unknown' : ability < .4 ? 'Foundation' : ability < .6 ? 'Targeted practice' : ability < .8 ? 'Developing' : ability < .9 ? 'Demonstrated' : 'Strong'
  return { tag, phase, samples: n, ability: n ? ability * 100 : null, confidence, weight, bucket }
}
export function selectionPriority(c: CourseCase, observations: Observation[]) {
  const behavior = c.primaryBehavior
  const tags = [...new Set(c.rubric.knowledgeChecks.map(check => check.tag))]
  const k = tags.reduce((s, tag) => s + skillSummary(observations, tag, c.phase).weight, 0) / tags.reduce((s, tag) => s + KNOWLEDGE_WEIGHTS[tag], 0)
  if (!behavior) return k
  const b = skillSummary(observations, behavior, c.phase).weight / BEHAVIOR_WEIGHTS[behavior]
  return .4 * b + .6 * k
}
export function allocateBudget(cases: CourseCase[]) {
  requireRule(cases.length > 0, 'Cannot allocate an empty phase')
  const weights = cases.map(c => .5 + phishingScore(c))
  const total = weights.reduce((a, b) => a + b, 0)
  const exact = weights.map(w => PHASE_BUDGET * w / total)
  const allocations = exact.map(Math.floor)
  const order = exact.map((v, i) => ({ i, fraction: v - allocations[i] })).sort((a, b) => b.fraction - a.fraction || a.i - b.i)
  const remainder = PHASE_BUDGET - allocations.reduce((a, b) => a + b, 0)
  for (let i = 0; i < remainder; i++) allocations[order[i].i]++
  return allocations
}
export function createCourse(config: CourseConfig = DEFAULT_CONFIG): CourseState {
  validateConfig(config)
  return { version: SCORING_VERSION, config: structuredClone(config), phase: 'easy', status: 'active', message: null, slots: [], observations: [] }
}
export function skipCourseDifficulty(state: CourseState, id: () => string) {
  if (state.pendingEvent) throw new CourseError('Skip the pending event before advancing difficulty.')
  if (state.status === 'graduated') throw new CourseError('The course is already complete.')
  const phase = state.phase
  const objectives = state.config.phases[phase]
  const base = Math.floor(PHASE_BUDGET / objectives.length)
  const slots: Slot[] = objectives.map((objective, index) => {
    const units = base + (index === objectives.length - 1 ? PHASE_BUDGET - base * objectives.length : 0)
    return { id:id(), phase, objective, allocationUnits:units, earnedUnits:units, passed:true, assignments:[] }
  })
  state.slots = [...state.slots.filter(slot => slot.phase !== phase), ...slots]
  if (phase === 'master') { state.status = 'graduated'; state.message = 'Master was skipped by the local administrator.' }
  else if (state.config.adminEventGates && (phase === 'easy' || phase === 'hard')) {
    state.pendingEvent = phase === 'easy' ? 'event-1' : 'event-2'
    state.status = 'event-pending'
    state.message = `${state.pendingEvent.toUpperCase()} is ready.`
  } else {
    state.phase = PHASES[PHASES.indexOf(phase) + 1]
    state.status = 'active'; state.message = null
  }
}
export function skipCourseEvent(state: CourseState) {
  if (!state.pendingEvent) throw new CourseError('No event is waiting to be skipped.')
  state.phase = PHASES[PHASES.indexOf(state.phase) + 1]
  state.pendingEvent = null
  state.status = 'active'; state.message = null
}
function allAssignments(state: CourseState) { return state.slots.flatMap(s => s.assignments) }
export function currentAssignment(state: CourseState) {
  for (const slot of state.slots) for (const assignment of slot.assignments) {
    const last = assignment.submissions.at(-1)?.feedback
    if (!last?.terminal || !assignment.acknowledged) return { slot, assignment }
  }
  return null
}
function pick(candidates: CourseCase[], state: CourseState, random: () => number) {
  if (random() < .2) return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))]
  const weights = candidates.map(c => selectionPriority(c, state.observations))
  let threshold = random() * weights.reduce((a, b) => a + b, 0)
  return candidates.find((_, i) => (threshold -= weights[i]) < 0) ?? candidates[candidates.length - 1]
}
function newAssignment(c: CourseCase, rewardUnits: number, recovery: boolean, id: () => string): Assignment {
  return { id: id(), case: structuredClone(c), rewardUnits, recovery, submissions: [], acknowledged: false }
}
// The database serializes calls. A phase is planned atomically; unavailable content never creates a partial plan.
export function advanceCourse(state: CourseState, catalog: CourseCase[], id: () => string, random = Math.random) {
  if (state.status === 'graduated' || state.status === 'needs-follow-up' || state.pendingEvent || currentAssignment(state)) return
  state.status = 'active'; state.message = null
  const block = (message: string) => { state.status = 'content-blocked'; state.message = message }
  while (true) {
    const phaseSlots = state.slots.filter(s => s.phase === state.phase)
    const used = new Set(allAssignments(state).map(a => a.case.campaignId))
    if (phaseSlots.length === 0) {
      const selected: CourseCase[] = []
      for (const objective of state.config.phases[state.phase]) {
        const candidates = catalog.filter(c => c.phase === state.phase && c.objective === objective && !used.has(c.campaignId))
        if (!candidates.length) { block(`Awaiting approved ${state.phase} content for ${objective}. Your EXP is saved.`); return }
        const c = pick(candidates, state, random)
        selected.push(c); used.add(c.campaignId)
      }
      const allocation = allocateBudget(selected)
      selected.forEach((c, i) => state.slots.push({ id: id(), phase: state.phase, objective: c.objective, allocationUnits: allocation[i], earnedUnits: 0, passed: false, assignments: [newAssignment(c, allocation[i], false, id)] }))
      return
    }
    const deficient = phaseSlots.filter(s => !s.passed || s.earnedUnits < s.allocationUnits)
    if (deficient.length) {
      const usedRecovery = allAssignments(state).filter(a => a.recovery).length
      if (deficient.some(s => s.assignments.some(a => a.recovery)) || usedRecovery + deficient.length > state.config.recoveryAllowance) {
        state.status = 'needs-follow-up'; state.message = 'The recovery allowance is complete. Your training administrator can arrange follow-up; earned EXP is preserved.'; return
      }
      const replacements: CourseCase[] = []
      for (const slot of deficient) {
        const original = slot.assignments[0].case
        const candidates = catalog.filter(c => c.phase === slot.phase && c.objective === slot.objective && c.challenge === original.challenge && !used.has(c.campaignId))
        if (!candidates.length) { block(`Awaiting a fresh ${slot.phase} recovery case for ${slot.objective}. Your EXP is saved.`); return }
        const c = pick(candidates, state, random)
        replacements.push(c); used.add(c.campaignId)
      }
      deficient.forEach((s, i) => s.assignments.push(newAssignment(replacements[i], s.allocationUnits - s.earnedUnits, true, id)))
      return
    }
    if (state.phase === 'master') { state.status = 'graduated'; state.message = 'All four phases and required Master objectives passed.'; return }
    if (state.config.adminEventGates && (state.phase === 'easy' || state.phase === 'hard')) {
      state.pendingEvent = state.phase === 'easy' ? 'event-1' : 'event-2'
      state.status = 'event-pending'
      state.message = `${state.pendingEvent.toUpperCase()} checkpoint is waiting for the administrator.`
      return
    }
    state.phase = PHASES[PHASES.indexOf(state.phase) + 1]
  }
}
export function scoreAnswer(c: CourseCase, answer: Answer) {
  requireRule(['legitimate', 'phishing'].includes(answer.decision), 'Choose a valid decision')
  requireRule(Array.isArray(answer.evidenceIds) && answer.evidenceIds.length <= 20 && answer.evidenceIds.every(id => typeof id === 'string' && c.public.evidence.some(e => e.id === id)), 'Invalid evidence selection')
  requireRule(new Set(answer.evidenceIds).size === answer.evidenceIds.length, 'Duplicate evidence selection')
  const selected = new Set(answer.evidenceIds)
  const d = Number(answer.decision === c.rubric.decision)
  const e = Math.max(...c.rubric.evidenceAlternatives.map(expected => {
    const tp = expected.filter(id => selected.has(id)).length
    return 2 * tp / (expected.length + selected.size)
  }))
  // No safe-action input exists in this UI: normalize the two measurable components.
  const performance = (.5 * d + .3 * e) / .8
  const passed = d === 1 && performance + Number.EPSILON >= .8 && c.rubric.criticalEvidence.every(id => selected.has(id))
  return { performance, passed }
}
export function submitAnswer(state: CourseState, answer: Answer): Feedback {
  const active = currentAssignment(state)
  requireRule(state.status === 'active' && active && active.assignment.id === answer.assignmentId, 'This assignment is not open')
  const { slot, assignment: a } = active
  const previous = a.submissions.at(-1)
  requireRule(!previous || (a.acknowledged && !previous.feedback.terminal), 'Read the saved feedback before continuing')
  const attempt = a.submissions.length + 1
  const attemptLimit = ATTEMPTS[slot.phase]
  requireRule(attempt <= attemptLimit, 'No submissions remain')
  const { performance, passed } = scoreAnswer(a.case, answer)
  const earnedUnits = passed ? Math.floor(a.rewardUnits * ATTEMPT_PERCENT[attempt - 1] / 100) : 0
  const terminal = passed || attempt === attemptLimit
  const feedback: Feedback = {
    attempt, attemptLimit, passed, terminal, performance, earnedUnits,
    message: terminal ? a.case.rubric.explanation : a.case.rubric.hints[attempt - 1] ?? 'Reconsider the supporting evidence and the requested action.',
    ...(terminal ? { decision: a.case.rubric.decision, supportingEvidence: a.case.rubric.evidenceAlternatives[0] } : {}),
  }
  a.submissions.push({ answer: structuredClone(answer), feedback })
  a.acknowledged = false
  slot.earnedUnits += earnedUnits
  slot.passed ||= passed
  if (attempt === 1) {
    const add = (tag: Skill, q: number) => {
      if (!state.observations.some(o => o.tag === tag && o.phase === slot.phase && o.campaignId === a.case.campaignId)) state.observations.push({ tag, phase: slot.phase, campaignId: a.case.campaignId, q })
    }
    if (a.case.primaryBehavior) add(a.case.primaryBehavior, performance)
    for (const tag of new Set(a.case.rubric.knowledgeChecks.map(c => c.tag))) {
      const checks = a.case.rubric.knowledgeChecks.filter(c => c.tag === tag)
      add(tag, checks.reduce((sum, check) => sum + Number(answer.evidenceIds.includes(check.evidenceId) === check.expectedSelected), 0) / checks.length)
    }
  }
  return feedback
}
export function acknowledgeFeedback(state: CourseState, assignmentId: string, attempt: number) {
  const a = allAssignments(state).find(a => a.id === assignmentId)
  requireRule(a && a.submissions.at(-1)?.feedback.attempt === attempt, 'Feedback changed; reload the assignment')
  a.acknowledged = true
}
export function courseView(state: CourseState): CourseView {
  const current = currentAssignment(state)?.assignment
  const exp = state.slots.reduce((sum, s) => sum + s.earnedUnits, 0) / EXP_UNIT
  const keys = Object.keys({ ...BEHAVIOR_WEIGHTS, ...KNOWLEDGE_WEIGHTS }) as Skill[]
  return {
    version: state.version, status: state.status, phase: state.phase, message: state.message, pendingEvent: state.pendingEvent ?? null,
    exp, targetExp: TARGET_EXP, progress: exp / 10, targetMinutes: state.config.targetMinutes,
    phases: PHASES.map(phase => {
      const slots = state.slots.filter(s => s.phase === phase)
      return { phase, exp: slots.reduce((s, slot) => s + slot.earnedUnits, 0) / EXP_UNIT, budget: 250,
        passed: slots.filter(s => s.passed).length, planned: state.config.phases[phase].length,
        unlocked: PHASES.indexOf(phase) <= PHASES.indexOf(state.phase) }
    }),
    recoveryUsed: allAssignments(state).filter(a => a.recovery).length,
    recoveryAllowance: state.config.recoveryAllowance,
    skills: PHASES.flatMap(phase => keys.map(tag => skillSummary(state.observations, tag, phase))),
    active: current ? {
      id: current.id, objective: current.case.objective, recovery: current.recovery,
      attemptLimit: ATTEMPTS[current.case.phase], submissionsUsed: current.submissions.length,
      rewardExp: current.rewardUnits / EXP_UNIT,
      nextRewardExp: Math.floor(current.rewardUnits * (ATTEMPT_PERCENT[current.submissions.length] ?? 0) / 100) / EXP_UNIT,
      public: {
        from: current.case.public.from, to: current.case.public.to,
        subject: current.case.public.subject, body: current.case.public.body,
        context: current.case.public.context,
        evidence: current.case.public.evidence.map(e => ({ id: e.id, label: e.label, detail: e.detail })),
      },
      feedback: current.acknowledged ? null : current.submissions.at(-1)?.feedback ?? null,
    } : null,
  }
}
