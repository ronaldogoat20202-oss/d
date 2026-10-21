import { afterEach, expect, it, vi } from 'vitest'
import { openOAuthCallback } from '../../src/main/services/oauth-callback'
import { MinecraftAuthAdapter } from '../../src/main/adapters/minecraft-auth'
import { PublicClientApplication } from '@azure/msal-node'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { await Promise.all(cleanups.splice(0).map(fn => fn())); vi.restoreAllMocks() })
async function callback(signal = new AbortController().signal, timeoutMs = 5000) {
  const c = await openOAuthCallback({ state: 'expected-state', signal, timeoutMs }); cleanups.push(c.close); return c
}
it('accepts the real callback after wrong-state traffic and closes the listener', async () => {
  const c = await callback()
  expect((await fetch(c.redirectUri + '?state=wrong&code=secret')).status).toBe(400)
  expect((await fetch(c.redirectUri + '?state=expected-state&code=valid-code')).status).toBe(200)
  await expect(c.code).resolves.toBe('valid-code')
  await expect(fetch(c.redirectUri)).rejects.toThrow()
})
it.each(['/wrong?state=expected-state&code=x', '/?state=expected-state&code=a&code=b', '/?state=expected-state&state=other&code=a', '/?state=expected-state&code=a&error=denied'])('rejects malformed callback %s without consuming the attempt', async path => {
  const c = await callback()
  expect((await fetch(new URL(path, c.redirectUri))).status).toBeGreaterThanOrEqual(400)
  await fetch(c.redirectUri + '?state=expected-state&code=valid-code')
  await expect(c.code).resolves.toBe('valid-code')
})
it('rejects non-GET requests', async () => {
  const c = await callback()
  expect((await fetch(c.redirectUri, { method: 'POST' })).status).toBe(405)
})
it('returns generic provider denial without exposing the callback value', async () => {
  const c = await callback(); const result = c.code.catch(e => e)
  await fetch(c.redirectUri + '?state=expected-state&error=secret-denial&error_description=private')
  expect((await result).message).toMatch(/denied|sign.in/i)
  expect((await result).message).not.toMatch(/secret|private|expected-state/)
})
it('releases the socket on cancellation and explicit close', async () => {
  const abort = new AbortController(); const c = await callback(abort.signal)
  const result = c.code.catch(e => e); abort.abort()
  expect((await result).message).toMatch(/cancel/i)
  await c.close(); await expect(fetch(c.redirectUri)).rejects.toThrow()
})
it('expires with a bounded deadline and rejects an already aborted signal', async () => {
  const c = await callback(undefined, 20)
  await expect(c.code).rejects.toThrow(/expired|timed/i)
  await expect(fetch(c.redirectUri)).rejects.toThrow()
  await expect(callback(AbortSignal.abort())).rejects.toThrow(/cancel/i)
})
it('closes the real callback if opening the system browser fails', async () => {
  let redirect = ''
  vi.spyOn(PublicClientApplication.prototype, 'getAuthCodeUrl').mockImplementation(async request => { redirect = request.redirectUri; return 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize' })
  const adapter = new MinecraftAuthAdapter()
  await expect(adapter.authenticate('00000000-0000-4000-8000-000000000001', async () => { throw new Error('browser failed') }, new AbortController().signal)).rejects.toThrow(/sign.in|browser/i)
  expect(redirect).toMatch(/^http:\/\/localhost:\d+\/$/)
  await expect(fetch(redirect)).rejects.toThrow()
})
