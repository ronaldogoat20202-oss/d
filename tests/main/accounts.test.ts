import { beforeEach, expect, it, vi, type Mock } from 'vitest'
import { AccountService, type AuthPort } from '../../src/main/services/accounts'
const id = '00000000-0000-4000-8000-000000000001'
const session = { kind: 'microsoft' as const, accessToken: 'private-token', clientId: id, xuid: '12345', profile: { kind: 'microsoft' as const, id: 'a'.repeat(32), name: 'OrbitPlayer' } }
let port: AuthPort
let cache: { load: Mock<() => Promise<string | null>>; save: Mock<(value: string) => Promise<boolean>>; clear: Mock<() => Promise<void>> }
beforeEach(() => {
  port = { authenticate: vi.fn(async () => session), refresh: vi.fn(async () => session), serialize: () => 'cache', deserialize: vi.fn(), clear: vi.fn() }
  cache = { load: vi.fn<() => Promise<string | null>>(async () => null), save: vi.fn(async (_value: string) => true), clear: vi.fn(async () => {}) }
})
it('requires the user application ID and returns only a public Minecraft profile', async () => {
  const accounts = new AccountService(port, cache)
  await expect(accounts.signIn('', async () => {}, new AbortController().signal)).rejects.toThrow(/client ID/)
  expect(await accounts.signIn(id, async () => {}, new AbortController().signal)).toEqual(session.profile)
  expect(JSON.stringify(accounts.current())).not.toContain('private-token')
  expect(await accounts.session(id)).toMatchObject({kind:'microsoft',accessToken:'private-token'})
})
it.each(['expired', 'cancelled', 'Xbox denied', 'XSTS denied', 'no Minecraft entitlement', 'profile missing'])('leaves no account after authentication failure: %s', async reason => {
  port.authenticate = async () => { throw new Error(reason) }
  const accounts = new AccountService(port, cache)
  await expect(accounts.signIn(id, async () => {}, new AbortController().signal)).rejects.toThrow()
  expect(accounts.current()).toBeNull()
})
it('invalidates a sign-in that resolves after sign-out', async () => {
  let resolve!: (value: typeof session) => void
  port.authenticate = () => new Promise(r => { resolve = r })
  const accounts = new AccountService(port, cache)
  const pending = accounts.signIn(id, async () => {}, new AbortController().signal)
  await vi.waitFor(() => expect(resolve).toBeDefined())
  await accounts.signOut()
  resolve(session)
  await expect(pending).rejects.toThrow(/cancel/i)
  expect(accounts.current()).toBeNull()
  expect(cache.save).not.toHaveBeenCalled()
})
it('rejects a cancelled device request and clears invalid refresh state', async () => {
  const accounts = new AccountService(port, cache)
  const cancelled = AbortSignal.abort()
  await expect(accounts.signIn(id, async () => {}, cancelled)).rejects.toThrow(/cancel/i)
  await accounts.signIn(id, async () => {}, new AbortController().signal)
  port.refresh = async () => { throw new Error('expired refresh') }
  await expect(accounts.session(id)).rejects.toThrow(/sign in/i)
  expect(accounts.current()).toBeNull()
  expect(cache.clear).toHaveBeenCalled()
})
it('does not deserialize cache belonging to another application', async () => {
  cache.load.mockResolvedValue(JSON.stringify({ clientId: 'another', cache: 'old' }))
  await new AccountService(port, cache).session(id)
  expect(port.deserialize).not.toHaveBeenCalled()
})
