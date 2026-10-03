const test = require('node:test')
const assert = require('node:assert/strict')
const createLoader = require('./load-typescript.cjs')
const { TRAINING_CONFIG, regularTaskType } = createLoader()('lib/trainingConfig.ts')

test('regular practice is enabled and generation is exactly 70/20/10 per cycle', () => {
  assert.equal(TRAINING_CONFIG.phaseProgressionEnabled, false)
  const counts = { email: 0, 'data-classification': 0, password: 0 }
  for (let i = 0; i < 100; i++) counts[regularTaskType(i)]++
  assert.deepEqual(counts, { email: 70, 'data-classification': 20, password: 10 })
  assert.equal(regularTaskType(2), 'data-classification')
})

for (const attempt of [1, 2, 3, 4]) test(`regular email scoring accepts submission ${attempt} without a phase gate`, async () => {
  let delta
  const load = createLoader({
    '@/lib/player-auth': { currentPlayer: async () => ({userId:'1',userCode:'test-user'}) },
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/db': { isDatabaseConfigured: () => true, withTransaction: work => work({ query: async (sql, values) => {
      if (sql.includes('SELECT a.attempt_id')) return { rows: [{ attempt_id: '1', assignment_id: '1', user_id: 1,
        correct_decision: 'phishing', base_experience: 30, incident_code: 'email', started_at: new Date(),
        raw_content: { requiredInvestigationCategories: ['link'] } }] }
      if (sql.includes('UPDATE user_progress')) { delta = values[2]; return { rows: [{ graduation_percentage: '50' }] } }
      return { rows: [] }
    } }) },
  })
  const response = await load('app/api/attempts/route.ts').POST({ json: async () => ({
    attemptId: '1', decision: 'phishing', attemptNumber: attempt, investigatedCategories: ['link'],
  }) })
  assert.equal(response.status, 200)
  assert.equal(response.body.isCorrect, true)
  assert.equal(delta, attempt === 1 ? 5 : attempt === 2 ? 2 : 0)
})

test('the retained course API does not advance enrollments while disabled', async () => {
  const load = createLoader({
    '@/lib/player-auth': { currentPlayer: async () => ({userId:'1',userCode:'test-user'}), localAdminPlayer: async () => null },
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
    '@/lib/db': { isDatabaseConfigured: () => { throw new Error('Should not access the database') } },
    '@/lib/emailCourseStore': { executeCourseCommand: () => { throw new Error('Should not advance a course') } },
  })
  const response = await load('app/api/email-course/route.ts').POST({ json: async () => ({ action: 'resume' }) })
  assert.equal(response.status, 409)
})
