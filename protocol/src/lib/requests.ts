import type { NextRequest } from 'next/server'
import { gmailConfig } from './gmail'

export function isProtocolRequest(request: NextRequest, requireOrigin = false) {
  const expected = new URL(gmailConfig().baseUrl)
  const host=request.headers.get('host') || request.nextUrl.host
  let actual:URL
  try { actual=new URL(`${expected.protocol}//${host}`) } catch { return false }
  const loopback=(hostname:string)=>['localhost','127.0.0.1','[::1]'].includes(hostname)
  // NextRequest normalizes a loopback IP in its URL to localhost in unit tests.
  if (actual.host!==expected.host && !(loopback(actual.hostname) && loopback(expected.hostname) && actual.port===expected.port)) return false
  const origin = request.headers.get('origin')
  if (!origin) return !requireOrigin
  try {
    const source = new URL(origin)
    return source.origin === expected.origin
  } catch { return false }
}

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
