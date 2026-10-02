import { runPython, PythonError } from './python'
export { PythonError as HarnessError }

export function runHarness<T>(command: 'analyze' | 'status', input?: unknown, signal?: AbortSignal): Promise<T> {
  const root = process.env.SENTRI_HARNESS_PATH || '../ai-harness'
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, NODE_ENV: process.env.NODE_ENV, PYTHONDONTWRITEBYTECODE: '1' }
  for (const key of ['OLLAMA_HOST', 'SENTRI_MODEL']) if (process.env[key]) env[key] = process.env[key]
  return runPython<T>({ executable: process.env.SENTRI_PYTHON || 'python3', script: `${root}/protocol.py`, args: command === 'status' ? ['status'] : [], input, env, timeout: command === 'status' ? 8000 : undefined, signal })
}
