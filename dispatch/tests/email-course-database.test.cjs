const test = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { Pool } = require('pg')
const createLoader = require('./load-typescript.cjs')

// Explicit opt-in only. Tests create and remove their own isolated schema; they
// never enroll, answer questions for, or alter a real learner.
test('PostgreSQL course transactions: resume, concurrency, replay, rollback, ownership and graduation', {
  skip: process.env.RUN_EMAIL_COURSE_DATABASE_TESTS !== '1',
}, async () => {
  const schema = `sentri_email_test_${Date.now()}_${randomUUID().replaceAll('-', '')}`
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5,
    connectionTimeoutMillis: 10000,
    ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false } })
  const setup = await pool.connect()
  const previousUserCode = process.env.DEMO_USER_CODE
  process.env.DEMO_USER_CODE = 'course-test-learner'
  let rejectReward = false
  let schemaCreated = false
  try {
    await setup.query(`CREATE SCHEMA "${schema}"`); schemaCreated = true
    // Neon/PgBouncer may change backend connections after each transaction.
    // Scope every inspection transaction explicitly instead of relying on SET
    // session state surviving on a transaction-pooled connection.
    const rawQuery = setup.query.bind(setup)
    setup.query = async (sql, values) => {
      await rawQuery('BEGIN')
      try {
        await rawQuery(`SET LOCAL search_path TO "${schema}"`)
        const result = await rawQuery(sql, values)
        await rawQuery('COMMIT')
        return result
      } catch (e) { await rawQuery('ROLLBACK'); throw e }
    }
    await setup.query(`
      CREATE TABLE companies(company_id INT PRIMARY KEY, company_name TEXT);
      CREATE TABLE departments(department_id INT PRIMARY KEY, company_id INT, department_code TEXT, department_name TEXT);
      CREATE TABLE ranks(rank_id INT PRIMARY KEY, rank_code TEXT, rank_name TEXT);
      CREATE TABLE employees(employee_id INT PRIMARY KEY, department_id INT, rank_id INT, full_name TEXT);
      CREATE TABLE users(user_id INT PRIMARY KEY, user_code TEXT, employee_id INT);
      INSERT INTO companies VALUES(1,'Test company'),(2,'Other company');
      INSERT INTO departments VALUES(1,1,'HR','Human resources'),(2,2,'IT','IT');
      INSERT INTO ranks VALUES(1,'STAFF','Staff');
      INSERT INTO employees VALUES(1,1,1,'Test learner'),(2,2,1,'Other learner');
      INSERT INTO users VALUES(1,'course-test-learner',1),(2,'other-learner',2);
    `)
    await setup.query(fs.readFileSync(path.join(__dirname, '../database/migrations/002_email_course.sql'), 'utf8'))
    const load = createLoader({ '@/lib/db': {
      withTransaction: async work => {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          await client.query(`SET LOCAL search_path TO "${schema}"`)
          const result = await work({ query: (sql, values) => {
            if (rejectReward && sql.includes('INSERT INTO email_course_rewards')) throw new Error('Simulated ledger failure')
            return client.query(sql, values)
          } })
          await client.query('COMMIT')
          return result
        } catch (e) { await client.query('ROLLBACK'); throw e }
        finally { client.release() }
      },
    } })
    const { STARTER_CATALOG: catalog } = load('database/email-course-catalog.ts')
    const rules = load('lib/emailCourse.ts')
    const { executeCourseCommand } = load('lib/emailCourseStore.ts')
    const command = input => executeCourseCommand(input, 'course-test-learner')
    for (const c of catalog) await setup.query("INSERT INTO email_course_cases(case_key, company_id, requested_for_user_id, source, review_status, scoring_version, content) VALUES($1,1,1,'ai',$2,$3,$4)", [c.id, 'approved', rules.SCORING_VERSION, c])
    // A mismatched-company case must not be selected even when approved.
    const otherCase = structuredClone(catalog[0]); otherCase.id = 'foreign'; otherCase.campaignId = 'foreign'
    await setup.query("INSERT INTO email_course_cases(case_key, company_id, requested_for_user_id, source, review_status, scoring_version, content) VALUES($1,2,1,'ai',$2,$3,$4)", ['foreign', 'approved', rules.SCORING_VERSION, otherCase])

    const [first, second] = await Promise.all([command({ action: 'resume', userCode: 'other-learner' }), command({ action: 'resume' })])
    assert.equal(first.course.active.id, second.course.active.id)
    assert.equal((await setup.query('SELECT count(*)::int AS n FROM email_course_enrollments')).rows[0].n, 1)
    assert.equal((await setup.query('SELECT user_id FROM email_course_enrollments')).rows[0].user_id, 1)
    const state = async () => (await setup.query('SELECT state FROM email_course_enrollments')).rows[0].state
    assert.equal((await state()).slots.some(s => s.assignments.some(a => a.case.id === 'foreign')), false)
    const answer = async () => {
      const a = rules.currentAssignment(await state()).assignment
      return { assignmentId: a.id, decision: a.case.rubric.decision, evidenceIds: a.case.rubric.evidenceAlternatives[0] }
    }
    const initialAnswer = await answer()
    const firstRequest = { action: 'submit', requestId: randomUUID(), answer: initialAnswer }
    rejectReward = true
    await assert.rejects(command(firstRequest), /ledger failure/)
    rejectReward = false
    assert.equal((await setup.query('SELECT count(*)::int AS n FROM email_course_submissions')).rows[0].n, 0)
    assert.equal(rules.courseView(await state()).active.submissionsUsed, 0)

    const duplicateResults = await Promise.all([command(firstRequest), command(firstRequest)])
    assert.equal(duplicateResults[0].course.exp, duplicateResults[1].course.exp)
    assert.equal((await setup.query('SELECT count(*)::int AS n FROM email_course_rewards')).rows[0].n, 1)
    assert.equal((await setup.query('SELECT count(*)::int AS n FROM email_course_submissions')).rows[0].n, 1)
    await assert.rejects(command({ ...firstRequest, answer: { ...initialAnswer, evidenceIds: [] } }), /different answer/)
    let view = (await command({ action: 'resume' })).course
    assert.equal(view.active.feedback.passed, true)
    view = (await command({ action: 'acknowledge', assignmentId: view.active.id, attempt: 1 })).course
    const simultaneous = await answer()
    const raced = await Promise.allSettled([
      command({ action: 'submit', requestId: randomUUID(), answer: simultaneous }),
      command({ action: 'submit', requestId: randomUUID(), answer: simultaneous }),
    ])
    assert.equal(raced.filter(r => r.status === 'fulfilled').length, 1)
    assert.equal(raced.filter(r => r.status === 'rejected').length, 1)
    view = (await command({ action: 'resume' })).course
    assert.equal(view.active.submissionsUsed, 1)

    // An incorrect first submission is saved and survives resume; its later pass
    // requires a fresh recovery slot before Normal can unlock Hard.
    view = (await command({ action: 'acknowledge', assignmentId: view.active.id, attempt: 1 })).course
    const normalAnswer = await answer()
    view = (await command({ action: 'submit', requestId: randomUUID(), answer: {
      ...normalAnswer, decision: normalAnswer.decision === 'phishing' ? 'legitimate' : 'phishing', evidenceIds: [],
    } })).course
    const resumed = (await command({ action: 'resume' })).course
    assert.equal(resumed.active.feedback.attempt, 1)
    assert.equal(resumed.active.submissionsUsed, 1)
    assert.equal(resumed.active.feedback.decision, undefined)
    view = (await command({ action: 'acknowledge', assignmentId: resumed.active.id, attempt: 1 })).course

    let completed = 0
    while (view.status === 'active') {
      if (view.active.feedback) {
        view = (await command({ action: 'acknowledge', assignmentId: view.active.id, attempt: view.active.feedback.attempt })).course
      } else {
        view = (await command({ action: 'submit', requestId: randomUUID(), answer: await answer() })).course
      }
      assert.ok(++completed < 40)
    }
    assert.equal(view.status, 'graduated')
    assert.equal(view.exp, 1000)
    assert.equal(view.recoveryUsed, 1)
    assert.equal(Number((await setup.query('SELECT sum(earned_units) AS units FROM email_course_rewards')).rows[0].units), 1000 * rules.EXP_UNIT)
    const afterReplay = await command(firstRequest)
    assert.equal(afterReplay.course.exp, 1000)
  } finally {
    if (previousUserCode === undefined) delete process.env.DEMO_USER_CODE
    else process.env.DEMO_USER_CODE = previousUserCode
    if (schemaCreated) await setup.query(`DROP SCHEMA "${schema}" CASCADE`)
    setup.release(); await pool.end()
  }
})
