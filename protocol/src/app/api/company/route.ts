import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/gmail-session'
import { isProtocolRequest } from '@/lib/requests'
import { privateHeaders } from '@/lib/gmail-api'
import { companyStatus } from '@/lib/company-monitoring'
import { authorizedSession } from '@/lib/authorized-session'
export const runtime='nodejs'
export async function GET(request:NextRequest) {
  if(!isProtocolRequest(request)) return NextResponse.json({error:'Invalid Protocol host.'},{status:403,headers:privateHeaders})
  const access=await authorizedSession(request)
  if(access.response) return access.response
  const session=access.session!
  return NextResponse.json(await companyStatus(session.email),{headers:privateHeaders})
}
