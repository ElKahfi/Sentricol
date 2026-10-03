const test=require('node:test'), assert=require('node:assert/strict')
const {NextRequest}=require('next/server')
const loader=require('./load-typescript.cjs')
test('login behind HTTPS proxy distinguishes origin, body, credentials and creates secure cookies',async()=>{
 const old={origin:process.env.DISPATCH_ORIGIN,mode:process.env.NODE_ENV,secret:process.env.DISPATCH_SESSION_SECRET}
 let calls=0
 const route=loader({'@/lib/player-auth':{loginPlayer:async()=>{calls++;return {userId:'1',version:0}},currentPlayer:async()=>null}})('app/api/auth/route.ts')
 const request=(body,origin='https://sentridispatch.duckdns.org',type='application/json')=>new NextRequest('http://0.0.0.0:3000/api/auth',{method:'POST',headers:{origin,'content-type':type},body})
 try {
  process.env.DISPATCH_ORIGIN='https://sentridispatch.duckdns.org'
  process.env.NODE_ENV='production'; process.env.DISPATCH_SESSION_SECRET='test-secret-only'
  const credentials=JSON.stringify({email:'test@example.invalid',password:'123'})
  assert.equal((await route.POST(request(credentials,'https://evil.invalid'))).status,403)
  assert.equal((await route.POST(request(credentials,undefined,'text/plain'))).status,415)
  assert.equal((await route.POST(request('{'))).status,400)
  assert.equal((await route.POST(request('[]'))).status,400)
  assert.equal((await route.POST(request('x'.repeat(4097)))).status,413)
  assert.equal((await route.POST(request('{}'))).status,400)
  assert.equal(calls,0)
  const response=await route.POST(request(credentials))
  assert.equal(response.status,200); assert.equal(calls,1)
  assert.match(response.headers.get('set-cookie'),/; Secure/)
  const logout=await route.DELETE(request('{}'))
  assert.match(logout.headers.get('set-cookie'),/; Secure/)
 } finally {
  for(const [key,value] of Object.entries({DISPATCH_ORIGIN:old.origin,NODE_ENV:old.mode,DISPATCH_SESSION_SECRET:old.secret})) {
   if(value===undefined) delete process.env[key]; else process.env[key]=value
  }
 }
})
