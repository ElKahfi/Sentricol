const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-typescript.cjs')()
const rules = load('lib/emailCourse.ts')
const { STARTER_CATALOG: catalog } = load('database/email-course-catalog.ts')
const { advanceCourse, createCourse, currentAssignment, acknowledgeFeedback, submitAnswer, courseView,
  PHASES, ATTEMPTS, PHASE_BUDGET, EXP_UNIT, skillSummary, allocateBudget, phishingScore, selectionPriority } = rules
let sequence = 0
const id = () => `assignment-${++sequence}`
const plan = state => advanceCourse(state, catalog, id, () => .1)
const correct = a => ({ assignmentId: a.id, decision: a.case.rubric.decision, evidenceIds: a.case.rubric.evidenceAlternatives[0] })
const wrong = a => ({ assignmentId: a.id, decision: a.case.rubric.decision === 'phishing' ? 'legitimate' : 'phishing', evidenceIds: [] })
const ack = state => {
  const a = currentAssignment(state).assignment
  acknowledgeFeedback(state, a.id, a.submissions.at(-1).feedback.attempt)
  plan(state)
}

test('all authored cases have complete static metadata and measurable rubrics', () => {
  assert.equal(catalog.length, 16)
  for (const c of catalog) rules.validateCase(c)
  const incomplete = structuredClone(catalog[0]); delete incomplete.behavior.fear
  assert.throws(() => rules.validateCase(incomplete), /explicit/)
  const invalid = structuredClone(catalog[0]); invalid.indicators.linkDestination = .3
  assert.throws(() => rules.validateCase(invalid), /intensity/)
})

test('PS preserves static 60/70 denominators; absence is zero, not ignored', () => {
  const c = structuredClone(catalog[0])
  for (const k in c.behavior) c.behavior[k] = 0
  for (const k in c.indicators) c.indicators[k] = 0
  assert.equal(phishingScore(c), 0)
  c.behavior.authority = 1
  assert.ok(Math.abs(phishingScore(c) - .4 * 10 / 60) < 1e-10)
  for (const k in c.behavior) c.behavior[k] = 1
  for (const k in c.indicators) c.indicators[k] = 1
  assert.equal(phishingScore(c), 1)
})

test('a full first-pass course earns exactly 1000 EXP and passes every Master objective', () => {
  const state = createCourse(); plan(state)
  const snapshots = []
  let submissions = 0
  while (state.status === 'active') {
    const { assignment: a } = currentAssignment(state)
    snapshots.push(state.phase)
    const feedback = submitAnswer(state, correct(a))
    assert.equal(feedback.passed, true)
    assert.equal(feedback.earnedUnits, a.rewardUnits)
    assert.throws(() => submitAnswer(state, correct(a)), /feedback/)
    ack(state)
    assert.ok(++submissions < 20)
  }
  assert.deepEqual(snapshots, ['easy', 'easy', 'normal', 'normal', 'hard', 'hard', 'master', 'master'])
  assert.equal(state.status, 'graduated')
  assert.equal(courseView(state).exp, 1000)
  assert.equal(courseView(state).progress, 100)
  assert.equal(state.slots.every(s => s.passed && s.earnedUnits === s.allocationUnits), true)
})

test('company course settings are snapshotted; selection freezes all phase allocations', () => {
  const config = structuredClone(rules.DEFAULT_CONFIG)
  const state = createCourse(config); plan(state)
  config.phases.easy.push('mfaSafety')
  assert.equal(state.config.phases.easy.length, 2)
  const snapshot = JSON.stringify(state.slots)
  plan(state)
  assert.equal(JSON.stringify(state.slots), snapshot)
  assert.equal(state.slots.reduce((sum, s) => sum + s.allocationUnits, 0), PHASE_BUDGET)
})

for (const phase of PHASES) test(`${phase} enforces its server-side attempt cap and terminal feedback gate`, () => {
  const state = createCourse(); state.phase = phase; plan(state)
  const a = currentAssignment(state).assignment
  for (let attempt = 1; attempt <= ATTEMPTS[phase]; attempt++) {
    const result = submitAnswer(state, { ...wrong(a), attemptNumber: 1 })
    assert.equal(result.attempt, attempt)
    assert.equal(result.terminal, attempt === ATTEMPTS[phase])
    assert.equal(result.earnedUnits, 0)
    assert.equal(Boolean(result.decision), result.terminal)
    if (!result.terminal) acknowledgeFeedback(state, a.id, attempt)
  }
  assert.throws(() => submitAnswer(state, correct(a)))
})

for (const [attempt, percent] of [[1, 100], [2, 70], [3, 40]]) test(`a pass on submission ${attempt} pays only ${percent}%`, () => {
  const state = createCourse(); plan(state)
  const { slot, assignment: a } = currentAssignment(state)
  for (let i = 1; i < attempt; i++) { submitAnswer(state, wrong(a)); acknowledgeFeedback(state, a.id, i) }
  const result = submitAnswer(state, correct(a))
  assert.equal(result.earnedUnits, Math.floor(slot.allocationUnits * percent / 100))
  assert.equal(state.observations.length, a.case.rubric.knowledgeChecks.reduce((s, c) => s.add(c.tag), new Set()).size + (a.case.primaryBehavior ? 1 : 0))
  if (attempt > 1 && a.case.primaryBehavior) assert.equal(state.observations.find(o => o.tag === a.case.primaryBehavior).q, 0)
})

test('fresh first-pass recovery restores only the deficit; no replay can earn twice', () => {
  const state = createCourse(); plan(state)
  const { slot, assignment: initial } = currentAssignment(state)
  submitAnswer(state, wrong(initial)); acknowledgeFeedback(state, initial.id, 1)
  submitAnswer(state, correct(initial)); ack(state)
  const next = currentAssignment(state).assignment
  submitAnswer(state, correct(next)); ack(state)
  const recovery = currentAssignment(state).assignment
  assert.equal(recovery.recovery, true)
  assert.notEqual(recovery.case.campaignId, initial.case.campaignId)
  assert.equal(recovery.case.challenge, initial.case.challenge)
  assert.equal(recovery.rewardUnits, slot.allocationUnits - slot.earnedUnits)
  submitAnswer(state, correct(recovery)); ack(state)
  assert.equal(state.phase, 'normal')
  assert.equal(slot.earnedUnits, slot.allocationUnits)
  assert.throws(() => submitAnswer(state, correct(initial)), /not open/)
})

test('discounted recovery cannot loop indefinitely or silently graduate', () => {
  const state = createCourse(); plan(state)
  let a = currentAssignment(state).assignment
  submitAnswer(state, wrong(a)); acknowledgeFeedback(state, a.id, 1); submitAnswer(state, correct(a)); ack(state)
  a = currentAssignment(state).assignment; submitAnswer(state, correct(a)); ack(state)
  a = currentAssignment(state).assignment
  submitAnswer(state, wrong(a)); acknowledgeFeedback(state, a.id, 1); submitAnswer(state, correct(a)); ack(state)
  assert.equal(state.status, 'needs-follow-up')
  assert.equal(state.phase, 'easy')
  assert.ok(courseView(state).exp < 250)
  const snapshot = JSON.stringify(state); plan(state); assert.equal(JSON.stringify(state), snapshot)
})

test('company recovery allowance is a bound, not an endless task generator', () => {
  const state = createCourse({ ...rules.DEFAULT_CONFIG, recoveryAllowance: 0 }); plan(state)
  let a = currentAssignment(state).assignment
  submitAnswer(state, wrong(a)); acknowledgeFeedback(state, a.id, 1); submitAnswer(state, correct(a)); ack(state)
  a = currentAssignment(state).assignment; submitAnswer(state, correct(a)); ack(state)
  assert.equal(state.status, 'needs-follow-up')
  assert.equal(courseView(state).recoveryUsed, 0)
})

test('missing approved coverage blocks planning atomically and resumes when content arrives', () => {
  const state = createCourse()
  advanceCourse(state, catalog.filter(c => c.objective !== 'linkDestination'), id)
  assert.equal(state.status, 'content-blocked')
  assert.equal(state.slots.length, 0)
  plan(state)
  assert.equal(state.status, 'active')
  assert.equal(state.slots.length, 2)
})

test('missing fresh recovery content is distinct from learner failure', () => {
  const state = createCourse(); plan(state)
  const original = currentAssignment(state).assignment
  submitAnswer(state, wrong(original)); acknowledgeFeedback(state, original.id, 1); submitAnswer(state, correct(original)); ack(state)
  const a = currentAssignment(state).assignment; submitAnswer(state, correct(a))
  acknowledgeFeedback(state, a.id, 1)
  advanceCourse(state, [original.case, a.case], id)
  assert.equal(state.status, 'content-blocked')
  assert.equal(courseView(state).recoveryUsed, 0)
  plan(state)
  assert.equal(currentAssignment(state).assignment.recovery, true)
})

test('evidence F1 supports legitimate evidence, alternative answers and critical gates', () => {
  const c = structuredClone(catalog.find(c => c.rubric.decision === 'legitimate'))
  const answer = { assignmentId: 'x', decision: 'legitimate', evidenceIds: ['record-1', 'record-2'] }
  assert.equal(rules.scoreAnswer(c, answer).passed, true)
  assert.equal(rules.scoreAnswer(c, { ...answer, evidenceIds: [] }).passed, false)
  assert.equal(rules.scoreAnswer(c, { ...answer, evidenceIds: ['record-2'] }).passed, false)
  assert.ok(Math.abs(rules.scoreAnswer(c, { ...answer, evidenceIds: ['record-1', 'record-2', 'format'] }).performance - .925) < 1e-12)
  c.rubric.evidenceAlternatives.push(['record-1'])
  assert.equal(rules.scoreAnswer(c, { ...answer, evidenceIds: ['record-1'] }).performance, 1)
  assert.throws(() => rules.scoreAnswer(c, { ...answer, evidenceIds: ['not-real'] }))
  assert.throws(() => rules.scoreAnswer(c, { ...answer, evidenceIds: ['record-1', 'record-1'] }))
})

test('personal weights shrink with confidence, use distinct latest ten, and stay phase-specific', () => {
  const observations = Array.from({ length: 12 }, (_, i) => ({ phase: 'easy', tag: 'authority', campaignId: `c-${i}`, q: 0 }))
  const struggling = skillSummary(observations, 'authority', 'easy')
  assert.equal(struggling.samples, 10)
  assert.ok(Math.abs(struggling.weight - 10 * 4 / 3) < 1e-12)
  assert.equal(struggling.bucket, 'Foundation')
  const strong = skillSummary(observations.map(o => ({ ...o, q: 1 })), 'authority', 'easy')
  assert.ok(Math.abs(strong.weight - 10 * 2 / 3) < 1e-12)
  assert.equal(strong.bucket, 'Strong')
  assert.equal(skillSummary(observations, 'authority', 'hard').ability, null)
  assert.equal(skillSummary(observations, 'authority', 'hard').weight, 10)
  assert.equal(skillSummary(observations.slice(0, 2), 'authority', 'easy').bucket, 'Unknown')
  assert.equal(skillSummary([observations[0], observations[0]], 'authority', 'easy').samples, 1)
})

test('personalization changes selection priority but never static PS or frozen rewards', () => {
  const c = catalog[0]
  const basePS = phishingScore(c)
  const allocation = allocateBudget(catalog.slice(0, 4))
  const observations = Array.from({ length: 10 }, (_, i) => ({ phase: c.phase, tag: c.primaryBehavior, campaignId: `obs-${i}`, q: 0 }))
  assert.ok(selectionPriority(c, observations) > selectionPriority(c, []))
  assert.equal(phishingScore(c), basePS)
  assert.deepEqual(allocateBudget(catalog.slice(0, 4)), allocation)
  for (let n = 1; n <= 16; n++) assert.equal(allocateBudget(catalog.slice(0, n)).reduce((a, b) => a + b), PHASE_BUDGET)
})

test('public view strips answer keys, PS, private snapshots and pre-submission hints', () => {
  const state = createCourse(); plan(state)
  const a = currentAssignment(state).assignment
  a.case.public.privateRubric = a.case.rubric
  a.case.public.evidence[0].correct = true
  const publicString = JSON.stringify(courseView(state))
  for (const key of ['privateRubric', 'evidenceAlternatives', 'criticalEvidence', 'primaryBehavior', 'indicators', 'hints', 'explanation']) assert.equal(publicString.includes(`"${key}"`), false)
  assert.equal(publicString.includes('"correct":true'), false)
  submitAnswer(state, wrong(a))
  assert.equal(courseView(state).active.feedback.decision, undefined)
})
