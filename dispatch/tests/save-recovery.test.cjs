const test = require('node:test')
const assert = require('node:assert/strict')
const createLoader = require('./load-typescript.cjs')
const reply = { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } }

test('lost attempt response can be replayed without awarding progress twice', async () => {
  const writes = []
  const route = createLoader({
    'next/server': reply,
    '@/lib/player-auth': { currentPlayer: async () => ({ userId: '7' }) },
    '@/lib/db': { isDatabaseConfigured: () => true, withTransaction: fn => fn({ query: async (sql, values) => {
      if (sql.includes('SELECT a.attempt_id')) {
        assert.equal(values[1], '7')
        assert.doesNotMatch(sql, /completed_at IS NULL/)
        return { rows: [{ attempt_id: '42', completed_at: new Date(), score: '100', experience_gained: 30 }] }
      }
      if (sql.includes('SELECT r.is_correct')) return { rows: [{ is_correct: true, graduation_percentage: '25' }] }
      writes.push(sql); return { rows: [] }
    } }) },
  })('app/api/attempts/route.ts')
  const response = await route.POST({ json: async () => ({ attemptId: '42', decision: 'phishing' }) })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { isCorrect: true, score: 100, experienceGained: 30, graduationPercentage: 25 })
  assert.equal(writes.length, 0)
})

test('a committed course save returns before AI generation and survives an AI failure', async () => {
  const jobs = []
  let generated = 0, saved = 0
  const route = createLoader({
    'next/server': { ...reply, after: fn => jobs.push(fn) },
    '@/lib/player-auth': { currentPlayer: async () => ({ userId: '7', userCode: 'test' }), localAdminPlayer: async () => ({}) },
    '@/lib/db': { isDatabaseConfigured: () => true, getDatabase: () => ({ query: async () => ({ rows: [{ state: {} }] }) }) },
    '@/lib/emailCourseStore': { validateCommand: () => {}, executeCourseCommand: async () => { saved++; return { course: { status: 'content-blocked', exp: 250 } } } },
    '@/lib/coursePool': { requiredCourseCase: async () => ({ need: { phase: 'easy' } }),
      generateLocked: async () => { generated++; throw new Error('Model offline') }, preGenerateOne: async () => {} },
  })('app/api/email-course/route.ts')
  const response = await route.POST({ json: async () => ({ action: 'resume' }) })
  assert.equal(response.status, 200)
  assert.equal(response.body.course.exp, 250)
  assert.equal(saved, 1)
  assert.equal(generated, 0)
  assert.equal(response.body.generation.status, 'busy')
  await jobs[0]()
  const retry = await route.POST({ json: async () => ({ action: 'resume' }) })
  assert.equal(retry.status, 200)
  assert.equal(retry.body.course.exp, 250)
  assert.equal(retry.body.generation.status, 'unavailable')
  assert.equal(generated, 1)
})

test('account lookup failure returns a controlled API response', async () => {
  const route = createLoader({
    'next/server': reply,
    '@/lib/player-auth': { currentPlayer: async () => { throw new Error('Connection closed') } },
  })('app/api/email-course/route.ts')
  const result = await route.POST({ json: async () => ({ action: 'resume' }) })
  assert.equal(result.status, 503)
})

test('proxy HTML errors preserve failure status and expired sessions are readable', async () => {
  const { readApiResponse } = createLoader()('lib/apiResponse.ts')
  await assert.rejects(readApiResponse(new Response('<html>Gateway timeout</html>', { status: 504 })), e => e.status === 504 && /retry/i.test(e.message))
  await assert.rejects(readApiResponse(Response.json({ error: 'Please sign in.' }, { status: 401 })), e => e.status === 401 && /session expired/i.test(e.message))
})
