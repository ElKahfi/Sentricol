const test = require('node:test')
const assert = require('node:assert/strict')
process.env.DISPATCH_SESSION_SECRET = 'test-only-session-signing-key'
const { createSession, sessionIdentity, validSession, SESSION_SECONDS } = require('./load-typescript.cjs')()('lib/auth.ts')
test('session persists until its 30-day expiry', () => {
  const now = 1000000
  const token = createSession({userId:"42",version:0}, now)
  assert.equal(validSession(token, now + 1000), true)
  assert.equal(validSession(token, now + SESSION_SECONDS * 1000), false)
})
test('missing, malformed and tampered sessions are rejected', () => {
  assert.equal(validSession(undefined), false)
  assert.equal(validSession('admin'), false)
  assert.equal(validSession(createSession({userId:"42",version:0}) + 'x'), false)
  assert.equal(validSession(Buffer.from('{"user":"admin","expires":9999999999999}').toString('base64url') + '.fake'), false)
})
test('local admin tools require an untampered signed claim', () => {
  const token = createSession({userId:'42',version:0,localAdminTools:true})
  assert.equal(sessionIdentity(token).localAdminTools, true)
  const [payload, signature] = token.split('.')
  const changed = Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(payload,'base64url').toString()),userId:'43'})).toString('base64url')
  assert.equal(sessionIdentity(`${changed}.${signature}`), null)
  assert.equal(sessionIdentity(createSession({userId:'42',version:0})).localAdminTools, undefined)
})
