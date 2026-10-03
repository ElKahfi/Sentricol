const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { Pool } = require('pg')

test('legacy skill profile migration preserves scores and permits confidence writes', {
  skip: process.env.RUN_SKILL_DATABASE_TESTS !== '1',
}, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Only temporary tables: never alter the real user_skill_profiles table.
    await client.query('CREATE TEMP TABLE user_skill_profiles (user_id INT, tag_id INT, ability_score NUMERIC(5,2), PRIMARY KEY (user_id, tag_id)) ON COMMIT DROP')
    await client.query('INSERT INTO pg_temp.user_skill_profiles VALUES (1, 2, 73)')
    const migration = fs.readFileSync(path.join(__dirname, '../database/migrations/004_skill_confidence.sql'), 'utf8')
    await client.query(migration)
    await client.query(migration)
    const before = await client.query('SELECT * FROM pg_temp.user_skill_profiles')
    assert.equal(Number(before.rows[0].ability_score), 73)
    assert.equal(Number(before.rows[0].confidence_score), 0)
    await client.query('INSERT INTO pg_temp.user_skill_profiles VALUES (1, 2, 75, 20) ON CONFLICT (user_id, tag_id) DO UPDATE SET confidence_score = EXCLUDED.confidence_score')
    assert.equal(Number((await client.query('SELECT confidence_score FROM pg_temp.user_skill_profiles')).rows[0].confidence_score), 20)
    await client.query('SAVEPOINT invalid_score')
    await assert.rejects(client.query('UPDATE pg_temp.user_skill_profiles SET confidence_score = 101'), { code: '23514' })
    await client.query('ROLLBACK TO SAVEPOINT invalid_score')
  } finally {
    await client.query('ROLLBACK')
    client.release()
    await pool.end()
  }
})
