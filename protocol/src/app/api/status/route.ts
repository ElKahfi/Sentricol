import { NextRequest, NextResponse } from 'next/server'
import { type ModelStatus } from '@/lib/contracts'
import { runHarness, HarnessError } from '@/lib/harness'
import { isProtocolRequest } from '@/lib/requests'
import { protocolOrigin } from '@/lib/access-config'
import { authorizedSession } from '@/lib/authorized-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!isProtocolRequest(request)) return NextResponse.json({ error: 'Local access only.' }, { status: 403, headers })
  if (!protocolOrigin().local) {
    const { response } = await authorizedSession(request)
    if (response) return response
  }
  try { return NextResponse.json(await runHarness<ModelStatus>('status', undefined, request.signal), { headers }) }
  catch (error) { return NextResponse.json({ ready: false, message: error instanceof HarnessError ? error.message : 'Unable to check the model.' }, { status: 503, headers }) }
}
