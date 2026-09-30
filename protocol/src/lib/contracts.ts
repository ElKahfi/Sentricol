export type EmailInput = { sender: string; replyTo: string; subject: string; body: string }
export type Analysis = {
  verdict: 'low-risk' | 'suspicious' | 'high-risk' | 'inconclusive'
  summary: string
  findings: { field: keyof EmailInput; quote: string; explanation: string }[]
  recommendations: string[]
}
export type ModelStatus = { ready: boolean; model?: string; message: string }

export const inputLimits = { sender: 320, replyTo: 320, subject: 500, body: 20000 }

export function parseEmail(value: unknown): EmailInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid email')
  const object = value as Record<string, unknown>
  if (Object.keys(object).some(key => !Object.hasOwn(inputLimits, key))) throw new Error('Invalid email')
  const result = {} as EmailInput
  for (const key of Object.keys(inputLimits) as (keyof EmailInput)[]) {
    const text = object[key] ?? ''
    if (typeof text !== 'string' || text.length > inputLimits[key]) throw new Error('Invalid email')
    result[key] = text.trim()
  }
  if (!result.body) throw new Error('Paste an email body first')
  return result
}
