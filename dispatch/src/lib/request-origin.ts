import type { NextRequest } from 'next/server'

// A configured browser origin is authoritative behind Docker or a reverse proxy.
// Never derive trust from client-supplied forwarding headers.
export function validRequestOrigin(request: NextRequest): boolean {
  const expected = process.env.DISPATCH_ORIGIN ?? request.nextUrl.origin
  try {
    const url = new URL(expected)
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== expected) return false
    return request.headers.get('origin') === expected
  } catch { return false }
}
