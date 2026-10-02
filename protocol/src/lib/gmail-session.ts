import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { NextRequest, NextResponse } from 'next/server'

export const sessionCookie = 'protocol_gmail_session'
export const flowCookie = 'protocol_gmail_flow'
type Session = { token: string; email: string; expiresAt: number; revoked: boolean }
type Pending = { state: string; verifier: string; expiresAt: number }
type Store = { sessions: Map<string, Session>; pending: Map<string, Pending> }
const scope = globalThis as typeof globalThis & { protocolGmailStore?: Store }
const store = scope.protocolGmailStore ??= { sessions: new Map(), pending: new Map() }
const random = () => randomBytes(32).toString('base64url')

function prune() {
  for (const map of [store.sessions, store.pending]) for (const [key, value] of map) if (value.expiresAt <= Date.now()) map.delete(key)
}
export function cookieOptions(baseUrl: string, maxAge: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: baseUrl.startsWith('https://'), path: '/', maxAge }
}
export function createPending() {
  prune()
  if (store.pending.size >= 100) throw new Error('Too many login requests.')
  const id = random(), pending = { state: random(), verifier: random(), expiresAt: Date.now() + 600000 }
  store.pending.set(id, pending)
  return { id, ...pending }
}
export function consumePending(id: string | undefined, state: string | null) {
  prune()
  const pending = id ? store.pending.get(id) : undefined
  if (id) store.pending.delete(id)
  if (!pending || !state || Buffer.byteLength(state) !== Buffer.byteLength(pending.state) || !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))) return null
  return pending
}
export function createSession(token: string, email: string, expiresIn: number) {
  prune()
  if (store.sessions.size >= 100) throw new Error('Too many active sessions.')
  if (!token || !email || !Number.isFinite(expiresIn) || expiresIn <= 30) throw new Error('Invalid Google session.')
  const id = random(), maxAge = Math.max(1, Math.min(expiresIn - 30, 3600))
  store.sessions.set(id, { token, email, expiresAt: Date.now() + maxAge * 1000, revoked: false })
  return { id, maxAge }
}
export function getSession(request: NextRequest) {
  prune()
  return store.sessions.get(request.cookies.get(sessionCookie)?.value ?? '') ?? null
}
export function deleteSession(request: NextRequest) {
  const id = request.cookies.get(sessionCookie)?.value
  if (id) {
    const session = store.sessions.get(id)
    if (session) session.revoked = true
    store.sessions.delete(id)
  }
}
export function clearSessionCookie(response: NextResponse, baseUrl: string) {
  response.cookies.set(sessionCookie, '', cookieOptions(baseUrl, 0))
}
