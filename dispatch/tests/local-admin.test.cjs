const test = require('node:test')
const assert = require('node:assert/strict')
const { NextRequest } = require('next/server')
const loader = require('./load-typescript.cjs')

test('demo login requires explicit opt-in, development mode and a loopback request', async () => {
  const keys = ['NODE_ENV', 'DISPATCH_LOCAL_ADMIN_TOOLS', 'DISPATCH_ORIGIN', 'DISPATCH_SESSION_SECRET']
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  let demoCalls = 0
  const route = loader({ '@/lib/player-auth': {
    loginPlayer: async () => null,
    loginLocalDemoPlayer: async () => { demoCalls++; return { userId: '1', version: 0 } },
  } })('app/api/auth/route.ts')
  const request = (origin = 'http://localhost:3000') => new NextRequest(origin + '/api/auth', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'admin', password: '123' }),
  })
  try {
    delete process.env.DISPATCH_ORIGIN
    process.env.DISPATCH_SESSION_SECRET = 'test-only-secret'
    process.env.NODE_ENV = 'development'
    delete process.env.DISPATCH_LOCAL_ADMIN_TOOLS
    assert.equal((await route.POST(request())).status, 401)
    process.env.DISPATCH_LOCAL_ADMIN_TOOLS = 'true'
    assert.equal((await route.POST(request('https://public.example.test'))).status, 401)
    process.env.NODE_ENV = 'production'
    assert.equal((await route.POST(request())).status, 401)
    assert.equal(demoCalls, 0)
    process.env.NODE_ENV = 'development'
    assert.equal((await route.POST(request())).status, 200)
    assert.equal(demoCalls, 1)
  } finally {
    for (const key of keys) if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]
  }
})
