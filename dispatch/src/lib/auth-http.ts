import { validRequestOrigin } from '@/lib/request-origin'
import { NextRequest, NextResponse } from 'next/server'
import { createSession, SESSION_COOKIE, SESSION_SECONDS } from './auth'
import type { Player } from './player-auth'
export class RequestError extends Error {
  constructor(message: string, public status: number) { super(message) }
}
export function authFailure(error: unknown, message: string) {
  if (error instanceof RequestError) return json({error:error.message},error.status)
  console.error('Dispatch authentication failed', {code: (error as {code?: string})?.code ?? 'unknown'})
  return json({error:message},503)
}
export function json(body: unknown, status=200) { return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}}) }
export function sessionResponse(player: Player, request: NextRequest, localAdminTools = false) {
  const response = json({ok:true,player})
  response.cookies.set(SESSION_COOKIE,createSession({userId:player.userId,version:player.version,...(localAdminTools ? {localAdminTools:true} : {})}),{httpOnly:true,secure:process.env.NODE_ENV==='production' || request.nextUrl.protocol==='https:',sameSite:'lax',path:'/',maxAge:SESSION_SECONDS})
  return response
}
const state = globalThis as unknown as { dispatchAuthAttempts?: Map<string,{count:number;until:number}> }
const attempts = state.dispatchAuthAttempts ??= new Map()
export function allowed(key: string) {
  const now=Date.now()
  for (const [k,v] of attempts) if(v.until<=now) attempts.delete(k)
  const entry=attempts.get(key) ?? {count:0,until:now+15*60*1000}
  if(!attempts.has(key) && attempts.size>=10000) return false
  attempts.set(key,entry); return ++entry.count<=10
}
export async function body(request: NextRequest): Promise<Record<string,unknown> | null> {
  if(!validRequestOrigin(request)) throw new RequestError('Invalid request origin. Please contact your administrator.',403)
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json') throw new RequestError('Send form data as JSON.',415)
  const reader=request.body?.getReader(); if(!reader) return null
  const chunks: Uint8Array[]=[]; let size=0
  while(true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>4096) { await reader.cancel(); throw new RequestError('Form data is too large.',413) }; chunks.push(value) }
  try { const data=JSON.parse(Buffer.concat(chunks).toString()); if (!data || typeof data!=='object' || Array.isArray(data)) throw new Error(); return data } catch { throw new RequestError('Invalid form data.',400) }
}
export function validPassword(value: unknown): value is string { return typeof value==='string' && value.length>0 && Buffer.byteLength(value,'utf8')<=72 }
