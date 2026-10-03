import { createHmac, timingSafeEqual } from 'node:crypto'
export const SESSION_COOKIE = 'sentri_dispatch_session'
export const SESSION_SECONDS = 60 * 60 * 24 * 30
export type SessionIdentity = { userId: string; version: number; localAdminTools?: boolean }
function signature(payload: string) {
  const secret = process.env.DISPATCH_SESSION_SECRET
  if (!secret) throw new Error('DISPATCH_SESSION_SECRET is not configured')
  return createHmac('sha256', secret).update(payload).digest('base64url')
}
export function createSession(identity: SessionIdentity, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ ...identity, purpose: 'dispatch-player', expires: now + SESSION_SECONDS * 1000 })).toString('base64url')
  return `${payload}.${signature(payload)}`
}
export function sessionIdentity(token: string | undefined, now = Date.now()): SessionIdentity | null {
  if (!token || token.length > 2048) return null
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return null
    const [payload, supplied] = parts
    const expected = Buffer.from(signature(payload)), actual = Buffer.from(supplied)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return s.purpose === 'dispatch-player' && typeof s.userId === 'string' && /^\d+$/.test(s.userId) && Number.isInteger(s.version) && s.version >= 0 && (s.localAdminTools === undefined || typeof s.localAdminTools === 'boolean') && Number.isFinite(s.expires) && s.expires > now ? {userId:s.userId,version:s.version,...(s.localAdminTools === true ? {localAdminTools:true} : {})} : null
  } catch { return null }
}
export function validSession(token: string | undefined, now = Date.now()) { return sessionIdentity(token,now) !== null }
