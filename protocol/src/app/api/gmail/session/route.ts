import { NextRequest, NextResponse } from 'next/server'
import { gmailConfig } from '@/lib/gmail'
import { getSession } from '@/lib/gmail-session'
import { isProtocolRequest } from '@/lib/requests'
import { privateHeaders } from '@/lib/gmail-api'
import { authorizedSession } from '@/lib/authorized-session'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  if (!isProtocolRequest(request)) return NextResponse.json({ error: 'Invalid Protocol host.' }, { status: 403, headers: privateHeaders })
  const existing=getSession(request)
  if (existing) {
    const access=await authorizedSession(request)
    if (access.response) return access.response
  }
  const session=getSession(request)
  return NextResponse.json({ ...gmailConfig(), connected: Boolean(session), email: session?.email ?? null }, { headers: privateHeaders })
}
