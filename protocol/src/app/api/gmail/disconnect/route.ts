import { NextRequest, NextResponse } from 'next/server'
import { gmailConfig, runGmail } from '@/lib/gmail'
import { clearSessionCookie, deleteSession, getSession } from '@/lib/gmail-session'
import { isLocalRequest } from '@/lib/requests'
import { privateHeaders } from '@/lib/gmail-api'
export const runtime = 'nodejs'
export async function POST(request: NextRequest) {
  if (!isLocalRequest(request, true)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers: privateHeaders })
  const session = getSession(request)
  deleteSession(request)
  let revoked = !session
  if (session) { try { revoked = (await runGmail<{ revoked: boolean }>('revoke', { token: session.token }, request.signal)).revoked } catch { revoked = false } }
  const response = NextResponse.json({ disconnected: true, revoked }, { headers: privateHeaders })
  clearSessionCookie(response, gmailConfig().baseUrl)
  return response
}
