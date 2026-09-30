'use client'
import { useEffect, useRef, useState } from 'react'
import type { Analysis, ModelStatus } from '@/lib/contracts'
import type { GmailMessage, Inbox, MailSummary } from '@/lib/gmail'
type Account = { configured: boolean; connected: boolean; email?: string; baseUrl: string; redirectUri: string }
const verdictNames = { 'low-risk': 'Low risk indicators', suspicious: 'Verification recommended', 'high-risk': 'High risk indicators', inconclusive: 'Not enough information' }
export default function Home() {
  const [account, setAccount] = useState<Account | null>(null)
  const [status, setStatus] = useState<ModelStatus | null>(null)
  const [messages, setMessages] = useState<MailSummary[]>([])
  const [nextPage, setNextPage] = useState('')
  const [message, setMessage] = useState<GmailMessage | null>(null)
  const [result, setResult] = useState<Analysis | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const active = useRef<AbortController | null>(null)
  const locked = useRef(false)
  function clearMail() { setMessages([]); setNextPage(''); setMessage(null); setResult(null) }
  async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { ...init, cache: 'no-store' })
    const data = await response.json()
    if (!response.ok) {
      if (response.status === 401) { clearMail(); setAccount(current => current && ({ ...current, connected: false, email: undefined })) }
      throw new Error(data.error || 'The request could not complete.')
    }
    return data
  }
  async function work(label: string, action: (signal: AbortSignal) => Promise<void>) {
    if (locked.current) return
    locked.current = true
    const controller = new AbortController()
    active.current = controller
    setBusy(label); setError('')
    try { await action(controller.signal) }
    catch (failure) { setError(controller.signal.aborted ? 'Request cancelled.' : failure instanceof Error ? failure.message : 'Unable to connect. Try again.') }
    finally { active.current = null; locked.current = false; setBusy('') }
  }
  async function checkStatus() {
    try { setStatus(await api<ModelStatus>('/api/status')) }
    catch { setStatus({ ready: false, message: 'Model connection unavailable.' }) }
  }
  async function loadInbox(signal: AbortSignal, pageToken = '') {
    const data = await api<Inbox>('/api/gmail/messages' + (pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ''), { signal })
    setMessages(current => pageToken ? [...current, ...data.messages.filter(item => !current.some(old => old.id === item.id))] : data.messages)
    setNextPage(data.nextPageToken)
  }
  useEffect(() => {
    const controller = new AbortController()
    const reason = new URLSearchParams(window.location.search).get('gmail')
    if (reason) {
      window.history.replaceState(null, '', window.location.pathname)
      if (reason !== 'connected') setError(reason === 'denied' ? 'Google access was cancelled.' : 'Google sign-in could not complete. Check your OAuth setup and try again.')
    }
    void api<Account>('/api/gmail/session', { signal: controller.signal }).then(async data => {
      setAccount(data)
      if (data.connected) await work('Loading inbox…', signal => loadInbox(signal))
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message) })
    void checkStatus()
    return () => { controller.abort(); active.current?.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function connect() {
    if (!account) return
    if (window.location.origin !== account.baseUrl) { window.location.assign(account.baseUrl); return }
    void work('Opening Google…', async signal => {
      const data = await api<{ url: string }>('/api/gmail/connect', { method: 'POST', signal })
      window.location.assign(data.url)
    })
  }
  function disconnect() {
    void work('Disconnecting…', async signal => {
      const data = await api<{ revoked: boolean }>('/api/gmail/disconnect', { method: 'POST', signal })
      clearMail(); setAccount(current => current && ({ ...current, connected: false, email: undefined }))
      if (!data.revoked) setError('Disconnected locally. Google could not confirm revocation; remove access from your Google Account connections if needed.')
    })
  }
  function select(id: string) {
    setResult(null); setMessage(null)
    void work('Opening email…', async signal => setMessage(await api<GmailMessage>(`/api/gmail/message?id=${encodeURIComponent(id)}`, { signal })))
  }
  function analyze() {
    if (!message) return
    setResult(null)
    void work('Analyzing with Qwen…', async signal => {
      const data = await api<{ analysis: Analysis | null; notes: string[]; senderCheck?: GmailMessage['senderCheck'] }>('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: message.id }), signal })
      setResult(data.analysis); setMessage(current => current && ({ ...current, notes: data.notes, senderCheck: data.senderCheck }))
    })
  }
  return <main className="shell">
    <header className="topbar"><div className="brand">SENTRI <span>/ PROTOCOL</span></div><span className={`status ${status?.ready ? 'ready' : ''}`}><span className="status-dot" />{!status ? 'CHECKING MODEL' : status.ready ? 'MODEL CONNECTED' : 'MODEL OFFLINE'}</span></header>
    <section className="intro"><p className="eyebrow">GMAIL / EMAIL INVESTIGATION</p><h1>Check before <em>you act.</em></h1><p className="lead">Connect your Gmail, select a message, and examine its warning signs with SENTRI.</p></section>
    <section className="panel account"><div><h2>{account?.connected ? account.email : 'CONNECT YOUR GMAIL'}</h2><p className="muted">{account?.connected ? 'Read-only access · Session ends after about one hour or a server restart.' : 'Sign in securely with Google. SENTRI never receives your Google password.'}</p></div><button className="primary" disabled={!!busy || !account || (!account.connected && !account.configured)} onClick={account?.connected ? disconnect : connect}>{account?.connected ? '[ DISCONNECT ]' : '[ SIGN IN WITH GOOGLE ]'}</button></section>
    {account && !account.configured && <section className="panel setup"><h2>GOOGLE SETUP REQUIRED</h2><p>Create a Web application OAuth client, enable the Gmail API, and add your email as a test user in Google Auth Platform.</p><p>Authorized redirect URI: <code>{account.redirectUri}</code></p><p>Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to protocol/.env.local, then restart this app. Full steps are in protocol/README.md.</p><a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">Open Google Auth Platform ↗</a></section>}
    {busy && <div className="working" role="status"><span>{busy}{busy.startsWith('Analyzing') && ' This may take up to two minutes.'}</span>{busy.startsWith('Analyzing') && <button onClick={() => active.current?.abort()}>Cancel</button>}</div>}
    {error && <p className="error" role="alert">{error}</p>}
    {account?.connected ? <div className="mail-workspace"><section className="panel inbox"><div className="panel-heading"><h2>INBOX</h2><button disabled={!!busy} onClick={() => { setMessage(null); setResult(null); void work('Refreshing inbox…', signal => loadInbox(signal)) }}>Refresh</button></div>
      {!messages.length && <p className="muted">{busy ? 'Loading messages…' : 'No inbox messages found.'}</p>}
      <ul className="mail-list">{messages.map(item => <li key={item.id}><button className={message?.id === item.id ? 'selected' : ''} aria-pressed={message?.id === item.id} disabled={!!busy} onClick={() => select(item.id)}><strong>{item.subject || '(No subject)'}</strong><span>{item.sender}</span><small>{item.date}</small></button></li>)}</ul>
      {nextPage && <button disabled={!!busy} onClick={() => void work('Loading more…', signal => loadInbox(signal, nextPage))}>Load more messages</button>}
    </section><div className="mail-detail"><section className="panel"><div className="panel-heading"><h2>SELECTED EMAIL</h2><span>01 / REVIEW</span></div>
      {message ? <><h3 className="mail-subject">{message.subject || '(No subject)'}</h3><p className="muted">From: {message.sender}</p>{message.replyTo && <p className="muted">Reply-to: {message.replyTo}</p>}<p className="muted">{message.date}</p><pre className="mail-body">{message.body || 'No readable text body.'}</pre>{message.attachments.length > 0 && <p className="muted">Attachments: {message.attachments.join(', ')}</p>}{message.notes.map(note => <p className="muted" key={note}>{note}</p>)}<p className="muted">{message.senderCheck?.reason}</p><p className="privacy">For senders requiring detection, Analyze sends this selected email’s sender, subject and text to your configured Qwen server. Protocol saves no email history. Links and remote images are never opened.</p>{message.senderCheck?.status !== 'trusted' && <div className="actions"><button className="primary" disabled={!!busy || !message.body.trim()} onClick={analyze}>[ ANALYZE WITH QWEN ]</button></div>}</> : <p className="muted">Select an inbox message to preview it safely as text.</p>}
    </section><section className="panel assessment" aria-busy={busy.startsWith('Analyzing')}><div className="panel-heading"><h2>ASSESSMENT</h2><span>02 / OUTPUT</span></div>
      {message?.senderCheck?.status === 'trusted' ? <div aria-live="polite"><p className="verdict">Clear — trusted sender</p><p className="summary">{message.senderCheck.reason}</p><p className="privacy">Not scanned by AI. An approved and authenticated sender can still send unsafe content. This status reflects your sender policy.</p></div> : result ? <div aria-live="polite"><p className={`verdict ${result.verdict}`}>{verdictNames[result.verdict]}</p><p className="summary">{result.summary}</p><h3>Evidence in the message</h3>{result.findings.length ? <ul className="findings">{result.findings.map((finding, i) => <li key={i}><span className="eyebrow">{finding.field}</span><blockquote>{finding.quote}</blockquote><p>{finding.explanation}</p></li>)}</ul> : <p className="muted">No specific warning signs were identified in the supplied text.</p>}<h3>Recommended next steps</h3><ol className="recommendations">{result.recommendations.map((item, i) => <li key={i}>{item}</li>)}</ol><p className="privacy">Advisory result, not a guarantee. Sender checks could not establish a trusted match. Destination websites and attachment contents have not been verified.</p></div> : <div className="empty"><span className="terminal-mark" aria-hidden="true">[ S ]</span><h3>{busy.startsWith('Analyzing') ? 'Examining your email…' : 'Ready for a closer look.'}</h3><p>Approved, authenticated senders are cleared automatically. Other messages can be analyzed with Qwen.</p></div>}
    </section></div></div> : <section className="panel welcome"><span className="terminal-mark">[ S ]</span><h2>YOUR INBOX. YOUR DECISION.</h2><p className="lead">Read and analyze selected messages without granting permission to send, delete, or modify mail.</p><p className="privacy">This local prototype processes Gmail data in the Protocol server and selected email text in your configured AI service. Access tokens stay in server memory; restarting the server requires signing in again.</p></section>}
    <div className="model-info"><p>{status?.message}{status?.model && <span> · {status.model}</span>}</p><button disabled={!!busy} onClick={checkStatus}>Recheck model</button></div><footer className="footer"><span>SENTRI / PROTOCOL</span><span>LOCAL PREVIEW · GMAIL READ-ONLY</span></footer>
  </main>
}
