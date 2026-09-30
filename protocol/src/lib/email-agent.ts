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
    summary: 'Clear — trusted sender, not scanned. This is a sender-policy decision, not a guarantee that the content is safe.',
  }
}
