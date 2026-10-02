import { spawn } from 'node:child_process'
import path from 'node:path'
import { NextRequest, NextResponse } from 'next/server'
import { currentPlayer } from '@/lib/player-auth'
import { harnessProfile } from '@/lib/harnessProfile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const player = await currentPlayer()
  if (!player) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
  if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  let messages
  try {
    const body = await request.text()
    if (body.length > 100000) throw new Error()
    messages = JSON.parse(body).messages
    if (!Array.isArray(messages) || !messages.length || messages.length > 12 || messages.at(-1)?.role !== 'user' || messages.some(item => !item || !['user', 'assistant'].includes(item.role) || typeof item.content !== 'string' || !item.content.trim() || item.content.length > 12000)) throw new Error()
  } catch { return NextResponse.json({ error: 'Please send a message of up to 12,000 characters.' }, { status: 400 }) }
  let profile
  try { profile = await harnessProfile(player) }
  catch { return NextResponse.json({ error: 'Your training profile is unavailable.' }, { status: 503 }) }
  const child = spawn(process.env.SENTRI_PYTHON ?? 'python3', ['-u', path.join(/* turbopackIgnore: true */ process.cwd(), 'py', 'harness_bridge.py')], { stdio: ['pipe', 'pipe', 'pipe'] })
  const encoder = new TextEncoder()
  let finished = false
  let timer: ReturnType<typeof setTimeout>
  let abort: () => void = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const end = (message?: string) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        request.signal.removeEventListener('abort', abort)
        if (message) controller.enqueue(encoder.encode(JSON.stringify({ type: 'error', message }) + '\n'))
        controller.close()
        child.kill()
      }
      abort = () => end()
      request.signal.addEventListener('abort', abort, { once: true })
      timer = setTimeout(() => end('SENTRI took too long to respond. Please try again.'), 315000)
      child.stdout.on('data', chunk => { if (!finished) controller.enqueue(new Uint8Array(chunk)) })
      child.stderr.resume()
      child.on('error', () => end('Unable to start SENTRI. Check the server’s Python configuration.'))
      child.on('close', code => end(code ? 'The AI connection ended unexpectedly. Please try again.' : undefined))
      child.stdin.on('error', () => end('Unable to connect to SENTRI.'))
      if (request.signal.aborted) { end(); return }
      child.stdin.end(JSON.stringify({ operation: 'chat', profile, messages }))
    },
    cancel() { finished = true; clearTimeout(timer); request.signal.removeEventListener('abort', abort); child.kill() },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } })
}
