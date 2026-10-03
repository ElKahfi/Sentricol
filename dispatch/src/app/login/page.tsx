'use client'

import { useState, type FormEvent } from 'react'

export default function LoginPage() {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [visible, setVisible] = useState(false)
  const [help, setHelp] = useState(false)

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: data.get('email'), password: data.get('password') }) })
      if (!response.ok) { const result = await response.json(); throw new Error(result.error) }
      window.location.replace('/')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to connect. Please try again.')
      setBusy(false)
    }
  }

  return <main className="access-screen">
    <div className="access-frame">
      <header className="access-brand"><span>S E N T R I</span><p>SECURITY TRAINING SYSTEM</p></header>
      <form className="access-terminal" onSubmit={login}>
        <div className="access-terminal-heading"><h1>ACCESS TERMINAL</h1><span aria-hidden="true">01</span></div>
        <label htmlFor="work-email">WORK EMAIL OR USERNAME</label>
        <input id="work-email" name="email" type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="employee@company.com" required disabled={busy} />
        <label htmlFor="password">PASSWORD</label>
        <div className="access-password"><input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••••" required disabled={busy} /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? 'HIDE' : 'SHOW'}</button></div>
        {error && <p className="access-error" role="alert">{error}</p>}
        <button className="access-submit" disabled={busy}>{busy ? '[ CONNECTING… ]' : '[ ACCESS SYSTEM ]'}</button>
        <p className="access-remember">This device will remember you for 30 days.</p>
        <button type="button" className="access-help" onClick={() => setHelp(!help)} aria-expanded={help}>Forgot password?</button>
        {help && <p className="access-help-copy">Contact your company administrator to restore access.</p>}
      </form>
      <footer className="access-status"><div><span>SYSTEM STATUS</span><span><i /> SYSTEM ONLINE</span></div><div><span>TERMINAL</span><span>EMPLOYEE ACCESS</span></div></footer>
    </div>
  </main>
}
