import 'server-only'
import { timingSafeEqual } from 'node:crypto'
import { database, transaction } from './db'
import { AuthError } from './registration'

type Event = {type:'heartbeat'|'risk'; email:string; eventKey?:string; severity?:'suspicious'|'high-risk'; detectedAt?:string}
export async function protocolEmployee(email: string) {
  const rows=await database().query<{employee_id:number;company_id:number;company_name:string}>(
    `SELECT e.employee_id,d.company_id,c.company_name FROM employees e JOIN departments d USING(department_id)
     JOIN companies c USING(company_id) JOIN users u USING(employee_id)
     WHERE lower(e.work_email)=$1 AND lower(u.email)=$1 AND e.is_active=true AND u.role IN ('player','admin') LIMIT 2`,[email.trim().toLowerCase()])
  if (rows.rows.length!==1) throw new AuthError('This Gmail address is not linked to an active employee account.',404)
  return rows.rows[0]
}
export function authorizeProtocol(header:string|null) {
  const secret = process.env.PROTOCOL_DEPLOYMENT_SECRET
  if (!secret || secret.length < 32) throw new AuthError('Protocol monitoring is not configured.',503)
  const given = Buffer.from(header ?? ''), expected = Buffer.from(`Bearer ${secret}`)
  if (given.length !== expected.length || !timingSafeEqual(given,expected)) throw new AuthError('Invalid Protocol service credentials.',401)
}
export function parseProtocolEvent(value:unknown): Event {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AuthError('Invalid monitoring event.')
  const e=value as Event
  const keys=e.type==='heartbeat' ? ['type','email'] : ['type','email','eventKey','severity','detectedAt']
  if (!['heartbeat','risk'].includes(e.type) || Object.keys(e).some(k=>!keys.includes(k)) || keys.some(k=>!Object.hasOwn(e,k)) ||
      typeof e.email!=='string' || e.email.length>150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email)) throw new AuthError('Invalid monitoring event.')
  if (e.type==='risk' && (typeof e.eventKey!=='string' || !/^[a-f0-9]{64}$/.test(e.eventKey) ||
      !['suspicious','high-risk'].includes(e.severity ?? '') || typeof e.detectedAt!=='string' ||
      !Number.isFinite(Date.parse(e.detectedAt)) || Date.parse(e.detectedAt)>Date.now()+300000)) throw new AuthError('Invalid risk event.')
  return {...e,email:e.email.trim().toLowerCase()}
}
export async function recordProtocolEvent(event:Event) {
  return transaction(async client => {
    // The Protocol server obtains this email from Google, never from browser input.
    // Resolve tenancy here, never trust a supplied company or employee identifier.
    const rows=await client.query<{employee_id:number;company_id:number;company_name:string}>(
      `SELECT e.employee_id,d.company_id,c.company_name FROM employees e JOIN departments d USING(department_id)
       JOIN companies c USING(company_id) JOIN users u USING(employee_id)
       WHERE lower(e.work_email)=$1 AND lower(u.email)=$1 AND e.is_active=true AND u.role IN ('player','admin') LIMIT 2`,[event.email])
    if (rows.rows.length!==1) throw new AuthError('This Gmail address is not linked to an active employee account.',404)
    const employee=rows.rows[0]
    await client.query(`INSERT INTO protocol_connections(employee_id,company_id) VALUES($1,$2)
      ON CONFLICT(employee_id) DO UPDATE SET company_id=excluded.company_id,last_seen_at=now()`,[employee.employee_id,employee.company_id])
    if (event.type==='risk') await client.query(`INSERT INTO protocol_risk_alerts(event_key,company_id,employee_id,severity,detected_at)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_key) DO NOTHING`,[event.eventKey,employee.company_id,employee.employee_id,event.severity,event.detectedAt])
    return {company:employee.company_name,linked:true}
  })
}
