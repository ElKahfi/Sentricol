import 'server-only'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'

type RiskEvent={type:'risk';email:string;eventKey:string;severity:'suspicious'|'high-risk';detectedAt:string}
export type CompanyLink={configured:boolean;linked:boolean;company?:string;pending:number;message:string}
const file=path.join(process.cwd(),'.sentri','monitoring-outbox.enc')
const state=globalThis as typeof globalThis & {protocolReportLock?:Promise<unknown>}
function configuration() {
  const secret=process.env.PROTOCOL_DEPLOYMENT_SECRET, origin=process.env.DEPLOYMENT_URL
  if(!secret || secret.length<32 || !origin) return null
  const url=new URL(origin)
  if(url.username||url.password||url.search||url.hash||(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) throw Error('Use HTTPS or a local Deployment address.')
  return {secret,url:new URL('/api/protocol/events',url).toString(),key:createHash('sha256').update(secret).digest()}
}
async function locked<T>(work:()=>Promise<T>):Promise<T> {
  const next=(state.protocolReportLock??Promise.resolve()).catch(()=>{}).then(work)
  state.protocolReportLock=next.catch(()=>{})
  return next
}
async function readQueue(key:Buffer):Promise<RiskEvent[]> {
  try {
    const raw=await readFile(file)
    const cipher=createDecipheriv('aes-256-gcm',key,raw.subarray(0,12)); cipher.setAuthTag(raw.subarray(12,28))
    return JSON.parse(Buffer.concat([cipher.update(raw.subarray(28)),cipher.final()]).toString())
  } catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT') return []; throw Error('The monitoring retry queue cannot be opened.') }
}
async function saveQueue(queue:RiskEvent[],key:Buffer) {
  await mkdir(path.dirname(file),{recursive:true,mode:0o700})
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key,iv)
  const body=Buffer.concat([cipher.update(JSON.stringify(queue)),cipher.final()])
  const temp=`${file}.${randomBytes(6).toString('hex')}.tmp`
  await writeFile(temp,Buffer.concat([iv,cipher.getAuthTag(),body]),{mode:0o600}); await rename(temp,file)
}
async function send(config:NonNullable<ReturnType<typeof configuration>>,event:RiskEvent|{type:'heartbeat';email:string}) {
  const response=await fetch(config.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.secret}`},
    body:JSON.stringify(event),cache:'no-store',signal:AbortSignal.timeout(5000)})
  const result=await response.json()
  if(!response.ok) throw Error(response.status===404 ? 'Your Gmail address must match an active employee account in Deployment.' : 'Company monitoring is unavailable. Pending alerts will retry.')
  return result as {company:string;linked:boolean}
}
export async function companyStatus(email:string):Promise<CompanyLink> {
  try {
    const config=configuration()
    if(!config) return {configured:false,linked:false,pending:0,message:'Company monitoring is not configured.'}
    return await locked(async()=>{
      let queue=await readQueue(config.key)
      const pending=()=>queue.filter(e=>e.email===email.toLowerCase()).length
      try {
        const link=await send(config,{type:'heartbeat',email})
        // A bounded batch keeps the heartbeat responsive. Idempotent keys make retries safe.
        for(const event of queue.filter(e=>e.email===email.toLowerCase()).slice(0,5)) {
          await send(config,event)
          queue=queue.filter(e=>e.eventKey!==event.eventKey); await saveQueue(queue,config.key)
        }
        return {configured:true,linked:true,company:link.company,pending:pending(),message:pending()?'Sending pending risk alerts…':'Company monitoring connected.'}
      } catch(error) { return {configured:true,linked:false,pending:pending(),message:error instanceof Error?error.message:'Company monitoring unavailable.'} }
    })
  } catch(error) { return {configured:true,linked:false,pending:0,message:error instanceof Error?error.message:'Company monitoring unavailable.'} }
}
export async function reportRisk(email:string,messageId:string,severity:'suspicious'|'high-risk') {
  const config=configuration(); if(!config) return
  await locked(async()=>{
    const queue=await readQueue(config.key)
    const normalized=email.toLowerCase()
    const eventKey=createHmac('sha256',config.secret).update(`${normalized}\n${messageId}`).digest('hex')
    if(!queue.some(e=>e.eventKey===eventKey)) {
      if(queue.length>=2000) throw Error('The monitoring retry queue is full.')
      queue.push({type:'risk',email:normalized,eventKey,severity,detectedAt:new Date().toISOString()})
      await saveQueue(queue,config.key)
    }
  })
  // Delivery is attempted immediately, then retried by the company heartbeat.
  await companyStatus(email)
}
