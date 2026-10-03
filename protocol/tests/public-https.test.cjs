const test=require('node:test'),assert=require('node:assert/strict')
const {NextRequest}=require('next/server')
const loader=require('./load-typescript.cjs')
test('HTTPS proxy origin, mailbox authorization and callback remain isolated',async()=>{
 const old={base:process.env.PROTOCOL_BASE_URL,emails:process.env.PROTOCOL_ALLOWED_EMAILS}
 const origin='https://sentriprotocol.duckdns.org'
 const load=loader(),access=load('lib/access-config.ts'),guards=load('lib/requests.ts'),sessions=load('lib/gmail-session.ts')
 const req=(source=origin,host='sentriprotocol.duckdns.org')=>new NextRequest('http://0.0.0.0:3000/api/gmail/connect',{headers:{host,...(source?{origin:source}:{}),'x-forwarded-host':'sentriprotocol.duckdns.org','x-forwarded-proto':'https'}})
 try {
  process.env.PROTOCOL_BASE_URL=origin
  delete process.env.PROTOCOL_ALLOWED_EMAILS
  assert.equal(access.accessConfigured(),false)
  assert.throws(()=>sessions.createSession('token','allowed@example.test',3600))
  process.env.PROTOCOL_ALLOWED_EMAILS='allowed@example.test, SECOND@example.test'
  assert.equal(access.allowedMailbox('Allowed@Example.Test'),true)
  assert.equal(access.allowedMailbox('stranger@example.test'),false)
  assert.equal(guards.isLocalRequest(req(),true),true)
  assert.equal(guards.isLocalRequest(req('https://evil.test'),true),false)
  assert.equal(guards.isLocalRequest(req(null),true),false)
  assert.equal(guards.isLocalRequest(req(null)),true)
  assert.equal(guards.isLocalRequest(req(origin,'evil.test'),true),false)
  for(const invalid of ['http://public.test','https://public.test/path','https://public.test/','https://u:p@public.test']) {
   process.env.PROTOCOL_BASE_URL=invalid; assert.throws(()=>access.protocolOrigin())
  }
  process.env.PROTOCOL_BASE_URL=origin
  let mailbox='stranger@example.test',revokes=0
  const route=loader({'@/lib/deployment-access':{checkDeploymentAccess:async()=>({company:'Example'})},'@/lib/gmail':{gmailConfig:()=>({baseUrl:origin,redirectUri:origin+'/api/gmail/callback',configured:true}),runGmail:async(command)=>{
   if(command==='revoke'){revokes++;return{revoked:true}}
   return{token:'never-in-browser',email:mailbox,expiresIn:3600}
  }}})('app/api/gmail/callback/route.ts')
  const callback=()=>{
   const pending=sessions.createPending()
   return new NextRequest('http://0.0.0.0:3000/api/gmail/callback?code=test&state='+pending.state,{headers:{host:'sentriprotocol.duckdns.org',cookie:sessions.flowCookie+'='+pending.id}})
  }
  const denied=await route.GET(callback())
  assert.equal(denied.headers.get('location'),origin+'/?gmail=forbidden')
  assert.equal(denied.cookies.get(sessions.sessionCookie),undefined);assert.equal(revokes,1)
  mailbox='allowed@example.test'
  const request=callback(),accepted=await route.GET(request)
  assert.equal(accepted.headers.get('location'),origin+'/?gmail=connected')
  const cookie=accepted.cookies.get(sessions.sessionCookie)
  assert.equal(cookie.secure,true);assert.equal(cookie.httpOnly,true)
  assert.ok(!accepted.headers.get('set-cookie').includes('never-in-browser'))
  assert.equal((await route.GET(request)).headers.get('location'),origin+'/?gmail=state')
  const authenticated=new NextRequest(origin,{headers:{cookie:cookie.name+'='+cookie.value}})
  assert.equal(sessions.getSession(authenticated).email,mailbox)
  assert.equal(sessions.getSession(new NextRequest(origin)),null)
  process.env.PROTOCOL_ALLOWED_EMAILS='second@example.test'
  assert.equal(sessions.getSession(authenticated),null)
  sessions.deleteSession(authenticated)
 } finally {
  for(const [key,value] of Object.entries({PROTOCOL_BASE_URL:old.base,PROTOCOL_ALLOWED_EMAILS:old.emails})) {if(value===undefined)delete process.env[key];else process.env[key]=value}
 }
})
