const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-typescript.cjs')
test('Google credentials trim paste whitespace and reject incomplete IDs', () => {
  const oldId = process.env.GOOGLE_CLIENT_ID, oldSecret = process.env.GOOGLE_CLIENT_SECRET
  try {
    const { googleCredentials } = load()('lib/google-config.ts')
    process.env.GOOGLE_CLIENT_ID = ' 12345-example.apps.googleusercontent.com\n'
    process.env.GOOGLE_CLIENT_SECRET = ' example-secret\n'
    assert.deepEqual(googleCredentials(), { clientId: '12345-example.apps.googleusercontent.com', clientSecret: 'example-secret', valid: true })
    for (const id of ['', '12345-example', '"12345-example.apps.googleusercontent.com"', '12345 example.apps.googleusercontent.com']) {
      process.env.GOOGLE_CLIENT_ID = id
      assert.equal(googleCredentials().valid, false)
    }
  } finally {
    if (oldId === undefined) delete process.env.GOOGLE_CLIENT_ID; else process.env.GOOGLE_CLIENT_ID = oldId
    if (oldSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET; else process.env.GOOGLE_CLIENT_SECRET = oldSecret
  }
})

test('malformed credentials stop OAuth before a Python process or pending session is created', async () => {
  const { POST } = load({
    '@/lib/requests': { isProtocolRequest: () => true },
    '@/lib/google-config': { googleCredentials: () => ({ valid: false }) },
    '@/lib/gmail': { gmailConfig: () => { throw Error('Must not continue') }, runGmail: () => { throw Error('Must not launch') } },
    '@/lib/gmail-session': { createPending: () => { throw Error('Must not allocate session') } },
    '@/lib/gmail-api': { privateHeaders: { 'Cache-Control': 'no-store' } },
  })('app/api/gmail/connect/route.ts')
  const response = await POST({})
  assert.equal(response.status, 503)
  assert.match((await response.json()).error, /complete Web application GOOGLE_CLIENT_ID/)
})
