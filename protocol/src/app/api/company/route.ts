import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/gmail-session'
import { isLocalRequest } from '@/lib/requests'
import { privateHeaders } from '@/lib/gmail-api'
import { companyStatus } from '@/lib/company-monitoring'
export const runtime='nodejs'
export async function GET(request:NextRequest) {
  if(!isLocalRequest(request)) return NextResponse.json({error:'Local access only.'},{status:403,headers:privateHeaders})
  const session=getSession(request)
  if(!session) return NextResponse.json({error:'Connect Gmail first.'},{status:401,headers:privateHeaders})
  return NextResponse.json(await companyStatus(session.email),{headers:privateHeaders})
}
