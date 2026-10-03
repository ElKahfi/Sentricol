const test = require('node:test')
const assert = require('node:assert/strict')
const { NextRequest, NextResponse } = require('next/server')
const createLoader = require('./load-typescript.cjs')
const origin = 'http://127.0.0.1:3003'
const assessment = { verdict: 'low-risk', summary: 'No obvious warning signs.', findings: [], recommendations: ['Verify unexpected requests.'] }
const email = { id: 'abc123', sender: '', replyTo: '', subject: '', body: 'Meeting moved to 3 PM.', notes: [] }
test('only risky results report metadata using the verified Gmail identity', async () => {
  const reports=[]
  for (const verdict of ['low-risk','inconclusive','spam','suspicious','high-risk']) {
    const {POST}=route(async()=>({...assessment,verdict}),{'@/lib/company-monitoring':{reportRisk:async(...args)=>reports.push(args)}})
    assert.equal((await POST(request({messageId:'abc123'}))).status,200)
  }
  assert.deepEqual(reports,[['employee@example.test','abc123','suspicious'],['employee@example.test','abc123','high-risk']])
})
function request(body, headers = {}) {
  return new NextRequest(origin + '/api/analyze', { method: 'POST', headers: { origin, 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
}
function route(runHarness, extra = {}) {
  const session = { token: 'server-token', email: 'employee@example.test' }
  const getSession=extra['@/lib/gmail-session']?.getSession || (()=>session)
  return createLoader({ '@/lib/harness': { runHarness }, '@/lib/authorized-session': {authorizedSession:async()=>{const current=getSession();return current?{session:current,response:null}:{session:null,response:NextResponse.json({error:'Connect Gmail first.'},{status:401})}}}, '@/lib/gmail-session': { getSession: () => session }, '@/lib/gmail': { runGmail: async (command, payload) => { assert.equal(command, 'get'); assert.deepEqual(payload, { token: 'server-token', messageId: 'abc123', mailbox: 'employee@example.test' }); return email } }, ...extra })('app/api/analyze/route.ts')
}
test('selected Gmail message is fetched server-side before Qwen receives text', async () => {
  const { POST } = route(async (command, input, signal) => {
    assert.equal(command, 'analyze')
    assert.deepEqual(input, { sender: '', replyTo: '', subject: '', body: email.body })
    assert.ok(signal instanceof AbortSignal)
    return assessment
  })
  const response = await POST(request({ messageId: 'abc123' }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { message: email, analysis: assessment, notes: [], skipped: false })
})
test('authentication, origin and input validation prevent model calls', async () => {
  let calls = 0
  const model = async () => { calls++; return assessment }
  const { POST } = route(model)
  for (const payload of [{}, { messageId: '../a' }, { messageId: 'abc123', body: 'injected' }, 'not-json', 'a'.repeat(100001)]) assert.equal((await POST(request(payload))).status, 400)
  assert.equal((await POST(request({ messageId: 'abc123' }, { origin: 'https://other.test' }))).status, 403)
  assert.equal((await POST(request({ messageId: 'abc123' }, { 'content-type': 'text/plain' }))).status, 415)
  const unauthenticated = route(model, { '@/lib/gmail-session': { getSession: () => null } })
  assert.equal((await unauthenticated.POST(request({ messageId: 'abc123' }))).status, 401)
  assert.equal(calls, 0)
})
test('empty body and disconnected session never reach the AI', async () => {
  let calls = 0
  const model = async () => { calls++; return assessment }
  const empty = route(model, { '@/lib/gmail': { runGmail: async () => ({ ...email, body: '' }) } })
  const unreadable = await empty.POST(request({ messageId: 'abc123' }))
  assert.equal(unreadable.status, 200)
  assert.equal((await unreadable.json()).analysis.verdict, 'inconclusive')
  let session = { token: 'server-token' }
  const expired = route(model, { '@/lib/gmail-session': { getSession: () => session }, '@/lib/gmail': { runGmail: async () => { session = null; return email } } })
  assert.equal((await expired.POST(request({ messageId: 'abc123' }))).status, 401)
  assert.equal(calls, 0)
})
test('concurrency is bounded and a failed model releases the slot', async () => {
  let reject
  const { POST } = route(() => new Promise((_, no) => { reject = no }))
  const first = POST(request({ messageId: 'abc123' }))
  while (!reject) await new Promise(resolve => setImmediate(resolve))
  assert.equal((await POST(request({ messageId: 'abc123' }))).status, 429)
  reject(new Error('internal sensitive details'))
  const failed = await first
  assert.equal(failed.status, 503)
  assert.ok(!JSON.stringify(await failed.json()).includes('sensitive'))
  reject = null
  const next = POST(request({ messageId: 'abc123' }))
  while (!reject) await new Promise(resolve => setImmediate(resolve))
  reject(new Error('failure'))
  assert.equal((await next).status, 503)
})
test('trusted sender skips the model even with no readable body', async () => {
  let calls = 0
  const senderCheck = { status: 'trusted', senderAddress: 'sender@example.test', reason: 'Approved and authenticated', aiScanned: false }
  const { POST } = route(async () => { calls++; throw Error('Model offline') }, { '@/lib/gmail': { runGmail: async () => ({ ...email, body: '', senderCheck }) } })
  const response = await POST(request({ messageId: 'abc123' }))
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.verdict, 'clear')
  assert.equal(data.skipped, true)
  assert.equal(data.analysis, null)
  assert.equal(calls, 0)
})
test('failed sender check still invokes detection; browser cannot supply approval', async () => {
  let calls = 0
  const senderCheck = { status: 'scan-required', senderAddress: 'sender@example.test', reason: 'Authentication failed', aiScanned: false }
  const { POST } = route(async () => { calls++; return assessment }, { '@/lib/gmail': { runGmail: async () => ({ ...email, senderCheck }) } })
  assert.equal((await POST(request({ messageId: 'abc123', senderCheck: { status: 'trusted' } }))).status, 400)
  const result = await POST(request({ messageId: 'abc123' }))
  assert.equal((await result.json()).skipped, false)
  assert.equal(calls, 1)
})
test('natural session expiry during long analysis keeps the completed result', async () => {
  const session = { token: 'server-token', email: 'employee@example.test', revoked: false }
  let lookups = 0
  const { POST } = route(async () => { lookups++; return assessment }, {
    '@/lib/gmail-session': { getSession: () => ++lookups <= 2 ? session : null },
    '@/lib/gmail': { runGmail: async () => email },
  })
  const response = await POST(request({ messageId: 'abc123' }))
  assert.equal(response.status, 200)
})
test('explicit disconnect during analysis discards the result', async () => {
  const session = { token: 'server-token', email: 'employee@example.test', revoked: false }
  const { POST } = route(async () => { session.revoked = true; return assessment }, {
    '@/lib/gmail-session': { getSession: () => session },
    '@/lib/gmail': { runGmail: async () => email },
  })
  assert.equal((await POST(request({ messageId: 'abc123' }))).status, 401)
})
test('another tab switching Gmail accounts cannot mix mailbox data in the local vault', async () => {
  let calls = 0
  const { POST } = route(async () => { calls++; return assessment })
  const response = await POST(request({ messageId: 'abc123' }, { 'x-protocol-mailbox': 'someone-else@example.test' }))
  assert.equal(response.status, 409)
  assert.equal(calls, 0)
})
