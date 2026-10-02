import type { GmailMessage } from './gmail'

/** Only server-fetched sender evidence may trigger a skip; Qwen cannot approve it. */
export function trustedSenderResult(message: GmailMessage) {
  if (message.senderCheck?.status !== 'trusted') return null
  return {
    verdict: 'clear' as const,
    skipped: true as const,
    analysis: null,
    senderCheck: message.senderCheck,
    notes: message.notes,
    summary: 'Safe under your trusted-sender policy; content was not scanned. This does not guarantee that the email is harmless.',
  }
}
