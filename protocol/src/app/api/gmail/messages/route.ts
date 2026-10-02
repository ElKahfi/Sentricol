import { NextRequest, NextResponse } from 'next/server'
import { runGmail, type Inbox } from '@/lib/gmail'
import { getSession } from '@/lib/gmail-session'
import { isLocalRequest } from '@/lib/requests'
import { gmailError, privateHeaders } from '@/lib/gmail-api'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  if (!isLocalRequest(request)) return NextResponse.json({ error: 'Local access only.' }, { status: 403, headers: privateHeaders })
  const session = getSession(request)
  if (!session) return NextResponse.json({ error: 'Connect your Gmail account first.' }, { status: 401, headers: privateHeaders })
  const mailbox = request.headers.get('x-protocol-mailbox')
  if (mailbox && mailbox.toLowerCase() !== session.email.toLowerCase()) return NextResponse.json({ error: 'Gmail account changed in another tab. Reconnect this inbox.' }, { status: 409, headers: privateHeaders })
  try {
    const result = await runGmail<Inbox>('list', { token: session.token }, request.signal)
    if (getSession(request) !== session) return NextResponse.json({ error: 'Gmail session ended.' }, { status: 401, headers: privateHeaders })
    return NextResponse.json(result, { headers: privateHeaders })
  } catch (error) { return gmailError(error, request) }
}
