const test = require('node:test')
const assert = require('node:assert/strict')
const { NextRequest } = require('next/server')
const load = require('./load-typescript.cjs')({ pg: { Pool: class { constructor() { throw new Error('Demo must not access PostgreSQL') } } } })
process.env.DEPLOYMENT_AUTH_MODE = 'demo'
const config = load('src/lib/auth-config.ts')
const { registration, credentials } = load('src/lib/registration.ts')
const sessions = load('src/lib/admin-session.ts')
const register = load('src/app/api/auth/register/route.ts')
const login = load('src/app/api/auth/login/route.ts')
const session = load('src/app/api/auth/session/route.ts')
const data = { company: 'Example Ltd', industry: 'Technology', name: 'Example Admin', email: 'ADMIN@example.test', department: 'IT & Security', rank: 'Staff', title: 'Engineer', password: 'SafeTestPassword123!' }
test('registration rejects malformed configured origin and accepts HTTPS origin behind HTTP proxy', async()=>{
 const previous=process.env.DEPLOYMENT_ORIGIN
 const req=()=>new NextRequest('http://0.0.0.0:3000/api/auth/register',{method:'POST',headers:{origin:'https://sentriadmin.duckdns.org','content-type':'application/json'},body:'{}'})
 try {
  process.env.DEPLOYMENT_ORIGIN='sentriadmin.duckdns.org'
  const invalid=await register.POST(req())
  assert.equal(invalid.status,503); assert.match((await invalid.json()).error,/DEPLOYMENT_ORIGIN/)
  process.env.DEPLOYMENT_ORIGIN='https://sentriadmin.duckdns.org'
  const accepted=await register.POST(req())
  assert.equal(accepted.status,400); assert.doesNotMatch((await accepted.json()).error,/origin/i)
 } finally { if(previous===undefined) delete process.env.DEPLOYMENT_ORIGIN; else process.env.DEPLOYMENT_ORIGIN=previous }
})
function request(route, body, origin = 'http://localhost:3002') {
  return new NextRequest(`http://localhost:3002/api/auth/${route}`, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

test('registration validates schema lengths, email, enums, and bcrypt byte limit', () => {
  assert.equal(registration(data).email, 'admin@example.test')
  for (const change of [{ title: 'x'.repeat(101) }, { email: 'x'.repeat(151) }, { email: 'invalid' }, { password: 'short' }, { password: '😀'.repeat(19) }, { rank: 'Owner' }, { company: '   ' }, { department: 'Other' }]) {
    assert.throws(() => registration({ ...data, ...change }))
  }
  assert.equal(registration({ ...data, department: 'Other', otherDepartment: 'Custom team' }).department, 'Custom team')
  assert.throws(() => credentials(null))
})

test('demo registration, duplicate prevention, login, session restoration, and logout', async () => {
  const created = await register.POST(request('register', data))
  assert.equal(created.status, 201)
  const result = await created.json()
  assert.equal(result.mode, 'demo')
  assert.equal(result.admin.role, 'admin')
  assert.equal(JSON.stringify(result).includes('password'), false)
  assert.equal((await register.POST(request('register', { ...data, email: data.email.toLowerCase() }))).status, 409)
  assert.equal((await login.POST(request('login', { email: data.email, password: 'wrong-password' }))).status, 401)
  const signedIn = await login.POST(request('login', data))
  assert.equal(signedIn.status, 200)
  assert.match(signedIn.headers.get('set-cookie'), /HttpOnly/i)
  assert.match(signedIn.headers.get('set-cookie'), /SameSite=lax/i)
  const cookie = signedIn.headers.get('set-cookie').split(';')[0]
  const restored = await session.GET(new NextRequest('http://localhost:3002/api/auth/session', { headers: { cookie } }))
  assert.equal((await restored.json()).admin.email, data.email.toLowerCase())
  const loggedOut = await session.DELETE(new NextRequest('http://localhost:3002/api/auth/session', { method: 'DELETE', headers: { origin: 'http://localhost:3002', cookie } }))
  assert.match(loggedOut.headers.get('set-cookie'), /Max-Age=0/i)
  assert.equal((await (await session.GET(new NextRequest('http://localhost:3002/api/auth/session'))).json()).admin, null)
})

test('sessions reject tampering, expiration, and a switch from demo to database', () => {
  const token = sessions.createSession('123', 1000)
  assert.equal(sessions.sessionUser(token, 1001), '123')
  assert.equal(sessions.sessionUser(token + 'x', 1001), null)
  assert.equal(sessions.sessionUser(token, 1000 + sessions.SESSION_SECONDS * 1000), null)
  process.env.DEPLOYMENT_AUTH_MODE = 'database'
  process.env.DEPLOYMENT_SESSION_SECRET = 's'.repeat(64)
  assert.equal(sessions.sessionUser(token, 1001), null)
  delete process.env.DEPLOYMENT_SESSION_SECRET
  assert.throws(() => config.sessionSecret())
  process.env.DEPLOYMENT_AUTH_MODE = 'invalid'
  assert.throws(() => config.authMode())
  process.env.DEPLOYMENT_AUTH_MODE = 'demo'
})

test('HTTP guards reject cross-origin, invalid JSON, oversized requests, and throttled logins', async () => {
  assert.equal((await register.POST(request('register', data, 'https://foreign.example'))).status, 403)
  const broken = new NextRequest('http://localhost:3002/api/auth/login', { method: 'POST', headers: { origin: 'http://localhost:3002', 'content-type': 'application/json' }, body: '{' })
  assert.equal((await login.POST(broken)).status, 400)
  assert.equal((await register.POST(request('register', { ...data, extra: 'x'.repeat(17000) }))).status, 413)
  const { throttle } = load('src/lib/auth-http.ts')
  for (let i = 0; i < 10; i++) throttle('login:limited@example.test')
  assert.equal((await login.POST(request('login', { email: 'limited@example.test', password: data.password }))).status, 429)
})

test('database transaction helper commits on success and rolls back/release on failure', async () => {
  const statements = []
  let released = 0
  const client = { query: async sql => { statements.push(sql) }, release: () => released++ }
  const dbLoad = require('./load-typescript.cjs')({ pg: { Pool: class { async connect() { return client } } } })
  const db = dbLoad('src/lib/db.ts')
  const previous = process.env.DATABASE_URL
  process.env.DATABASE_URL = 'postgresql://unused.test/test'
  try {
    assert.equal(await db.transaction(async () => 'ok'), 'ok')
    assert.deepEqual(statements, ['BEGIN', 'COMMIT'])
    statements.length = 0
    await assert.rejects(db.transaction(async () => { throw new Error('failed insert') }), /failed insert/)
    assert.deepEqual(statements, ['BEGIN', 'ROLLBACK'])
    assert.equal(released, 2)
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL
    else process.env.DATABASE_URL = previous
    delete globalThis.deploymentPool
  }
})
