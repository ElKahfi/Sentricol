import { runPython } from './python'

export type SenderCheck = { status: 'trusted' | 'scan-required'; senderAddress: string; reason: string; aiScanned: false }
export type MailSummary = { id: string; sender: string; subject: string; date: string }
export type GmailMessage = MailSummary & { replyTo: string; body: string; attachments: string[]; notes: string[]; senderCheck?: SenderCheck }
export type Inbox = { messages: MailSummary[]; nextPageToken: string }

export function gmailConfig() {
  const base = new URL(process.env.PROTOCOL_BASE_URL || 'http://127.0.0.1:3003')
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Protocol base URL must be a local origin.')
  return { baseUrl: base.origin, redirectUri: `${base.origin}/api/gmail/callback`, configured: Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim()) }
}

export function runGmail<T>(command: 'authorize' | 'exchange' | 'list' | 'get' | 'revoke', input: unknown, signal?: AbortSignal): Promise<T> {
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV, PYTHONDONTWRITEBYTECODE: '1' }
  if (command === 'authorize' || command === 'exchange') {
    env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID
    env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
  }
  if (command === 'get') env.PROTOCOL_TRUSTED_SENDERS_PATH = process.env.PROTOCOL_TRUSTED_SENDERS_PATH
  return runPython<T>({ executable: process.env.GMAIL_PYTHON || '.venv/bin/python', script: 'python/gmail.py', args: [command], input, env, timeout: 65000, signal })
}
