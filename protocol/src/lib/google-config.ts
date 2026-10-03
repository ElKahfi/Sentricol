export function googleCredentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || ''
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || ''
  const valid = /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId) && Boolean(clientSecret)
  return { clientId, clientSecret, valid }
}
