import { createServer } from 'node:http'
import { timingSafeEqual } from 'node:crypto'

export async function openOAuthCallback({ state, signal, timeoutMs = 300000 }: { state: string; signal: AbortSignal; timeoutMs?: number }): Promise<{ redirectUri: string; code: Promise<string>; close(): Promise<void> }> {
  if (signal.aborted) throw new Error('Microsoft sign-in was cancelled.')
  if (!state || state.length > 1024) throw new Error('Invalid authorization state.')
  let done = false, resolveCode!: (value: string) => void, rejectCode!: (reason: Error) => void
  let timer: ReturnType<typeof setTimeout> | undefined
  const code = new Promise<string>((resolve, reject) => { resolveCode = resolve; rejectCode = reject })
  // Cancellation can precede the caller starting to await this promise.
  void code.catch(() => undefined)
  let redirectUri = ''
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    res.setHeader('Connection', 'close')
    const reply = (status: number, text: string) => { res.writeHead(status); res.end(text) }
    if (done) return reply(410, 'This sign-in attempt has ended.')
    if (req.method !== 'GET') return reply(405, 'Use the browser sign-in page.')
    let url: URL
    try { url = new URL(req.url || '/', redirectUri) } catch { return reply(400, 'Invalid request.') }
    const allowedHosts = [new URL(redirectUri).host, new URL(redirectUri.replace('localhost', '127.0.0.1')).host]
    if (!allowedHosts.includes(req.headers.host || '') || url.origin !== new URL(redirectUri).origin || url.pathname !== '/') return reply(404, 'Not found.')
    const keys = [...url.searchParams.keys()]
    if (new Set(keys).size !== keys.length) return reply(400, 'Invalid sign-in response.')
    const received = url.searchParams.get('state') || ''
    const a = Buffer.from(received), b = Buffer.from(state)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return reply(400, 'Invalid sign-in state. Return to the Microsoft page.')
    const value = url.searchParams.get('code'), error = url.searchParams.get('error')
    if ((!value && !error) || (value && error) || (value && value.length > 16384)) return reply(400, 'Invalid sign-in response.')
    reply(200, error ? 'Sign-in was not completed. Return to Orbit.' : 'Sign-in received. You can return to Orbit.')
    finish(error ? new Error('Microsoft sign-in was denied. Please try again.') : null, value || undefined)
  })
  const closeServer = () => { server.close(); server.closeIdleConnections() }
  const onAbort = () => finish(new Error('Microsoft sign-in was cancelled.'))
  function finish(error: Error | null, value?: string): void {
    if (done) return
    done = true; clearTimeout(timer); signal.removeEventListener('abort', onAbort); closeServer()
    if (error) rejectCode(error); else resolveCode(value!)
  }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
  })
  server.on('error', () => finish(new Error('Microsoft sign-in callback failed. Try again.')))
  const address = server.address()
  if (!address || typeof address === 'string') { closeServer(); throw new Error('Could not open Microsoft sign-in callback.') }
  redirectUri = `http://localhost:${address.port}/`
  signal.addEventListener('abort', onAbort, { once: true })
  timer = setTimeout(() => finish(new Error('Microsoft sign-in timed out. Start again.')), timeoutMs)
  if (signal.aborted) onAbort()
  return { redirectUri, code, close: async () => { finish(new Error('Microsoft sign-in was cancelled.')); closeServer() } }
}
