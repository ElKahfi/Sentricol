import { accountId, openVault } from './local-vault'
import { emptyQueue, finishEntry, mergeInbox, nextEntry, resumeQueue, type AnalysisResponse, type QueueData } from './inbox-queue'
import type { Inbox } from './gmail'

export type MonitorView = { data: QueueData; activeId: string; syncing: boolean; ready: boolean; error: string; loginRequired: boolean; waiting: boolean }
class ApiError extends Error { constructor(message: string, public status: number) { super(message) } }
export class InboxMonitor {
  private data = emptyQueue()
  private activeId = ''
  private syncing = false
  private ready = false
  private loginRequired = false
  private error = ''
  private stopped = false
  private blocked = false
  private abort = new AbortController()
  private vault?: Awaited<ReturnType<typeof openVault>>
  private writes: Promise<void> = Promise.resolve()
  private release?: () => void
  constructor(private email: string, private update: (view: MonitorView) => void, private alert: () => void) {}
  private emit(waiting = false) {
    if (!this.stopped) this.update({ data: structuredClone(this.data), activeId: this.activeId, syncing: this.syncing, ready: this.ready, error: this.error, loginRequired: this.loginRequired, waiting })
  }
  private async save() {
    const snapshot = structuredClone(this.data)
    // Serialize encryption + writes, so a slow older snapshot cannot overwrite new results.
    this.writes = this.writes.then(() => this.vault!.save(snapshot))
    try { await this.writes }
    catch { this.blocked = true; this.error = 'Encrypted local storage could not be saved. Processing paused. Check browser storage and reopen Protocol.'; this.emit(); throw new Error(this.error) }
    this.emit()
  }
  private async api<T>(url: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers)
    headers.set('x-protocol-mailbox', this.email)
    const response = await fetch(url, { ...init, headers, cache: 'no-store', signal: this.abort.signal })
    const data = await response.json()
    if (!response.ok) {
      if (response.status === 401 || response.status === 403 || response.status === 409) this.loginRequired = true
      throw new ApiError(data.error || 'The request could not complete.', response.status)
    }
    return data
  }
  async start() {
    try {
      if (!navigator.locks) throw new Error('This browser cannot coordinate local processing. Use a current browser with Web Locks support.')
      const id = await accountId(this.email)
      if (this.stopped) return
      this.emit(true)
      await navigator.locks.request('sentri-protocol:' + id, { signal: this.abort.signal }, async () => {
        if (this.stopped) return
        this.vault = await openVault(id)
        try {
          const saved = await this.vault.load()
          if (this.stopped) return
          this.data = saved ? resumeQueue(saved) : emptyQueue()
          this.emit()
          await this.sync()
          const interval = window.setInterval(() => { void this.sync() }, 30000)
          const onVisible = () => { if (document.visibilityState === 'visible') void this.sync() }
          document.addEventListener('visibilitychange', onVisible)
          await new Promise<void>(resolve => { this.release = resolve; if (this.stopped) resolve() })
          clearInterval(interval)
          document.removeEventListener('visibilitychange', onVisible)
          // Let pending commits finish before releasing this account's cross-tab lock.
          await this.writes.catch(() => {})
        } finally { this.vault.close(); this.vault = undefined }
      })
    } catch (failure) {
      if (!this.stopped) { this.blocked = true; this.error = failure instanceof Error ? failure.message : 'Encrypted local inbox could not be opened.'; this.emit() }
    }
  }
  stop() { this.stopped = true; this.abort.abort(); this.release?.() }
  async sync() {
    if (this.stopped || this.blocked || this.syncing || this.loginRequired || !this.vault) return
    this.syncing = true; this.emit()
    try {
      const inbox = await this.api<Inbox>('/api/gmail/messages')
      if (this.stopped) return
      this.data = mergeInbox(this.data, inbox.messages)
      this.ready = true; this.error = ''
      await this.save()
    } catch (failure) {
      if (!this.stopped && !this.blocked) this.error = failure instanceof Error ? failure.message : 'Inbox refresh failed.'
    } finally {
      this.syncing = false; this.emit()
      if (!this.stopped && this.ready && !this.loginRequired) void this.process()
    }
  }
  async retry(id: string) {
    if (this.stopped || this.blocked || this.loginRequired || !this.ready) return
    const entry = this.data.entries.find(item => item.summary.id === id && item.state === 'error')
    if (!entry) return
    entry.state = 'queued'; entry.attempts = 0; entry.error = undefined
    try { await this.save(); void this.process() } catch { /* save reports the storage error */ }
  }
  private async process() {
    if (this.activeId || this.stopped || this.blocked || this.loginRequired) return
    const entry = nextEntry(this.data)
    if (!entry) return
    const id = entry.summary.id
    this.activeId = id; entry.state = 'processing'; entry.attempts++
    try {
      await this.save()
      if (this.stopped) return
      let result: AnalysisResponse
      try {
        result = await this.api<AnalysisResponse>('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: id }) })
      } catch (failure) {
        if (this.stopped) return
        const current = this.data.entries.find(item => item.summary.id === id)
        if (current) {
          current.state = 'error'; current.category = 'investigate'
          current.error = failure instanceof Error ? failure.message : 'Analysis could not complete.'
          current.retryAt = Date.now() + Math.min(300000, 60000 * current.attempts)
          if (failure instanceof ApiError && failure.status === 404) current.attempts = 3
        }
        await this.save()
        return
      }
      if (this.stopped) return
      const shouldAlert = finishEntry(this.data, id, result)
      // Commit the result and notification history together before playing sound.
      await this.save()
      if (shouldAlert && !this.stopped) this.alert()
    } catch { /* storage failure has paused and reported itself */ }
    finally {
      this.activeId = ''; this.emit()
      if (!this.stopped && !this.blocked && !this.loginRequired) void this.process()
    }
  }
}
