const loopback = new Set(['127.0.0.1', 'localhost', '[::1]'])

export function protocolOrigin() {
  const value = process.env.PROTOCOL_BASE_URL ?? 'http://127.0.0.1:3003'
  const url = new URL(value)
  const local = loopback.has(url.hostname)
  if (url.origin !== value || !['http:', 'https:'].includes(url.protocol) || (!local && url.protocol !== 'https:')) {
    throw new Error('PROTOCOL_BASE_URL must be an exact HTTPS origin (HTTP is allowed only for loopback development).')
  }
  return { origin: url.origin, host: url.host, local }
}

export function allowedMailbox(email: string) {
  const { local } = protocolOrigin()
  const emails = (process.env.PROTOCOL_ALLOWED_EMAILS ?? '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
  // Public access fails closed until the operator explicitly selects accounts.
  return (local && emails.length === 0) || emails.includes(email.trim().toLowerCase())
}

export function accessConfigured() {
  return protocolOrigin().local || Boolean(process.env.PROTOCOL_ALLOWED_EMAILS?.split(',').some(value => value.trim()))
}
