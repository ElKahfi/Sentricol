const test = require('node:test')
const assert = require('node:assert/strict')
const { NextRequest } = require('next/server')
const createLoader = require('./load-typescript.cjs')
const load = createLoader()
const sessions = load('lib/gmail-session.ts')
test('OAuth state is unpredictable, bound to a flow and one-time use', () => {
  const one = sessions.createPending(), two = sessions.createPending()
  assert.notEqual(one.state, two.state)
  assert.notEqual(one.state, one.verifier)
  assert.equal(sessions.consumePending(one.id, two.state), null)
  assert.equal(sessions.consumePending(one.id, one.state), null)
  assert.equal(sessions.consumePending(two.id, two.state).verifier, two.verifier)
  assert.equal(sessions.consumePending(two.id, two.state), null)
})
test('cookie contains only an opaque id and sessions expire or disconnect', () => {
  const created = sessions.createSession('google-token', 'person@example.test', 31)
  const request = new NextRequest('http://127.0.0.1:3003', { headers: { cookie: `${sessions.sessionCookie}=${created.id}` } })
  assert.notEqual(created.id, 'google-token')
  assert.equal(sessions.getSession(request).token, 'google-token')
  sessions.deleteSession(request)
  assert.equal(sessions.getSession(request), null)
  const pending = sessions.createPending()
  const now = Date.now
  try { Date.now = () => now() + 700000; assert.equal(sessions.consumePending(pending.id, pending.state), null) } finally { Date.now = now }
  assert.deepEqual(sessions.cookieOptions('https://localhost:3003', 10), { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 10 })
})
test('callback refuses invalid state and never exchanges a code', async () => {
  let calls = 0
  const { GET } = createLoader({ '@/lib/gmail': { gmailConfig: () => ({ baseUrl: 'http://127.0.0.1:3003', configured: true }), runGmail: async () => { calls++; throw Error() } } })('app/api/gmail/callback/route.ts')
  const response = await GET(new NextRequest('http://127.0.0.1:3003/api/gmail/callback?code=secret&state=wrong'))
  assert.equal(response.status, 307)
  assert.equal(response.headers.get('location'), 'http://127.0.0.1:3003/?gmail=state')
  assert.equal(calls, 0)
})
test('successful callback sets an opaque cookie and consumes its state', async () => {
  const pending = sessions.createPending()
  let calls = 0
  const config = { baseUrl: 'http://127.0.0.1:3003', redirectUri: 'http://127.0.0.1:3003/api/gmail/callback', configured: true }
  const { GET } = createLoader({ '@/lib/deployment-access': { checkDeploymentAccess: async email => { assert.equal(email, 'test@example.test'); return {company:'Example'} } }, '@/lib/gmail': { gmailConfig: () => config, runGmail: async (command, payload) => {
    calls++
    assert.equal(command, 'exchange')
    assert.deepEqual(payload, { code: 'test-code', verifier: pending.verifier, redirectUri: config.redirectUri })
    return { token: 'private-google-token', email: 'test@example.test', expiresIn: 3600 }
  } } })('app/api/gmail/callback/route.ts')
  const request = new NextRequest(`${config.redirectUri}?code=test-code&state=${pending.state}`, { headers: { cookie: `${sessions.flowCookie}=${pending.id}` } })
  const response = await GET(request)
  assert.equal(response.headers.get('location'), config.baseUrl + '/?gmail=connected')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.ok(!response.headers.get('set-cookie').includes('private-google-token'))
  const cookie = response.cookies.get(sessions.sessionCookie)
  assert.ok(cookie.httpOnly)
  const signedIn = new NextRequest(config.baseUrl, { headers: { cookie: `${cookie.name}=${cookie.value}` } })
  assert.equal(sessions.getSession(signedIn).email, 'test@example.test')
  assert.equal((await GET(request)).headers.get('location'), config.baseUrl + '/?gmail=state')
  assert.equal(calls, 1)
  sessions.deleteSession(signedIn)
})
test('Google sign-in rejects an address absent from Deployment before creating a session', async () => {
  const pending=sessions.createPending()
  const config={baseUrl:'http://127.0.0.1:3003',redirectUri:'http://127.0.0.1:3003/api/gmail/callback',configured:true}
  class Denied extends Error {constructor(message,status){super(message);this.status=status}}
  const { GET }=createLoader({
    '@/lib/deployment-access': {DeploymentAccessError:Denied,checkDeploymentAccess:async()=>{throw new Denied('No account',403)}},
    '@/lib/gmail':{gmailConfig:()=>config,runGmail:async command=>command==='exchange'?{token:'temporary-token',email:'outsider@example.test',expiresIn:3600}:{revoked:true}},
  })('app/api/gmail/callback/route.ts')
  const request=new NextRequest(`${config.redirectUri}?code=test-code&state=${pending.state}`,{headers:{cookie:`${sessions.flowCookie}=${pending.id}`}})
  const response=await GET(request)
  assert.equal(response.cookies.get(sessions.sessionCookie),undefined)
  assert.equal(response.headers.get('location'),config.baseUrl+'/?gmail=not-registered')
})
