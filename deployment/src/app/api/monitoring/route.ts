import { NextRequest } from 'next/server'
import { companyAdmin } from '@/lib/company-admin'
import { companyMonitoring, acknowledgeAlert } from '@/lib/monitoring'
import { failure, formBody, json } from '@/lib/auth-http'
import { AuthError } from '@/lib/registration'
export const runtime = 'nodejs'
export async function GET(request: NextRequest) {
  try { const admin = await companyAdmin(request); return json(await companyMonitoring(admin.companyId)) }
  catch(error) { return failure(error) }
}
export async function POST(request: NextRequest) {
  try {
    const admin = await companyAdmin(request)
    const body = await formBody(request) as {action?:unknown; id?:unknown}
    if (body?.action !== 'acknowledge') throw new AuthError('Unknown monitoring action.')
    await acknowledgeAlert(admin.companyId,admin.userId,body.id)
    return json({ok:true})
  } catch(error) { return failure(error) }
}
