import { NextRequest, NextResponse } from 'next/server'
import { gmailConfig } from '@/lib/gmail'
import { getSession } from '@/lib/gmail-session'
import { isLocalRequest } from '@/lib/requests'
import { privateHeaders } from '@/lib/gmail-api'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  if (!isLocalRequest(request)) return NextResponse.json({ error: 'Local access only.' }, { status: 403, headers: privateHeaders })
  const session = getSession(request)
  return NextResponse.json({ ...gmailConfig(), connected: Boolean(session), email: session?.email ?? null }, { headers: privateHeaders })
}
