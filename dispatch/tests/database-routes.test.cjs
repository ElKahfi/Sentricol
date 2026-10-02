const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')

// Exercise route logic with an isolated database double; never connect to real data.
function loadRoute(relative, query, phaseProgressionEnabled = false, generated = null) {
  const exports = {}
  const source = fs.readFileSync(path.join(__dirname, '../src', relative), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  vm.runInNewContext(code, {
    exports, console,
    require: (name) => {
      if (name === 'next/server') return { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } }
      if (name === '@/lib/player-auth') return { currentPlayer: async () => ({userId:'1',userCode:'test-user'}) }
      if (name === '@/lib/db') return { isDatabaseConfigured: () => true, withTransaction: (fn) => fn({ query }) }
      if (name === '@/lib/harnessTasks') return { generatePlayableEmail: async () => generated }
      if (name === '@/lib/trainingConfig') return {
        TRAINING_CONFIG: { phaseProgressionEnabled },
        regularTaskType: require('./load-typescript.cjs')()('lib/trainingConfig.ts').regularTaskType,
      }
      throw new Error(name)
    },
  })
  return exports
}

for (const scenario of [
  { label: 'password pass keeps legacy practice scoring', decision: 'approve', delta: 5, correct: true },
  { label: 'password failure keeps legacy practice scoring', decision: 'reject', delta: 0, correct: false },
]) {
  test(scenario.label, async () => {
    let delta
    const route = loadRoute('app/api/attempts/route.ts', async (sql, values) => {
      if (sql.includes('SELECT a.attempt_id')) return { rows: [{ attempt_id: '1', assignment_id: '1', user_id: 1,
        correct_decision: 'approve', base_experience: 30, incident_code: 'password', started_at: new Date(),
        raw_content: {} }] }
      if (sql.includes('UPDATE user_progress')) { delta = values[2]; return { rows: [{ graduation_percentage: '55' }] } }
      return { rows: [] }
    })
    const result = await route.POST({ json: async () => ({ attemptId: '1', decision: scenario.decision }) })
    assert.equal(result.status, 200)
    assert.equal(result.body.isCorrect, scenario.correct)
    assert.equal(delta, scenario.delta)
  })
}

test('legacy email attempts cannot award fixed EXP or bypass course gates', async () => {
  const writes = []
  const route = loadRoute('app/api/attempts/route.ts', async sql => {
    if (sql.includes('SELECT a.attempt_id')) return { rows: [{ attempt_id: '1', incident_code: 'email' }] }
    writes.push(sql); return { rows: [] }
  }, true)
  const result = await route.POST({ json: async () => ({ attemptId: '1', decision: 'phishing', attemptNumber: 1 }) })
  assert.equal(result.status, 409)
  assert.equal(writes.length, 0)
})

test('legacy task generation directs email requests to the course', async () => {
  const route = loadRoute('app/api/tasks/next/route.ts', async () => { throw new Error('Unexpected query') }, true)
  const result = await route.POST({ json: async () => ({ userCode: 'test-user', taskType: 'email' }) })
  assert.equal(result.status, 409)
})

test('resume locks the user and returns existing assignment without inserting', async () => {
  const statements = []
  const route = loadRoute('app/api/tasks/next/route.ts', async (sql) => {
    statements.push(sql)
    if (sql.includes('SELECT ta.user_id')) return { rows: [{ assignment_id: '12', attempt_id: '13',
      raw_content: { id: 'password-existing' }, incident_code: 'password', match_score: '50' }] }
    return { rows: [] }
  })
  const result = await route.POST({ json: async () => ({ userCode: 'test-user' }) })
  assert.equal(result.body.attemptId, '13')
  assert.match(statements[0], /FOR UPDATE/)
  assert.equal(statements.some((sql) => sql.includes('INSERT')), false)
})

test('regular generation excludes known assignments and selects the requested task type', async () => {
  const calls = []
  const route = loadRoute('app/api/tasks/next/route.ts', async (sql, values) => {
    calls.push({ sql, values })
    return { rows: [] }
  })
  const result = await route.POST({ json: async () => ({ userCode: 'test-user',
    taskType: 'data-classification', knownAssignmentIds: ['12'] }) })
  assert.equal(result.status, 404)
  const active = calls.find(call => call.sql.includes('SELECT ta.user_id'))
  assert.match(active.sql, /it.incident_code <> 'email'/)
  assert.match(active.sql, /NOT \(ta.assignment_id::text = ANY/)
  assert.deepEqual(Array.from(active.values), ['test-user', ['12'], 'data-classification', false])
  const candidate = calls.find(call => call.sql.includes('WITH player'))
  assert.match(candidate.sql, /it.incident_code <> 'email'/)
  assert.match(candidate.sql, /it.incident_code = \$2/)
  assert.match(candidate.sql, /AND \(\$3::boolean = false OR t\.difficulty <= p\.unlocked_difficulty\)/)
  assert.deepEqual(Array.from(candidate.values), ['test-user', 'data-classification', false])
})

test('regular mode allows email generation for a beginner without a difficulty gate', async () => {
  let candidateCall
  const route = loadRoute('app/api/tasks/next/route.ts', async (sql, values) => {
    if (sql.includes('WITH player')) {
      candidateCall = { sql, values }
      return { rows: [{ user_id: 2, case_id: 7, task_code: 'advanced-email', priority: 'MEDIUM',
        time_limit_seconds: 180, incident_code: 'email', raw_content: { id: 'email-7' }, match_score: '50', match_reason: {} }] }
    }
    if (sql.includes('INSERT INTO task_assignments')) return { rows: [{ assignment_id: '100' }] }
    if (sql.includes('INSERT INTO task_attempts')) return { rows: [{ attempt_id: '101' }] }
    return { rows: [] }
  })
  const result = await route.POST({ json: async () => ({ userCode: 'beginner', taskType: 'email' }) })
  assert.equal(result.status, 200)
  assert.equal(result.body.type, 'email')
  assert.equal(candidateCall.values[2], false)
  assert.match(candidateCall.sql, /\(\$3::boolean = false OR t\.difficulty <= p\.unlocked_difficulty\)/)
})

test('validated AI email is returned without selecting another catalog case', async () => {
  const generated = { id: 'new-email', type: 'email', source: 'database' }
  const route = loadRoute('app/api/tasks/next/route.ts', async () => { throw new Error('Catalog should not be queried') }, false, generated)
  const result = await route.POST({ json: async () => ({ taskType: 'email' }) })
  assert.equal(result.status, 200)
  assert.equal(result.body.id, 'new-email')
})

test('invalid generation options are rejected before querying the database', async () => {
  const route = loadRoute('app/api/tasks/next/route.ts', async () => { throw new Error('Unexpected query') })
  const result = await route.POST({ json: async () => ({ userCode: 'test-user', taskType: 'invalid' }) })
  assert.equal(result.status, 400)
})
