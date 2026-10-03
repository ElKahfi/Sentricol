const test=require('node:test'),assert=require('node:assert/strict')
const createLoader=require('./load-typescript.cjs')
test('Risk delivery queues encrypted metadata, retries after failure and keeps stable event identifiers',async()=>{
 const oldSecret=process.env.PROTOCOL_DEPLOYMENT_SECRET,oldURL=process.env.DEPLOYMENT_URL,oldFetch=global.fetch
 process.env.PROTOCOL_DEPLOYMENT_SECRET='s'.repeat(64);process.env.DEPLOYMENT_URL='http://127.0.0.1:3002'
 const files=new Map(),requests=[];let fail=true
 const fs={mkdir:async()=>{},readFile:async file=>{if(!files.has(file)){const e=Error();e.code='ENOENT';throw e}return files.get(file)},writeFile:async(file,bytes)=>files.set(file,bytes),rename:async(a,b)=>{files.set(b,files.get(a));files.delete(a)}}
 global.fetch=async(url,init)=>{requests.push(JSON.parse(init.body));if(fail)throw Error('offline');return {ok:true,json:async()=>({company:'Example',linked:true})}}
 try{
  const {reportRisk,companyStatus}=createLoader({'node:fs/promises':fs})('lib/company-monitoring.ts')
  await reportRisk('employee@example.test','gmail-private-id','high-risk')
  const blob=[...files.values()][0]
  assert.ok(blob.length>28);assert.equal(blob.includes(Buffer.from('employee@example.test')),false)
  assert.equal((await companyStatus('employee@example.test')).pending,1)
  fail=false
  const result=await companyStatus('employee@example.test')
  assert.equal(result.linked,true);assert.equal(result.pending,0)
  const risk=requests.find(r=>r.type==='risk')
  assert.deepEqual(Object.keys(risk).sort(),['type','email','eventKey','severity','detectedAt'].sort())
  assert.match(risk.eventKey,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(risk).includes('gmail-private-id'),false)
  await reportRisk('employee@example.test','gmail-private-id','high-risk')
  assert.equal(requests.filter(r=>r.type==='risk').at(-1).eventKey,risk.eventKey)
 }finally{
  global.fetch=oldFetch
  if(oldSecret===undefined)delete process.env.PROTOCOL_DEPLOYMENT_SECRET;else process.env.PROTOCOL_DEPLOYMENT_SECRET=oldSecret
  if(oldURL===undefined)delete process.env.DEPLOYMENT_URL;else process.env.DEPLOYMENT_URL=oldURL
 }
})
