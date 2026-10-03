import type { NextRequest } from 'next/server'
import { protocolOrigin } from './access-config'

export function isProtocolRequest(request: NextRequest, requireOrigin = false) {
  let expected: URL
  try { expected = new URL(protocolOrigin().origin) } catch { return false }
  const host=request.headers.get('host') || request.nextUrl.host
  let actual:URL
  try { actual=new URL(`${expected.protocol}//${host}`) } catch { return false }
  const loopback=(hostname:string)=>['localhost','127.0.0.1','[::1]'].includes(hostname)
  // NextRequest normalizes a loopback IP in its URL to localhost in unit tests.
  if (actual.host!==expected.host && !(loopback(actual.hostname) && loopback(expected.hostname) && actual.port===expected.port)) return false
  const origin = request.headers.get('origin')
  if (!origin) return !requireOrigin
  try {
    new URL(origin)
    return origin === expected.origin
  } catch { return false }
}

// Compatibility for existing callers and regression tests.
export const isLocalRequest = isProtocolRequest

export async function readBoundedJson(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Missing request')
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.length
      if (bytes > 100000) { await reader.cancel(); throw new Error('Request too large') }
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } finally { reader.releaseLock() }
}
