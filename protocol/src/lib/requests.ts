import type { NextRequest } from 'next/server'

export function isLocalRequest(request: NextRequest, requireOrigin = false) {
  const host = request.nextUrl.hostname
  const localHosts = ['localhost', '127.0.0.1', '[::1]']
  if (!localHosts.includes(host)) return false
  const origin = request.headers.get('origin')
  if (!origin) return !requireOrigin
  try {
    const source = new URL(origin)
    // Next normalizes loopback IPs to localhost when constructing NextURL.
    return localHosts.includes(source.hostname) && source.port === request.nextUrl.port && source.protocol === request.nextUrl.protocol
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
