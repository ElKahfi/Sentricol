import { NextRequest, NextResponse } from 'next/server'
import { parseEmail, type Analysis } from '@/lib/contracts'
import { trustedSenderResult } from '@/lib/email-agent'
import { runHarness } from '@/lib/harness'
import { runGmail, type GmailMessage } from '@/lib/gmail'
import { getSession } from '@/lib/gmail-session'
import { gmailError, privateHeaders as headers } from '@/lib/gmail-api'
import { isLocalRequest, readBoundedJson } from '@/lib/requests'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
let busy = false
export async function POST(request: NextRequest) {
  if (!isLocalRequest(request, true)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers })
  const session = getSession(request)
  if (!session) return NextResponse.json({ error: 'Connect your Gmail account first.' }, { status: 401, headers })
  const mailbox = request.headers.get('x-protocol-mailbox')
  if (mailbox && mailbox.toLowerCase() !== session.email.toLowerCase()) return NextResponse.json({ error: 'Gmail account changed in another tab. Reconnect this inbox.' }, { status: 409, headers })
  if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'Send a JSON request.' }, { status: 415, headers })
  let messageId: string
  try {
    const body = await readBoundedJson(request) as { messageId: unknown }
    if (!body || typeof body !== 'object' || Object.keys(body).length !== 1 || typeof body.messageId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(body.messageId)) throw new Error()
    messageId = body.messageId
  } catch { return NextResponse.json({ error: 'Select a valid Gmail message.' }, { status: 400, headers }) }
  let claimed = false
  try {
    // Fetch using this session's token; the browser cannot substitute email content or another account.
    const message = await runGmail<GmailMessage>('get', { token: session.token, messageId, mailbox: session.email }, request.signal)
    if (getSession(request) !== session) return NextResponse.json({ error: 'Gmail session ended.' }, { status: 401, headers })
    const trusted = trustedSenderResult(message)
    if (trusted) return NextResponse.json({ ...trusted, message }, { headers })
    if (busy) return NextResponse.json({ error: 'Another analysis is running. Try again shortly.' }, { status: 429, headers })
    busy = true
    claimed = true
    const analysis: Analysis = message.body.trim()
      ? await runHarness<Analysis>('analyze', parseEmail({ sender: message.sender, replyTo: message.replyTo, subject: message.subject, body: message.body }), request.signal)
      : { verdict: 'inconclusive', summary: 'Requires investigation: no readable email text was available.', findings: [], recommendations: ['Verify this message through a known, independent channel. Attachment contents have not been scanned.'] }
    // A naturally expiring access token does not discard a completed analysis.
    // Explicit disconnect still invalidates it.
    if (session.revoked) return NextResponse.json({ error: 'Gmail session ended.' }, { status: 401, headers })
    return NextResponse.json({ message, analysis, notes: message.notes, skipped: false, senderCheck: message.senderCheck }, { headers })
  } catch (error) { return gmailError(error, request) }
  finally { if (claimed) busy = false }
}
