'use client'
import { useEffect, useRef, useState } from 'react'
import type { ModelStatus } from '@/lib/contracts'
import { emptyQueue, labels } from '@/lib/inbox-queue'
import { InboxMonitor, type MonitorView } from '@/lib/inbox-monitor'
import type { CompanyLink } from '@/lib/company-monitoring'

type Account = { configured: boolean; connected: boolean; email?: string; baseUrl: string; redirectUri: string }
const initialView: MonitorView = { data: emptyQueue(), activeId: '', syncing: false, ready: false, error: '', loginRequired: false, waiting: false }
export default function Home() {
  const [account, setAccount] = useState<Account | null>(null)
  const [status, setStatus] = useState<ModelStatus | null>(null)
  const [view, setView] = useState(initialView)
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sound, setSound] = useState(false)
  const [companyLink, setCompanyLink] = useState<CompanyLink | null>(null)
  const monitor = useRef<InboxMonitor | null>(null)
  const audio = useRef<AudioContext | null>(null)
  const soundEnabled = useRef(false)
  const entry = view.data.entries.find(item => item.summary.id === selectedId) || view.data.entries[0]
  const message = entry?.message
  const result = entry?.analysis
  const risky = view.data.entries.filter(item => item.category === 'risky')
  const completed = view.data.entries.filter(item => item.state === 'done').length
  const failed = view.data.entries.filter(item => item.state === 'error').length

  async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...init, cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || 'The request could not complete.')
    return data
  }
  async function checkStatus() {
    try { setStatus(await api<ModelStatus>('/api/status')) }
    catch { setStatus({ ready: false, message: 'Model connection unavailable.' }) }
  }
  useEffect(() => {
    const controller = new AbortController()
    const reason = new URLSearchParams(window.location.search).get('gmail')
    if (reason) {
      window.history.replaceState(null, '', window.location.pathname)
      if (reason !== 'connected') setError(reason === 'forbidden' ? 'This Google account is not enabled for Protocol. Contact your administrator.' : reason === 'denied' ? 'Google access was cancelled.' : reason === 'not-registered' ? 'This Google address has no active account in SENTRI Deployment. Ask your company admin to add and invite this exact work email.' : reason === 'access-unavailable' ? 'Company account verification is temporarily unavailable. Try again shortly.' : 'Google sign-in could not complete. Check your OAuth setup and try again.')
    }
    void api<Account>('/api/gmail/session', { signal: controller.signal }).then(setAccount).catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
    void checkStatus()
    return () => { controller.abort() }
  }, [])
  useEffect(() => {
    if (!account?.connected) { setCompanyLink(null); return }
    const controller = new AbortController()
    let timer:ReturnType<typeof setTimeout>
    async function refreshCompany() {
      try {
        const link = await api<CompanyLink>('/api/company', {signal:controller.signal})
        if (!controller.signal.aborted) setCompanyLink(link)
      } catch { if (!controller.signal.aborted) setCompanyLink({configured:true,linked:false,pending:0,message:'Company monitoring is unavailable. Alerts will retry while this app is open.'}) }
      finally { if (!controller.signal.aborted) timer=setTimeout(refreshCompany,30000) }
    }
    void refreshCompany()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [account?.connected,account?.email])
  useEffect(() => {
    if (!account?.connected || !account.email) return
    const worker = new InboxMonitor(account.email, setView, () => {
      const context = audio.current
      if (!soundEnabled.current || !context || context.state !== 'running') return
      for (let i = 0; i < 2; i++) {
        const oscillator = context.createOscillator(), gain = context.createGain()
        oscillator.connect(gain); gain.connect(context.destination)
        const start = context.currentTime + i * 0.3
        oscillator.frequency.value = i ? 660 : 880
        gain.gain.setValueAtTime(0, start)
        gain.gain.linearRampToValueAtTime(0.14, start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2)
        oscillator.start(start); oscillator.stop(start + 0.22)
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
      }
    })
    monitor.current = worker
    void worker.start()
    return () => { worker.stop(); monitor.current = null }
  }, [account?.connected, account?.email])
  useEffect(() => () => { void audio.current?.close(); audio.current = null }, [])
  async function toggleSound() {
    if (soundEnabled.current) { soundEnabled.current = false; setSound(false); return }
    try {
      audio.current ??= new AudioContext()
      await audio.current.resume()
      soundEnabled.current = audio.current.state === 'running'
      setSound(soundEnabled.current)
      if (!soundEnabled.current) setError('Your browser has not enabled sound. Try the sound button again.')
    } catch { setError('Alert audio is unavailable in this browser. Risky emails will still be highlighted.') }
  }
  async function connect() {
    if (!account) return
    if (window.location.origin !== account.baseUrl) { window.location.assign(account.baseUrl); return }
    setBusy(true); setError('')
    try { const data = await api<{ url: string }>('/api/gmail/connect', { method: 'POST' }); window.location.assign(data.url) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Sign-in failed.'); setBusy(false) }
  }
  async function disconnect() {
    setBusy(true); setError(''); monitor.current?.stop()
    try {
      const data = await api<{ revoked: boolean }>('/api/gmail/disconnect', { method: 'POST' })
      setAccount(current => current && ({ ...current, connected: false, email: undefined }))
      setView(initialView); setSelectedId('')
      if (!data.revoked) setError('Disconnected locally. Google could not confirm revocation; remove access from your Google Account connections if needed.')
    } catch (failure) { setError(failure instanceof Error ? failure.message + ' Reload to resume processing.' : 'Disconnect failed. Reload to resume processing.') }
    finally { setBusy(false) }
  }

  return <main className="shell">
    <header className="topbar"><div className="brand">SENTRI <span>/ PROTOCOL</span></div><span className={`status ${status?.ready ? 'ready' : ''}`}><span className="status-dot" />{!status ? 'CHECKING MODEL' : status.ready ? 'MODEL CONNECTED' : 'MODEL OFFLINE'}</span></header>
    <section className="intro"><p className="eyebrow">GMAIL / AUTOMATIC INBOX PROTECTION</p><h1>Check before <em>you act.</em></h1><p className="lead">Your 20 newest Inbox emails, automatically assessed. New arrivals go next, after the current analysis finishes.</p></section>
    <section className="panel account"><div><h2>{account?.connected ? account.email : 'CONNECT YOUR GMAIL'}</h2><p className="muted">{account?.connected ? 'Read-only Gmail access · Email content and results saved encrypted on this device.' : 'Use the Google address on your active Deployment account. SENTRI never receives your Google password.'}</p></div><div className="account-actions">{view.loginRequired && <button className="primary" disabled={busy} onClick={connect}>[ RECONNECT GMAIL ]</button>}<button className={account?.connected ? '' : 'primary'} disabled={busy || !account || (!account.connected && !account.configured)} onClick={account?.connected ? disconnect : connect}>{account?.connected ? '[ DISCONNECT ]' : '[ SIGN IN WITH GOOGLE ]'}</button></div></section>
    {account && !account.configured && <section className="panel setup"><h2>SETUP REQUIRED</h2><p>The Protocol server needs Google OAuth and a connection to SENTRI Deployment before employees can sign in.</p><p>Authorized redirect URI: <code>{account.redirectUri}</code></p><p>Ask your administrator to configure the company connection and enable your email address.</p><a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">Open Google Auth Platform ↗</a></section>}
    {(error || view.error) && <p className="error" role="alert">{error || view.error}</p>}
    {view.loginRequired && <p className="error" role="status">Access ended. Reconnect with an active Deployment account to continue. Saved results remain on this device.</p>}
    {account?.connected ? <>
      <section className="panel company-link" role="status"><h2>{companyLink?.linked ? `COMPANY / ${companyLink.company}` : 'COMPANY MONITORING'}</h2><p className="muted">{companyLink?.message || 'Checking company connection…'}{companyLink?.pending ? ` ${companyLink.pending} alert(s) pending delivery.` : ''}</p><p className="privacy">Your company admin receives your risk level and detection time. Email subjects, senders, bodies, and attachments are not shared with Deployment.</p></section>
      <section className="monitor-bar panel"><div role="status"><h2>{view.waiting ? 'ANOTHER TAB IS PROCESSING THIS INBOX' : view.activeId ? 'ANALYZING EMAIL' : view.syncing ? 'CHECKING INBOX' : view.ready ? 'INBOX MONITORING' : 'OPENING ENCRYPTED INBOX'}</h2><p className="muted">{completed} of {view.data.entries.length} assessed{failed ? ` · ${failed} need investigation after a processing error` : ''}. Checks every 30 seconds while open.</p></div><button aria-pressed={sound} onClick={toggleSound}>{sound ? 'Mute alert sounds' : 'Enable alert sounds'}</button></section>
      {risky.length > 0 && <div className="risk-notice" role="status"><strong>{risky.length} Risky {risky.length === 1 ? 'email' : 'emails'} detected.</strong> Verify independently before acting. <button onClick={() => setSelectedId(risky[0].summary.id)}>Review risky email</button></div>}
      <div className="mail-workspace"><section className="panel inbox"><div className="panel-heading"><h2>INBOX / LATEST 20</h2><button disabled={view.syncing || view.waiting || view.loginRequired} onClick={() => void monitor.current?.sync()}>Refresh</button></div>
        {!view.data.entries.length && <p className="muted">{view.ready ? 'No inbox messages found.' : 'Preparing your inbox…'}</p>}
        <ul className="mail-list">{view.data.entries.map(item => <li key={item.summary.id}><button className={`${entry?.summary.id === item.summary.id ? 'selected' : ''} ${item.category === 'risky' ? 'risky-mail' : ''}`} aria-pressed={entry?.summary.id === item.summary.id} onClick={() => setSelectedId(item.summary.id)}><strong>{item.summary.subject || '(No subject)'}</strong><span>{item.summary.sender}</span><small>{item.summary.date}</small><span className={`mail-badge ${item.category || 'pending'}`}>{item.category ? labels[item.category] : item.state === 'processing' ? 'Processing…' : 'Queued'}</span>{item.category && item.state === 'processing' && <small>Retrying analysis…</small>}</button></li>)}</ul>
        <p className="muted">Newest first. Emails outside this window are removed from the local content cache.</p>
      </section><div className="mail-detail"><section className="panel"><div className="panel-heading"><h2>SELECTED EMAIL</h2><span>01 / REVIEW</span></div>
        {entry ? <><h3 className="mail-subject">{entry.summary.subject || '(No subject)'}</h3><p className="muted">From: {entry.summary.sender}</p><p className="muted">{entry.summary.date}</p>{message ? <>{message.replyTo && <p className="muted">Reply-to: {message.replyTo}</p>}<pre className="mail-body">{message.body || 'No readable text body.'}</pre>{message.attachments.length > 0 && <p className="muted">Attachments: {message.attachments.join(', ')}</p>}{message.notes.map(note => <p className="muted" key={note}>{note}</p>)}</> : <p className="summary muted">{entry.state === 'error' ? 'This email could not be loaded or analyzed.' : entry.state === 'processing' ? 'Analysis is running. Content and results will appear when it finishes.' : 'This email is waiting for its turn.'}</p>}</> : <p className="muted">Your newest Inbox emails will appear here.</p>}
      </section><section className="panel assessment" aria-busy={entry?.state === 'processing'}><div className="panel-heading"><h2>ASSESSMENT</h2><span>02 / OUTPUT</span></div>
        {entry?.category ? <div><p className={`verdict ${entry.category}`}>{labels[entry.category]}</p>{entry.state === 'error' ? <><p className="summary">{entry.error} No safety conclusion was reached.</p><p className="muted">{entry.attempts < 3 ? 'Other emails continue processing. This message will retry automatically.' : 'Automatic retries have stopped for this message.'}</p><button className="retry-button" disabled={view.loginRequired} onClick={() => void monitor.current?.retry(entry.summary.id)}>Retry analysis</button></> : entry.category === 'safe' ? <><p className="summary">{message?.senderCheck?.reason}</p><p className="privacy">Safe under your trusted-sender policy. AI scanning was skipped; authenticated senders can still send unsafe content.</p></> : result ? <><p className="summary">{result.summary}</p><h3>Evidence in the message</h3>{result.findings.length ? <ul className="findings">{result.findings.map((finding, i) => <li key={i}><span className="eyebrow">{finding.field}</span><blockquote>{finding.quote}</blockquote><p>{finding.explanation}</p></li>)}</ul> : <p className="muted">{result.verdict === 'inconclusive' ? 'No reliable conclusion could be established. Investigate independently.' : 'No specific warning signs were identified in the available text.'}</p>}<h3>Recommended next steps</h3><ol className="recommendations">{result.recommendations.map(item => <li key={item}>{item}</li>)}</ol><p className="privacy">Advisory result. Linked websites and attachment contents have not been verified.</p></> : null}</div> : <div className="empty"><span className="terminal-mark" aria-hidden="true">[ S ]</span><h3>{entry?.state === 'processing' ? 'Examining your email…' : 'Waiting for analysis.'}</h3><p>Labels appear automatically. You can browse completed results while processing continues.</p></div>}
      </section></div></div>
      <p className="privacy">Email text is processed by the Protocol server and your configured Qwen service. The local cache is encrypted in this browser; closing the app pauses processing and reopening resumes it. Labels are shown in Protocol and do not change Gmail. Enable sounds to hear one alert for the initial scan and one for each later Risky arrival; past alerts are not replayed.</p>
    </> : <section className="panel welcome"><span className="terminal-mark">[ S ]</span><h2>YOUR INBOX. YOUR DECISION.</h2><p className="lead">Connect to automatically process the 20 latest Inbox emails, newest first.</p><p className="privacy">Email content and labels are stored encrypted on this device. Analysis sends email text to your configured Qwen service. Gmail access is read-only; no messages are sent, deleted, or modified.</p></section>}
    <div className="model-info"><p>{status?.message}{status?.model && <span> · {status.model}</span>}</p><button onClick={checkStatus}>Recheck model</button></div><footer className="footer"><span>SENTRI / PROTOCOL</span><span>LOCAL ENCRYPTED INBOX · GMAIL READ-ONLY</span></footer>
  </main>
}
