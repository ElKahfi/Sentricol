import { NextRequest, NextResponse } from 'next/server'
import { PythonError } from './python'
import { deleteSession, clearSessionCookie } from './gmail-session'
import { gmailConfig } from './gmail'

export const privateHeaders = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }
export function gmailError(error: unknown, request: NextRequest) {
  const status = error instanceof PythonError ? error.status : 503
  const response = NextResponse.json({ error: error instanceof PythonError ? error.message : 'Unable to complete the Gmail request.' }, { status, headers: privateHeaders })
  if (status === 401) { deleteSession(request); clearSessionCookie(response, gmailConfig().baseUrl) }
  return response
}
