import { validRequestOrigin } from '@/lib/request-origin'
import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth'
import { playerForToken } from '@/lib/player-auth'

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (path === '/api/auth') return NextResponse.next()
  let authenticated
  try { authenticated = await playerForToken(request.cookies.get(SESSION_COOKIE)?.value) }
  catch { return NextResponse.json({error:'Account service is unavailable. Please try again.'},{status:503}) }
  if (request.method !== 'GET' && request.method !== 'HEAD' && !validRequestOrigin(request)) return NextResponse.json({error:'Invalid request origin.'},{status:403})
  if (path === '/login') {
    return authenticated ? NextResponse.redirect(new URL('/', request.url)) : NextResponse.next()
  }
  if (!authenticated) {
    if (path.startsWith('/api/')) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/login', '/design-preview', '/api/:path*'],
}
