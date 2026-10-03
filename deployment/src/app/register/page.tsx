'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import TerminalShell from '@/components/TerminalShell'
import { industries, departments, type AuthMode } from '@/lib/registration'
import { authRequest, useAdminSession } from '@/lib/auth-api'

const initial = { company: '', industry: '', otherIndustry: '', name: '', email: '', department: '', otherDepartment: '', rank: '', title: '' }

export default function Register() {
  const [step, setStep] = useState(0)
  const [data, setData] = useState(initial)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const { session, error: sessionError } = useAdminSession()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)
  const [savedMode, setSavedMode] = useState<AuthMode | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const update = (key: keyof typeof initial, value: string) => setData(previous => ({ ...previous, [key]: value }))
  const go = (next: number) => { setStep(next); setTimeout(() => { heading.current?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }) }, 0) }
  const names = ['Company initialization', 'Admin account setup', 'Deployment ready']
  const department = data.department === 'Other' ? data.otherDepartment : data.department
  const industry = data.industry === 'Other' ? data.otherIndustry : data.industry
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (submitting.current || !session) return
    submitting.current = true
    setSaving(true)
    setError('')
    try {
      const result = await authRequest<{ mode: AuthMode }>('register', 'POST', { ...data, password })
      setSavedMode(result.mode)
      setPassword('')
      go(2)
    } catch (error) { setError(error instanceof Error ? error.message : 'Registration failed. Please try again.'); go(1) }
    finally { setSaving(false); submitting.current = false }
  }

  return <TerminalShell stage={`0${step + 1}`} title={names[step].toUpperCase()}>
    <section className="registration">
      <div className="registration-intro"><div><span className="eyebrow">ESTABLISH YOUR COMPANY TERMINAL</span><h1 ref={heading} tabIndex={-1}>{names[step]}<span className="terminal-dot">_</span></h1></div><Link href="/" className="text-link">← Exit setup</Link></div>
      <p className="mode-note">{session ? session.mode === 'demo' ? 'DEMO MODE · Accounts are temporary and reset when the server restarts.' : 'DATABASE MODE · Company and account details are saved to SENTRI.' : 'Loading account access…'}</p>
      {(error || sessionError) && <p className="form-error" role="alert">{error || sessionError}</p>}
      <nav className="sequence panel" aria-label="Deployment progress"><span className="eyebrow">DEPLOYMENT SEQUENCE</span><ol>{['Company', 'Admin account', 'Ready'].map((label, index) => <li key={label} className={`${index === step ? 'active' : ''} ${index < step ? 'complete' : ''}`} aria-current={index === step ? 'step' : undefined}><div><span className="step-number">{index < step ? '✓' : `0${index + 1}`}</span><span>{label.toUpperCase()}</span></div><small>{index === step ? '▲ ACTIVE' : index < step ? 'COMPLETE' : 'STANDBY'}</small></li>)}</ol></nav>
      <div className="setup-grid"><div className="panel form-panel">
        {step === 0 && <form onSubmit={event => { event.preventDefault(); if (!data.company.trim()) return; go(1) }}>
          <div className="panel-heading"><h2>COMPANY INFORMATION</h2><span>01 / 03</span></div>
          <p className="panel-description">Let’s get your company connected.</p>
          <label htmlFor="company">COMPANY NAME</label><input id="company" value={data.company} onChange={e => update('company', e.target.value)} placeholder="e.g. Kahfung Industries" autoComplete="organization" required maxLength={120} pattern=".*\S.*" />
          <label htmlFor="industry">INDUSTRY</label><select id="industry" value={data.industry} onChange={e => update('industry', e.target.value)} required><option value="" disabled>Select industry</option>{industries.map(option => <option key={option}>{option}</option>)}</select>
          {data.industry === 'Other' && <><label htmlFor="other-industry">YOUR INDUSTRY</label><input id="other-industry" required value={data.otherIndustry} onChange={e => update('otherIndustry', e.target.value)} maxLength={100} pattern=".*\S.*" /></>}
          <div className="form-footer"><span>Next: your administrator account</span><button className="button primary" type="submit">[ CONTINUE → ]</button></div>
        </form>}
        {step === 1 && <form onSubmit={submit} aria-busy={saving}><fieldset disabled={saving}>
          <div className="panel-heading"><h2>ADMIN PROFILE</h2><span>02 / 03</span></div>
          <div className="company-strip"><span>COMPANY</span><strong>{data.company}</strong></div>
          <div className="fields-grid">
            <div><label htmlFor="name">FULL NAME</label><input id="name" value={data.name} onChange={e => update('name', e.target.value)} autoComplete="name" placeholder="Your full name" maxLength={120} required pattern=".*\S.*" /></div>
            <div><label htmlFor="email">WORK EMAIL</label><input id="email" type="email" value={data.email} onChange={e => update('email', e.target.value)} autoComplete="email" placeholder="you@company.com" maxLength={150} required /></div>
            <div><label htmlFor="password">PASSWORD</label><div className="password-field"><input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" placeholder="Create a password" minLength={12} maxLength={72} aria-describedby="password-hint" required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'HIDE' : 'SHOW'}</button></div><small id="password-hint" className="field-hint">Use 12–72 characters. Accented characters and symbols may use more of the limit.</small></div>
            <div><label htmlFor="department">DEPARTMENT</label><select id="department" value={data.department} onChange={e => update('department', e.target.value)} required><option value="" disabled>Select department</option>{departments.map(option => <option key={option}>{option}</option>)}</select></div>
            <div><label htmlFor="rank">RANK</label><select id="rank" value={data.rank} onChange={e => update('rank', e.target.value)} required><option value="" disabled>Select rank</option>{['Staff', 'Manager', 'Executive'].map(option => <option key={option}>{option}</option>)}</select><small className="field-hint">Your organizational level, not app permissions.</small></div>
            <div><label htmlFor="title">TITLE</label><input id="title" value={data.title} onChange={e => update('title', e.target.value)} autoComplete="organization-title" placeholder="e.g. Operations Manager" required maxLength={100} pattern=".*\S.*" /></div>
            {data.department === 'Other' && <div className="full-width"><label htmlFor="other-department">DEPARTMENT NAME</label><input id="other-department" required value={data.otherDepartment} onChange={e => update('otherDepartment', e.target.value)} maxLength={100} pattern=".*\S.*" /></div>}
          </div>
          <div className="account-designation"><span>ACCOUNT TYPE</span><strong>ADMINISTRATOR</strong><small>You’ll manage company settings and training access.</small></div>
          <p className="preview-note">{session?.mode === 'demo' ? 'Create a temporary demo company and administrator account.' : 'Create your company and administrator account, then sign in.'}</p>
          <div className="form-footer"><button type="button" className="button" onClick={() => go(0)}>[ ← BACK ]</button><button type="submit" className="button primary" disabled={saving || !session}>{saving ? '[ CREATING ACCOUNT… ]' : '[ CREATE ACCOUNT → ]'}</button></div>
        </fieldset></form>}
        {step === 2 && <div>
          <div className="panel-heading"><h2>SETUP SUMMARY</h2><span>03 / 03</span></div>
          <div className="ready-message" role="status"><span className="ready-check">✓</span><h2>Your account is ready.</h2><p>Your company and administrator account have been created{savedMode === 'demo' ? ' in demo mode' : ''}.</p></div>
          <dl className="summary">{[['Company', data.company], ['Industry', industry], ['Administrator', data.name], ['Work email', data.email], ['Department', department], ['Rank', data.rank], ['Title', data.title], ['Account type', 'Administrator']].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
          <p className="preview-note">{savedMode === 'demo' ? 'These demo details are temporary and are not saved to the database.' : 'Your details are saved to SENTRI.'} Sign in with the email and password you just registered.</p>
          <div className="form-footer"><Link href="/" className="text-link">← Back to start</Link><Link href="/login" className="button primary">[ ADMIN LOGIN → ]</Link></div>
        </div>}
      </div><aside className="sentri-aside"><section className="panel companion"><div className="panel-heading"><h2>SENTRI</h2><span className="status-light" /></div><div className="portrait"><img src="/sentri.png" alt="SENTRI, your friendly robot setup guide" /></div><div className="companion-message"><span className="eyebrow">YOUR DEPLOYMENT ASSISTANT</span><p>{step === 0 ? '“Let’s get your company connected.”' : step === 1 ? '“Every team needs someone at the controls. That’s you.”' : '“Everything is lined up. Your company is one step closer.”'}</p></div></section><div className="setup-note"><span className="eyebrow">{step === 0 ? 'A PLACE TO START' : step === 1 ? 'YOUR ROLE IN SENTRI' : 'WHAT COMES NEXT'}</span><p>{step === 0 ? 'Your company details give your training a home. You can organize departments later.' : step === 1 ? 'Administrator is your access level in SENTRI. Your rank describes your role within your company.' : 'Employee management and invitations will live in your admin panel.'}</p></div><span className="aside-code">SNT / INITIALIZATION PROTOCOL</span></aside></div>
    </section>
  </TerminalShell>
}
