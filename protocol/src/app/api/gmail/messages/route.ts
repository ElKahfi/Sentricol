import { NextRequest, NextResponse } from 'next/server'
import { runGmail, type Inbox } from '@/lib/gmail'
import { getSession } from '@/lib/gmail-session'
import { authorizedSession } from '@/lib/authorized-session'
import { isProtocolRequest } from '@/lib/requests'
import { gmailError, privateHeaders } from '@/lib/gmail-api'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  if (!isProtocolRequest(request)) return NextResponse.json({ error: 'Invalid Protocol host.' }, { status: 403, headers: privateHeaders })
  const access=await authorizedSession(request)
  if (access.response) return access.response
  const session=access.session!
  const mailbox = request.headers.get('x-protocol-mailbox')
  if (mailbox && mailbox.toLowerCase() !== session.email.toLowerCase()) return NextResponse.json({ error: 'Gmail account changed in another tab. Reconnect this inbox.' }, { status: 409, headers: privateHeaders })
  try {
    const result = await runGmail<Inbox>('list', { token: session.token }, request.signal)
    if (getSession(request) !== session) return NextResponse.json({ error: 'Gmail session ended.' }, { status: 401, headers: privateHeaders })
    return NextResponse.json(result, { headers: privateHeaders })
  } catch (error) { return gmailError(error, request) }
}
