import { spawn } from 'node:child_process'

export class PythonError extends Error {
  constructor(message: string, public status = 503) { super(message) }
}

export function runPython<T>(options: { executable: string; script: string; args?: string[]; input?: unknown; env: NodeJS.ProcessEnv; timeout?: number; signal?: AbortSignal }): Promise<T> {
  const { signal } = options
  if (signal?.aborted) return Promise.reject(new PythonError('Request cancelled.'))
  return new Promise<T>((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ options.executable, ['-B', options.script, ...(options.args ?? [])], { env: options.env, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = '', bytes = 0, settled = false
    const finish = (error?: Error, result?: T) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      if (child.exitCode === null) child.kill('SIGKILL')
      if (error) reject(error)
      else resolve(result as T)
    }
    const abort = () => finish(new PythonError('Request cancelled.'))
    const timer = options.timeout == null ? undefined : setTimeout(() => finish(new PythonError('The request timed out. Please try again.')), options.timeout)
    signal?.addEventListener('abort', abort, { once: true })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      bytes += Buffer.byteLength(chunk)
      if (bytes > 200000) return finish(new PythonError('The service response was too large.'))
      output += chunk
    })
    child.stderr.resume()
    child.on('error', () => finish(new PythonError('Unable to start Python. Check the Python environment and setup.')))
    child.stdin.on('error', () => finish(new PythonError('Unable to submit the request to Python.')))
    child.on('close', code => {
      try {
        const result = JSON.parse(output)
        if (code !== 0 || result.error) return finish(new PythonError(typeof result.error === 'string' ? result.error : 'The service could not complete the request.', [401, 403, 404, 429, 502, 503].includes(result.status) ? result.status : 503))
        finish(undefined, result as T)
      } catch { finish(new PythonError('The service returned an invalid response.')) }
    })
    if (signal?.aborted) { abort(); return }
    child.stdin.end(JSON.stringify(options.input ?? {}))
  })
}
