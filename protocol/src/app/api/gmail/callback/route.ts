import { NextRequest, NextResponse } from 'next/server'
import { gmailConfig, runGmail } from '@/lib/gmail'
import { cookieOptions, consumePending, createSession, deleteSession, flowCookie, sessionCookie } from '@/lib/gmail-session'
import { isLocalRequest } from '@/lib/requests'
import { privateHeaders } from '@/lib/gmail-api'
export const runtime = 'nodejs'
export async function GET(request: NextRequest) {
  if (!isLocalRequest(request)) return NextResponse.json({ error: 'Local access only.' }, { status: 403, headers: privateHeaders })
  const config = gmailConfig()
  const redirect = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/?gmail=${reason}`, config.baseUrl))
    for (const [key, value] of Object.entries(privateHeaders)) response.headers.set(key, value)
    response.cookies.set(flowCookie, '', cookieOptions(config.baseUrl, 0))
    return response
  }
  const pending = consumePending(request.cookies.get(flowCookie)?.value, request.nextUrl.searchParams.get('state'))
  if (!pending) return redirect('state')
  if (request.nextUrl.searchParams.has('error')) return redirect('denied')
  const code = request.nextUrl.searchParams.get('code')
  if (!config.configured || !code || code.length > 4096) return redirect('configuration')
  try {
    const result = await runGmail<{ token: string; email: string; expiresIn: number }>('exchange', { code, verifier: pending.verifier, redirectUri: config.redirectUri }, request.signal)
    deleteSession(request)
    const session = createSession(result.token, result.email, result.expiresIn)
    const response = redirect('connected')
    response.cookies.set(sessionCookie, session.id, cookieOptions(config.baseUrl, session.maxAge))
    return response
  } catch { return redirect('connection') }
}
