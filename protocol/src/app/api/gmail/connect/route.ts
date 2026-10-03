import { NextRequest, NextResponse } from 'next/server'
import { gmailConfig, runGmail } from '@/lib/gmail'
import { cookieOptions, createPending, flowCookie, consumePending } from '@/lib/gmail-session'
import { isLocalRequest } from '@/lib/requests'
import { privateHeaders, gmailError } from '@/lib/gmail-api'
export const runtime = 'nodejs'
export async function POST(request: NextRequest) {
  if (!isLocalRequest(request, true)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: privateHeaders })
  const config = gmailConfig()
  if (!config.configured) return NextResponse.json({ error: 'Configure Google OAuth credentials and PROTOCOL_ALLOWED_EMAILS for public access on the server.' }, { status: 503, headers: privateHeaders })
  if (request.headers.get('origin') !== config.baseUrl) return NextResponse.json({ error: `Open ${config.baseUrl} to connect Gmail.` }, { status: 400, headers: privateHeaders })
  let pending: ReturnType<typeof createPending>
  try { pending = createPending() }
  catch { return NextResponse.json({ error: 'Too many connection requests. Please try again later.' }, { status: 429, headers: privateHeaders }) }
  try {
    const result = await runGmail<{ url: string }>('authorize', { state: pending.state, verifier: pending.verifier, redirectUri: config.redirectUri }, request.signal)
    const response = NextResponse.json(result, { headers: privateHeaders })
    response.cookies.set(flowCookie, pending.id, cookieOptions(config.baseUrl, 600))
    return response
  } catch (error) { consumePending(pending.id, pending.state); return gmailError(error, request) }
}
