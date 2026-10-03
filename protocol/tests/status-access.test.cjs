const test = require('node:test')
const assert = require('node:assert/strict')
const { NextRequest, NextResponse } = require('next/server')
const loader = require('./load-typescript.cjs')

test('public model status checks company access before invoking the harness', async () => {
  let calls = 0
  const route = loader({
    '@/lib/requests': { isProtocolRequest: () => true },
    '@/lib/access-config': { protocolOrigin: () => ({ local: false }) },
    '@/lib/authorized-session': { authorizedSession: async () => ({ response: NextResponse.json({ error: 'Access revoked' }, { status: 403 }) }) },
    '@/lib/harness': { runHarness: async () => { calls++; return { ready: true } } },
  })('app/api/status/route.ts')
  assert.equal((await route.GET(new NextRequest('https://protocol.example.test/api/status'))).status, 403)
  assert.equal(calls, 0)
})
