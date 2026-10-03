const test=require('node:test'),assert=require('node:assert/strict')
const loader=require('./load-typescript.cjs')
const {NextRequest}=require('next/server')
const event={type:'risk',email:'EMPLOYEE@example.test',eventKey:'a'.repeat(64),severity:'high-risk',detectedAt:new Date().toISOString()}
test('Protocol service requires its server secret and rejects mailbox content or supplied tenancy',()=>{
 const previous=process.env.PROTOCOL_DEPLOYMENT_SECRET
 process.env.PROTOCOL_DEPLOYMENT_SECRET='s'.repeat(64)
 try{
  const {authorizeProtocol,parseProtocolEvent}=loader({'./db':{}})('src/lib/protocol-events.ts')
  assert.throws(()=>authorizeProtocol(null),/credentials/)
  assert.throws(()=>authorizeProtocol('Bearer wrong'),/credentials/)
  authorizeProtocol('Bearer '+'s'.repeat(64))
  assert.equal(parseProtocolEvent(event).email,'employee@example.test')
  for(const extra of [{companyId:'other'},{subject:'private'},{body:'private'},{messageId:'gmail-id'}])assert.throws(()=>parseProtocolEvent({...event,...extra}))
  for(const invalid of [{severity:'safe'},{eventKey:'gmail-id'},{detectedAt:'invalid'}])assert.throws(()=>parseProtocolEvent({...event,...invalid}))
 }finally{if(previous===undefined)delete process.env.PROTOCOL_DEPLOYMENT_SECRET;else process.env.PROTOCOL_DEPLOYMENT_SECRET=previous}
})
test('Protocol records derive employee and company from active account lookup, with idempotent event keys',async()=>{
 const queries=[]
 const {recordProtocolEvent}=loader({'./db':{transaction:async work=>work({query:async(sql,args)=>{
  queries.push({sql,args});return sql.includes('SELECT e.employee_id')?{rows:[{employee_id:12,company_id:7,company_name:'Example'}]}:{rows:[]}
 }})}})('src/lib/protocol-events.ts')
 await recordProtocolEvent({...event,email:'employee@example.test'})
 assert.match(queries[0].sql,/e.is_active=true AND u.role IN \('player','admin'\)/)
 assert.deepEqual(queries[1].args,[12,7])
 assert.deepEqual(queries[2].args,[event.eventKey,7,12,'high-risk',event.detectedAt])
 assert.match(queries[2].sql,/ON CONFLICT\(event_key\) DO NOTHING/)
})
test('Protocol sign-in checks only the verified email against an active Deployment account',async()=>{
 let seen
 const {POST}=loader({
  '@/lib/protocol-events':{
   authorizeProtocol:()=>{},
   protocolEmployee:async email=>{seen=email;return {employee_id:3,company_id:2,company_name:'Example'}},
  },
 })('src/app/api/protocol/access/route.ts')
 const response=await POST(new NextRequest('http://localhost:3002/api/protocol/access',{method:'POST',headers:{authorization:'Bearer test','content-type':'application/json'},body:JSON.stringify({email:'Employee@Example.test'})}))
 assert.equal(response.status,200)
 assert.equal(seen,'Employee@Example.test')
 assert.deepEqual(await response.json(),{allowed:true,company:'Example'})
 assert.equal((await POST(new NextRequest('http://localhost:3002/api/protocol/access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:'employee@example.test',companyId:99})}))).status,400)
})
test('Protocol account lookup requires a matching active Deployment user',async()=>{
 let query,rows=[]
 const {protocolEmployee}=loader({'./db':{database:()=>({query:async(sql,args)=>{query={sql,args};return {rows}}})}})('src/lib/protocol-events.ts')
 await assert.rejects(()=>protocolEmployee('outsider@example.test'),{status:404})
 rows=[{employee_id:3,company_id:2,company_name:'Example'}]
 assert.deepEqual(await protocolEmployee('Worker@Example.test'),rows[0])
 assert.deepEqual(query.args,['worker@example.test'])
 assert.match(query.sql,/lower\(e.work_email\)=\$1 AND lower\(u.email\)=\$1/)
 assert.match(query.sql,/e.is_active=true AND u.role IN \('player','admin'\)/)
})
test('Monitoring endpoints require admin identity and ignore client company selection',async()=>{
 let seen
 const route=loader({
  '@/lib/company-admin':{companyAdmin:async()=>({companyId:'7',userId:'2'})},
  '@/lib/monitoring':{companyMonitoring:async id=>{seen=id;return {employees:[]}},acknowledgeAlert:async(...args)=>{seen=args}},
 })('src/app/api/monitoring/route.ts')
 assert.equal((await route.GET(new NextRequest('http://localhost:3002/api/monitoring?companyId=99'))).status,200)
 assert.equal(seen,'7')
 const request=new NextRequest('http://localhost:3002/api/monitoring',{method:'POST',headers:{origin:'http://localhost:3002','content-type':'application/json'},body:JSON.stringify({action:'acknowledge',id:'8',companyId:'99'})})
 assert.equal((await route.POST(request)).status,200)
 assert.deepEqual(seen,['7','2','8'])
 const foreign=new NextRequest('http://localhost:3002/api/monitoring',{method:'POST',headers:{origin:'https://other.test','content-type':'application/json'},body:'{}'})
 assert.equal((await route.POST(foreign)).status,403)
})
test('Company monitoring authorization rejects missing sessions',async()=>{
 const {companyAdmin}=loader({'./admin-session':{sessionUser:()=>null,SESSION_COOKIE:'test'},'./admin-store':{findAdmin:async()=>null},'./auth-config':{authMode:()=> 'database'}})('src/lib/company-admin.ts')
 await assert.rejects(companyAdmin(new NextRequest('http://localhost:3002/api/monitoring')),error=>error.status===401)
})
test('Acknowledgement is constrained by both alert and current employee company',async()=>{
 let query
 const {acknowledgeAlert}=loader({'./db':{database:()=>({query:async(sql,args)=>{query={sql,args};return {rowCount:0}}})}})('src/lib/monitoring.ts')
 await assert.rejects(acknowledgeAlert('7','2','8'),error=>error.status===404)
 assert.match(query.sql,/a.company_id=\$2/);assert.match(query.sql,/d.company_id=\$2/)
 assert.deepEqual(query.args,['8','7','2'])
})
