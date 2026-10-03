const fs = require('node:fs')
const path = require('node:path')
const { parseEnv } = require('node:util')
const { Pool } = require('pg')
const local = path.join(__dirname, '../.env.local')
const env = fs.existsSync(local) ? parseEnv(fs.readFileSync(local, 'utf8')) : {}
const connectionString = process.env.DATABASE_URL || env.DATABASE_URL
async function main() {
  if (!connectionString) throw new Error('DATABASE_URL is required')
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 10000, max: 1 })
  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query("SET LOCAL lock_timeout = '5s'")
      await client.query(fs.readFileSync(path.join(__dirname, '../database/migrations/004_skill_confidence.sql'), 'utf8'))
      await client.query('COMMIT')
      console.log('Skill confidence column ready. Existing training progress preserved.')
    } catch (error) { await client.query('ROLLBACK'); throw error }
    finally { client.release() }
  } finally { await pool.end() }
}
main().catch(error => { console.error('Skill schema repair failed:', error.code || 'Check database configuration'); process.exitCode = 1 })
