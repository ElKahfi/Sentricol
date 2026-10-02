import type { Analysis } from './contracts'
import type { GmailMessage, MailSummary } from './gmail'

export const labels = {
  safe: 'Safe', review: 'Safe but requires investigation', investigate: 'Requires investigation', risky: 'Risky', spam: 'Spam',
} as const
export type Category = keyof typeof labels
export type AnalysisResponse = { message: GmailMessage; analysis: Analysis | null; skipped: boolean }
export type Entry = {
  summary: MailSummary; state: 'queued' | 'processing' | 'done' | 'error'
  message?: GmailMessage; analysis?: Analysis | null; category?: Category
  error?: string; attempts: number; retryAt?: number
}
export type QueueData = {
  version: 1; entries: Entry[]; initialized: boolean
  initialIds: string[]; initialAlerted: boolean; alertedIds: string[]
}
export function emptyQueue(): QueueData {
  return { version: 1, entries: [], initialized: false, initialIds: [], initialAlerted: false, alertedIds: [] }
}
export function mergeInbox(data: QueueData, messages: MailSummary[]): QueueData {
  const latest = [...new Map(messages.map(item => [item.id, item])).values()]
    .sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0)).slice(0, 20)
  const previous = new Map(data.entries.map(item => [item.summary.id, item]))
  return {
    ...data, initialized: true,
    initialIds: data.initialized ? data.initialIds : latest.map(item => item.id),
    entries: latest.map(summary => ({ ...(previous.get(summary.id) || { state: 'queued', attempts: 0 }), summary })),
  }
}
export function nextEntry(data: QueueData, now = Date.now()): Entry | undefined {
  // New mail always precedes retries; the controller never replaces an active request.
  return data.entries.find(item => item.state === 'queued') || data.entries.find(item => item.state === 'error' && item.attempts < 3 && (item.retryAt || 0) <= now)
}
export function categoryFor(result: AnalysisResponse): Category {
  if (result.skipped && result.message.senderCheck?.status === 'trusted') return 'safe'
  switch (result.analysis?.verdict) {
    case 'low-risk': return 'review'
    case 'suspicious': case 'high-risk': return 'risky'
    case 'spam': return 'spam'
    default: return 'investigate'
  }
}
export function finishEntry(data: QueueData, id: string, result: AnalysisResponse): boolean {
  const entry = data.entries.find(item => item.summary.id === id)
  if (!entry) return false // It left the latest-20 window while its request finished.
  Object.assign(entry, { state: 'done', message: result.message, analysis: result.analysis, category: categoryFor(result), error: undefined, retryAt: undefined })
  if (entry.category !== 'risky' || data.alertedIds.includes(id)) return false
  data.alertedIds = [...data.alertedIds, id].slice(-1000)
  if (data.initialIds.includes(id)) {
    if (data.initialAlerted) return false
    data.initialAlerted = true
  }
  return true
}
export function resumeQueue(data: QueueData): QueueData {
  if (data.version !== 1 || !Array.isArray(data.entries) || data.entries.length > 20) throw new Error('Unsupported local inbox data.')
  return { ...data, entries: data.entries.map(item => item.state === 'processing' ? { ...item, state: 'queued' } : item) }
}
