const test = require('node:test')
const assert = require('node:assert/strict')
const { Pool } = require('pg')
const load = require('./load-typescript.cjs')

test('every answer-saving query plans against the configured schema without executing writes', {
  skip: process.env.RUN_SKILL_DATABASE_TESTS !== '1',
}, async () => {
  const statements = []
  const route = load({
    '@/lib/player-auth': { currentPlayer: async () => ({ userId: 1 }) },
    '@/lib/trainingConfig': { TRAINING_CONFIG: { phaseProgressionEnabled: false } },
    '@/lib/db': { isDatabaseConfigured: () => true, withTransaction: work => work({ query: async (sql, values) => {
      statements.push({ sql, values })
      if (sql.includes('SELECT a.attempt_id')) return { rows: [{ attempt_id: '1', assignment_id: '1', user_id: 1, correct_decision: 'restricted', base_experience: 30, incident_code: 'data-classification', started_at: new Date(), raw_content: {} }] }
      return { rows: [] }
    } }) },
  })('app/api/attempts/route.ts')
  const response = await route.POST({ json: async () => ({ attemptId: '1', decision: 'restricted', investigatedCategories: ['sender'], verified: true }) })
  assert.equal(response.status, 200)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN READ ONLY')
    for (const { sql, values } of statements) await client.query(`EXPLAIN ${sql}`, values)
    // EXPLAIN without ANALYZE does not execute any statement or read account rows.
    assert.ok(statements.some(({ sql }) => sql.includes('confidence_score')))
  } finally { await client.query('ROLLBACK'); client.release(); await pool.end() }
})
