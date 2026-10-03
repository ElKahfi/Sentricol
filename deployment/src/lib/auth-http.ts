import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { AuthError } from './registration'

const state = globalThis as unknown as { deploymentAuthLimits?: Map<string, { count: number; until: number }> }
const limits = state.deploymentAuthLimits ??= new Map()
export function sameOrigin(request: NextRequest) {
  const expected = process.env.DEPLOYMENT_ORIGIN ?? request.nextUrl.origin
  try {
    const url = new URL(expected)
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== expected) throw new Error()
  } catch { throw new AuthError('DEPLOYMENT_ORIGIN must be a complete origin such as https://sentriadmin.duckdns.org, without a path or trailing slash.', 503) }
  if (request.headers.get('origin') !== expected) throw new AuthError('Invalid request origin.', 403)
}
export function throttle(key: string) {
  const now = Date.now()
  for (const [entry, value] of limits) if (value.until <= now) limits.delete(entry)
  const value = limits.get(key)
  if (value && value.count >= 10) throw new AuthError('Too many attempts. Please try again in 15 minutes.', 429)
  if (value) value.count++
  else {
    if (limits.size >= 10000) throw new AuthError('Sign-in is busy. Please try again later.', 429)
    limits.set(key, { count: 1, until: now + 15 * 60 * 1000 })
  }
}
export async function formBody(request: NextRequest) {
  sameOrigin(request)
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AuthError('Send form data as JSON.', 415)
  // Bound the actual stream, not only the client-supplied Content-Length header.
  const reader = request.body?.getReader()
  if (!reader) throw new AuthError('Invalid form data.')
  let bytes = 0
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > 16384) { await reader.cancel(); throw new AuthError('Form data is too large.', 413) }
    chunks.push(value)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
  catch { throw new AuthError('Invalid form data.') }
}
export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}
export function failure(error: unknown) {
  if (error instanceof AuthError) return json({ error: error.message }, error.status)
  // Never log submitted credentials, connection strings, or full database errors.
  console.error('Deployment authentication failed', { code: (error as { code?: string })?.code ?? 'unknown' })
  return json({ error: 'The account service is unavailable. Please try again later.' }, 503)
}
