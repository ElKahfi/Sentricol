const test = require('node:test')
const assert = require('node:assert/strict')
const createLoader = require('./load-typescript.cjs')
const mail = n => ({ id: String(n), receivedAt: n, sender: '', subject: '', date: '' })
const answer = id => ({ message: { ...mail(Number(id)), body: 'Test', attachments: [], notes: [] }, skipped: false, analysis: { verdict: 'high-risk', summary: 'Test', findings: [], recommendations: [] } })
const until = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setImmediate(resolve)) }; assert.fail('Condition did not become true') }

test('monitor processes serially, prioritizes new arrivals, saves alerts, and resumes without repeating work', async () => {
  const original = { fetch: global.fetch, navigator: Object.getOwnPropertyDescriptor(global, 'navigator'), window: global.window, document: global.document }
  let stored, latest = [mail(2), mail(1)], pending = [], calls = [], alerts = 0, view, closed = false
  Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: { request: async (_name, _options, callback) => callback() } } })
  global.window = { setInterval: () => 1 }
  global.document = { addEventListener() {}, removeEventListener() {} }
  global.fetch = async (url, options) => {
    if (url === '/api/gmail/messages') return { ok: true, json: async () => ({ messages: latest }) }
    const id = JSON.parse(options.body).messageId
    calls.push(id)
    return new Promise(resolve => pending.push(() => resolve({ ok: true, json: async () => answer(id) })))
  }
  const { InboxMonitor } = createLoader({ './local-vault': {
    accountId: async () => 'account', openVault: async () => ({ load: async () => stored || null, save: async value => { stored = structuredClone(value) }, close() { closed = true } }),
  } })('lib/inbox-monitor.ts')
  let monitor
  try {
    monitor = new InboxMonitor('test@example.test', value => { view = value }, () => { assert.ok(stored.alertedIds.length); alerts++ })
    const running = monitor.start()
    await until(() => calls.length === 1)
    latest = [mail(3), mail(2), mail(1)]
    await monitor.sync()
    assert.deepEqual(calls, ['2'])
    assert.equal(view.activeId, '2')
    pending.shift()()
    await until(() => calls.length === 2)
    assert.deepEqual(calls, ['2', '3'])
    pending.shift()()
    await until(() => calls.length === 3)
    pending.shift()()
    await until(() => view.data.entries.every(item => item.state === 'done'))
    assert.equal(alerts, 2) // one initial batch, one new arrival
    monitor.stop(); await running
    assert.equal(closed, true)
    monitor = new InboxMonitor('test@example.test', value => { view = value }, () => alerts++)
    const resumed = monitor.start()
    await until(() => view.ready && !view.syncing)
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(calls, ['2', '3', '1'])
    assert.equal(alerts, 2)
    monitor.stop(); await resumed
  } finally {
    monitor?.stop(); global.fetch = original.fetch
    Object.defineProperty(global, 'navigator', original.navigator)
    global.window = original.window; global.document = original.document
  }
})
