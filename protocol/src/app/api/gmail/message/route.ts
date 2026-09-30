import { NextRequest, NextResponse } from 'next/server'
import { runGmail, type GmailMessage } from '@/lib/gmail'
import { getSession } from '@/lib/gmail-session'
import { isLocalRequest } from '@/lib/requests'
import { gmailError, privateHeaders } from '@/lib/gmail-api'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  if (!isLocalRequest(request)) return NextResponse.json({ error: 'Local access only.' }, { status: 403, headers: privateHeaders })
  const session = getSession(request)
  if (!session) return NextResponse.json({ error: 'Connect your Gmail account first.' }, { status: 401, headers: privateHeaders })
  const messageId = request.nextUrl.searchParams.get('id') || ''
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(messageId)) return NextResponse.json({ error: 'Invalid message ID.' }, { status: 400, headers: privateHeaders })
  try {
    const result = await runGmail<GmailMessage>('get', { token: session.token, messageId, mailbox: session.email }, request.signal)
    if (getSession(request) !== session) return NextResponse.json({ error: 'Gmail session ended.' }, { status: 401, headers: privateHeaders })
    return NextResponse.json(result, { headers: privateHeaders })
  } catch (error) { return gmailError(error, request) }
}
