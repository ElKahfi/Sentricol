// --check performs read-only inspection. --apply adds the new tables and authored
// starter cases for the configured demo company; it never rewrites legacy scores.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { Pool } = require('pg')
const root = path.resolve(__dirname, '..')
const cache = new Map()
function load(relative) {
  const file = path.resolve(root, relative)
  if (cache.has(file)) return cache.get(file)
  const exports = {}
  cache.set(file, exports)
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText
  vm.runInNewContext(code, { exports, structuredClone, require: name => {
    const target = path.resolve(path.dirname(file), name)
    return name.endsWith('.json') ? JSON.parse(fs.readFileSync(target, 'utf8')) : load(path.relative(root, target + '.ts'))
  } }, { filename: file })
  return exports
}
const { STARTER_CATALOG } = load('database/email-course-catalog.ts')
const { DEFAULT_CONFIG, SCORING_VERSION, validateCase } = load('src/lib/emailCourse.ts')
for (const c of STARTER_CATALOG) validateCase(c)
async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const apply = process.argv.includes('--apply')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000,
    ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } })
  const client = await pool.connect()
  try {
    const userCode = process.env.DEMO_USER_CODE ?? process.env.NEXT_PUBLIC_DEMO_USER_CODE ?? 'usr_0001'
    const player = (await client.query('SELECT d.company_id FROM users u JOIN employees e USING(employee_id) JOIN departments d USING(department_id) WHERE u.user_code=$1', [userCode])).rows[0]
    if (!player) throw new Error('Configured learner was not found')
    if (apply) {
      await client.query('BEGIN')
      await client.query(fs.readFileSync(path.join(root, 'database/migrations/002_email_course.sql'), 'utf8'))
      await client.query('INSERT INTO email_course_configs(company_id, configuration) VALUES($1,$2) ON CONFLICT DO NOTHING', [player.company_id, DEFAULT_CONFIG])
      for (const c of STARTER_CATALOG) await client.query(
        `INSERT INTO email_course_cases(case_key, company_id, review_status, scoring_version, content)
         VALUES ($1,$2,'approved',$3,$4) ON CONFLICT DO NOTHING`,
        [`${player.company_id}:${c.id}`, player.company_id, SCORING_VERSION, c],
      )
      await client.query('COMMIT')
      console.log('Email-course migration applied. Starter catalog installed for the configured learner’s company. Legacy history preserved.')
    }
    const installed = (await client.query("SELECT to_regclass('email_course_enrollments') AS installed")).rows[0].installed
    console.log(JSON.stringify({ installed: Boolean(installed), starterCasesValidated: STARTER_CATALOG.length,
      phases: Object.fromEntries(['easy', 'normal', 'hard', 'master'].map(p => [p, STARTER_CATALOG.filter(c => c.phase === p).length])),
      note: 'Duration is an estimate. Review starter content and company coverage before production training.' }))
  } catch (e) { await client.query('ROLLBACK'); throw e }
  finally { client.release(); await pool.end() }
}
main().catch(e => { console.error(e.code ?? e.message); process.exitCode = 1 })
