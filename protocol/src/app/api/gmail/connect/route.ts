import { NextRequest, NextResponse } from 'next/server'
import { gmailConfig, runGmail } from '@/lib/gmail'
import { cookieOptions, createPending, flowCookie, consumePending } from '@/lib/gmail-session'
import { isProtocolRequest } from '@/lib/requests'
import { privateHeaders, gmailError } from '@/lib/gmail-api'
export const runtime = 'nodejs'
export async function POST(request: NextRequest) {
  if (!isProtocolRequest(request, true)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: privateHeaders })
  const config = gmailConfig()
  if (!config.configured) return NextResponse.json({ error: 'Configure Google OAuth and the Deployment account connection on the Protocol server first.' }, { status: 503, headers: privateHeaders })
  if (request.headers.get('origin') !== config.baseUrl) return NextResponse.json({ error: `Open ${config.baseUrl} to connect Gmail.` }, { status: 400, headers: privateHeaders })
  const pending = createPending()
  try {
    const result = await runGmail<{ url: string }>('authorize', { state: pending.state, verifier: pending.verifier, redirectUri: config.redirectUri }, request.signal)
    const response = NextResponse.json(result, { headers: privateHeaders })
    response.cookies.set(flowCookie, pending.id, cookieOptions(config.baseUrl, 600))
    return response
  } catch (error) { consumePending(pending.id, pending.state); return gmailError(error, request) }
}
