'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import TerminalShell from '@/components/TerminalShell'
import { authRequest, useAdminSession, type SessionView } from '@/lib/auth-api'

export default function Login() {
  const router = useRouter()
  const { session, setSession, error: sessionError } = useAdminSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  async function login(event: React.FormEvent) {
    event.preventDefault()
    if (submitting.current || !session) return
    submitting.current = true
    setBusy(true); setError('')
    try {
      const result = await authRequest<SessionView>('login', 'POST', { email, password })
      setSession({ ...session, ...result }); setPassword('')
      router.replace('/admin')
    } catch (error) { setError(error instanceof Error ? error.message : 'Sign-in failed. Please try again.') }
    finally { setBusy(false); submitting.current = false }
  }
  async function logout() {
    setBusy(true); setError('')
    try { await authRequest('session', 'DELETE'); setSession(current => current ? { ...current, admin: null } : current); setPassword('') }
    catch { setError('Unable to sign out. Please try again.') }
    finally { setBusy(false) }
  }
  return <TerminalShell title="ADMIN ACCESS"><section className="login-placeholder panel">
    <span className="eyebrow">ADMIN TERMINAL</span><h1>{session?.admin ? 'Signed in' : 'Admin login'}</h1>
    <p className="mode-note">{session ? session.mode === 'demo' ? 'DEMO MODE · Temporary accounts. No database changes.' : 'DATABASE MODE · Connected to SENTRI accounts.' : 'Loading account access…'}</p>
    {(error || sessionError) && <p className="form-error" role="alert">{error || sessionError}</p>}
    {session?.admin ? <div>
      <div role="status"><h2>Welcome, {session.admin.name}.</h2><p>You are signed in as administrator for {session.admin.company}.</p></div>
      <p>Manage employees, follow Dispatch progress, and review Protocol risk alerts in your company panel.</p>
      <Link className="button primary" href="/admin">[ OPEN ADMIN PANEL → ]</Link>
      <button className="button" disabled={busy} onClick={logout}>{busy ? '[ SIGNING OUT… ]' : '[ SIGN OUT ]'}</button>
    </div> : <>
      {session?.demoCredentials && <p className="demo-help">Try the demo account:<br /><strong>{session.demoCredentials.email}</strong><br />Password: <strong>{session.demoCredentials.password}</strong><br />Or sign in with an account you registered in this demo.</p>}
      <form onSubmit={login} aria-busy={busy}><fieldset disabled={busy}>
        <label htmlFor="email">WORK EMAIL</label><input id="email" type="email" autoComplete="username" required maxLength={150} value={email} onChange={event => setEmail(event.target.value)} />
        <label htmlFor="password">PASSWORD</label><div className="password-field"><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={72} value={password} onChange={event => setPassword(event.target.value)} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? 'HIDE' : 'SHOW'}</button></div>
        <div className="form-footer"><button className="button primary" type="submit" disabled={busy || !session}>{busy ? '[ SIGNING IN… ]' : '[ SIGN IN → ]'}</button></div>
      </fieldset></form>
      <Link className="text-link" href="/register">Register a company</Link>
    </>}
    <Link className="text-link" href="/">← Back to start</Link>
  </section></TerminalShell>
}
