const test = require('node:test')
const assert = require('node:assert/strict')
const load = require('./load-typescript.cjs')
const { validRequestOrigin } = load()('lib/request-origin.ts')
const req = (origin, internal = 'http://0.0.0.0:3000') => ({nextUrl: {origin: internal}, headers: new Headers(origin === undefined ? {} : {origin, 'x-forwarded-host': 'localhost:3000'})})
test('configured browser origin works across Docker and rejects other origins', () => {
 const previous = process.env.DISPATCH_ORIGIN
 try {
  process.env.DISPATCH_ORIGIN = 'http://localhost:3000'
  assert.equal(validRequestOrigin(req('http://localhost:3000')), true)
  for (const origin of [undefined, 'null', 'http://evil.example', 'http://localhost:3001', 'https://localhost:3000', 'http://127.0.0.1:3000']) assert.equal(validRequestOrigin(req(origin)), false)
  for (const invalid of ['', 'garbage', 'http://localhost:3000/path', 'http://localhost:3000/']) {
   process.env.DISPATCH_ORIGIN = invalid
   assert.equal(validRequestOrigin(req('http://localhost:3000')), false)
  }
  delete process.env.DISPATCH_ORIGIN
  assert.equal(validRequestOrigin(req('http://localhost:3000', 'http://localhost:3000')), true)
  assert.equal(validRequestOrigin(req('http://evil.example', 'http://localhost:3000')), false)
 } finally { if(previous === undefined) delete process.env.DISPATCH_ORIGIN; else process.env.DISPATCH_ORIGIN = previous }
})
