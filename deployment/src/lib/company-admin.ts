import 'server-only'
import type { NextRequest } from 'next/server'
import { sessionUser, SESSION_COOKIE } from './admin-session'
import { findAdmin } from './admin-store'
import { authMode } from './auth-config'
import { AuthError } from './registration'

export async function companyAdmin(request: NextRequest) {
  const id = sessionUser(request.cookies.get(SESSION_COOKIE)?.value)
  const account = id ? await findAdmin(id) : null
  if (!account) throw new AuthError('Please sign in as a company administrator.', 401)
  if (authMode() !== 'database') throw new AuthError('Monitoring requires database mode.', 409)
  return account
}
