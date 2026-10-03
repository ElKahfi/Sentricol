import 'server-only'

export class DeploymentAccessError extends Error {
  constructor(message:string,public status:number) { super(message) }
}

export async function checkDeploymentAccess(email:string):Promise<{company:string}> {
  const origin=process.env.DEPLOYMENT_URL,secret=process.env.PROTOCOL_DEPLOYMENT_SECRET
  if (!origin || !secret || secret.length<32) throw new DeploymentAccessError('Company access is not configured for Protocol.',503)
  const base=new URL(origin)
  const local=['localhost','127.0.0.1','[::1]'].includes(base.hostname)
  if ((base.protocol!=='https:' && !(local && base.protocol==='http:')) || base.username || base.password || base.search || base.hash || base.pathname!=='/') throw new DeploymentAccessError('Company access URL is invalid.',503)
  let response:Response
  try {
    response=await fetch(new URL('/api/protocol/access',base),{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${secret}`},
      body:JSON.stringify({email}),cache:'no-store',signal:AbortSignal.timeout(5000)})
  } catch { throw new DeploymentAccessError('Company access check is unavailable. Try again shortly.',503) }
  if (response.status===404) throw new DeploymentAccessError('This Gmail address has no active employee account in Deployment.',403)
  if (!response.ok) throw new DeploymentAccessError('Company access check is unavailable. Try again shortly.',503)
  const result=await response.json() as {allowed?:unknown;company?:unknown}
  if (result.allowed!==true || typeof result.company!=='string') throw new DeploymentAccessError('Company access check returned an invalid answer.',503)
  return {company:result.company}
}
