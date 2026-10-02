import pg from 'pg'

const [action, id] = process.argv.slice(2)
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.')
  process.exit(1)
}
if (!['list', 'show', 'approve', 'reject'].includes(action) ||
    (action !== 'list' && !/^[1-9][0-9]*$/.test(id ?? ''))) {
  console.error('Usage: node --env-file=.env.local scripts/review-ai-case.mjs list|show|approve|reject [case_id]')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
})
try {
  if (action === 'list') {
    const result = await pool.query(
      `SELECT c.case_id, c.review_status, c.created_at, t.title,
              c.answer_details->>'phase' AS phase,
              c.answer_details->>'requestedForUser' AS requested_for_user
         FROM cases c JOIN tasks t USING(task_id)
        WHERE c.content_source='ai_generated' AND c.review_status='pending_review'
        ORDER BY c.created_at DESC LIMIT 100`)
    console.table(result.rows)
  } else if (action === 'show') {
    const result = await pool.query(
      `SELECT c.case_id,c.review_status,c.raw_content,c.correct_decision,c.answer_details
         FROM cases c WHERE c.case_id=$1 AND c.content_source='ai_generated'`, [id])
    if (!result.rows[0]) throw new Error('AI case not found')
    console.log(JSON.stringify(result.rows[0], null, 2))
  } else {
    const result = await pool.query(
      `UPDATE cases SET review_status=$2
        WHERE case_id=$1 AND content_source='ai_generated' AND review_status='pending_review'
        RETURNING case_id,review_status`, [id, action === 'approve' ? 'approved' : 'rejected'])
    if (!result.rows[0]) throw new Error('Pending AI case not found; inspect it before changing status')
    console.log(JSON.stringify(result.rows[0]))
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}
