import { runPython } from './python'
import { protocolOrigin, accessConfigured } from './access-config'

export type SenderCheck = { status: 'trusted' | 'scan-required'; senderAddress: string; reason: string; aiScanned: false }
export type MailSummary = { id: string; sender: string; subject: string; date: string; receivedAt?: number }
export type GmailMessage = MailSummary & { replyTo: string; body: string; attachments: string[]; notes: string[]; senderCheck?: SenderCheck }
export type Inbox = { messages: MailSummary[]; nextPageToken: string }

export function gmailConfig() {
  const { origin } = protocolOrigin()
  return { baseUrl: origin, redirectUri: `${origin}/api/gmail/callback`, configured: Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim() && accessConfigured()) }
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
