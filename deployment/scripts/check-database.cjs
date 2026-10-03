// Reads connection configuration privately. Does not print credentials or query user records.
const fs = require('node:fs')
const { parseEnv } = require('node:util')
const { Pool } = require('pg')
const path = require('node:path')
const envFile = path.resolve(__dirname, '../.env.local')
const local = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {}
const pool = new Pool({ connectionString: process.env.DATABASE_URL || local.DATABASE_URL, connectionTimeoutMillis: 10000, max: 1 })

async function main() {
  if (!process.env.DATABASE_URL && !local.DATABASE_URL) throw new Error('DATABASE_URL is not configured')
  const client = await pool.connect()
  try {
    await client.query('BEGIN READ ONLY')
    for (const [table, columns] of Object.entries({
      companies: 'company_id, company_code, company_name, industry',
      departments: 'department_id, company_id, department_code, department_name',
      ranks: 'rank_id, rank_code, rank_name, seniority_level',
      employees: 'employee_id, employee_code, department_id, rank_id, full_name, position_title, work_email, is_active, personnel_number',
      users: 'user_id, user_code, employee_id, username, email, password_hash, role, last_login_at, auth_version',
    })) {
      await client.query(`SELECT ${columns} FROM ${table} LIMIT 0`)
      const result = await client.query("SELECT has_table_privilege(current_user, $1, 'SELECT') AND has_table_privilege(current_user, $1, 'INSERT') AND ($1 <> 'users' OR has_table_privilege(current_user, $1, 'UPDATE')) AS allowed", [table])
      if (!result.rows[0].allowed) throw Object.assign(new Error('Insufficient database privileges'), { code: 'INSUFFICIENT_PRIVILEGES' })
      console.log(`${table}: required columns and table privileges found`)
    }
    console.log('Existing SENTRI database connection verified. No records changed.')
  } finally { await client.query('ROLLBACK'); client.release() }
}
main().catch(error => { console.error('Database check failed:', error.code || (error.message === 'DATABASE_URL is not configured' ? error.message : 'Connection or schema check failed')); process.exitCode = 1 }).finally(() => pool.end())
