import { NextRequest, NextResponse } from 'next/server'
import { checkDeploymentAccess, DeploymentAccessError } from './deployment-access'
import { clearSessionCookie, deleteSession, getSession } from './gmail-session'
import { gmailConfig } from './gmail'
import { privateHeaders } from './gmail-api'

export async function authorizedSession(request:NextRequest) {
  const session=getSession(request)
  if (!session) return {session:null,response:NextResponse.json({error:'Connect your Gmail account first.'},{status:401,headers:privateHeaders})}
  try {
    await checkDeploymentAccess(session.email)
    return {session,response:null}
  } catch(error) {
    const status=error instanceof DeploymentAccessError ? error.status : 503
    const response=NextResponse.json({error:error instanceof Error?error.message:'Company access check failed.'},{status,headers:privateHeaders})
    if (status===403) { deleteSession(request); clearSessionCookie(response,gmailConfig().baseUrl) }
    return {session:null,response}
  }
}
