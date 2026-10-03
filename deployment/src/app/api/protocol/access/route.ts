import { NextRequest } from 'next/server'
import { authorizeProtocol, protocolEmployee } from '@/lib/protocol-events'
import { failure, json } from '@/lib/auth-http'
import { AuthError } from '@/lib/registration'
export const runtime='nodejs'
export async function POST(request:NextRequest) {
  try {
    authorizeProtocol(request.headers.get('authorization'))
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AuthError('Send JSON.',415)
    const body=await request.text()
    if (Buffer.byteLength(body)>512) throw new AuthError('Request too large.',413)
    let value:unknown
    try { value=JSON.parse(body) } catch { throw new AuthError('Invalid JSON.') }
    if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).length!==1 ||
      !Object.hasOwn(value,'email') || typeof (value as {email:unknown}).email!=='string' ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((value as {email:string}).email) ||
      (value as {email:string}).email.length>150) throw new AuthError('Invalid Gmail address.',400)
    const employee=await protocolEmployee((value as {email:string}).email)
    return json({allowed:true,company:employee.company_name})
  } catch(error) { return failure(error) }
}
