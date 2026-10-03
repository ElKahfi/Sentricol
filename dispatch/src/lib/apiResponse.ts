// Proxies can return HTML on a timeout and auth can expire between requests.
// Preserve status information instead of leaking JSON parse errors to the UI.
export async function readApiResponse<T>(response: Response): Promise<T> {
  let body: unknown
  try { body = await response.json() } catch {
    throw Object.assign(new Error(response.status === 401
      ? 'Your session expired. Please sign in again.'
      : 'The server did not return a valid response. Please retry.'), { status: response.status >= 400 ? response.status : 502 })
  }
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : `Request failed (${response.status}). Please retry.`
    throw Object.assign(new Error(response.status === 401 ? 'Your session expired. Please sign in again.' : message), { status: response.status })
  }
  return body as T
}
