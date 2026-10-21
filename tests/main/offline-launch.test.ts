import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { generateArguments } from '@xmcl/core'
import { AccountStore, offlineUuid } from '../../src/main/services/account-store'
import { AccountService } from '../../src/main/services/accounts'
import { InstallService } from '../../src/main/services/installer'
import { makeLaunchOptions } from '../../src/main/adapters/minecraft-launcher'
import { minecraftFixture } from '../fixtures/minecraft'
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'orbit-local-')); roots.push(root)
  const online = { kind: 'microsoft' as const, clientId: '00000000-0000-4000-8000-000000000001', xuid: '123', accessToken: 'secret', profile: { kind: 'microsoft' as const, id: 'a'.repeat(32), name: 'Online' } }
  const auth = { authenticate: vi.fn(async () => online), refresh: vi.fn(async () => online), serialize: () => 'cache', deserialize: () => {}, clear: () => {} }
  const cache = { save: vi.fn(async () => true), load: vi.fn(async () => null), clear: vi.fn(async () => {}) }
  const store = new AccountStore(root), service = new AccountService(auth, cache, store)
  return { root, service, store, auth, cache, online }
}
it('restores a selected offline account and generates explicit legacy arguments without Microsoft tokens', async () => {
  const { root, service, store, auth } = await setup()
  const profile = await service.createOffline('Notch')
  const session = await service.session('')
  expect(session).toEqual({ kind: 'offline', profile })
  expect(auth.refresh).not.toHaveBeenCalled()
  expect((await store.read()).selected?.id).toBe(offlineUuid('Notch'))
  const fixture = minecraftFixture()
  const version = await new InstallService(fixture.fetcher).ensure(fixture.release, root, () => {})
  const args = await generateArguments(await makeLaunchOptions({ settings: { clientId: '', javaPath: '/java', gameDirectory: root, maxMemoryMiB: 2048 }, version, session }))
  expect(args).toContain('Notch'); expect(args).toContain(offlineUuid('Notch'))
  expect(args).toContain('legacy'); expect(args).toContain('0')
  expect(args.join(' ')).not.toMatch(/\$\{[^}]+\}|secret/)
})
it('keeps remembered Microsoft credentials when explicitly switching local and removes them on explicit removal', async () => {
  const { service, cache, online } = await setup()
  const local = await service.createOffline('Local')
  await service.signIn(online.clientId, async () => {}, new AbortController().signal)
  await service.select('offline', local.id)
  expect(cache.clear).not.toHaveBeenCalled()
  expect((await service.index()).accounts).toHaveLength(2)
  await service.remove('microsoft', online.profile.id)
  expect(cache.clear).toHaveBeenCalled()
  expect((await service.index()).accounts).toHaveLength(1)
})
it('does not fall back to local after a failed Microsoft login', async () => {
  const { service, auth, online } = await setup()
  await service.createOffline('Local')
  auth.authenticate.mockRejectedValueOnce(new Error('denied'))
  await expect(service.signIn(online.clientId, async () => {}, new AbortController().signal)).rejects.toThrow()
  expect(service.current()).toBeNull()
  expect((await service.index()).selected).toBeNull()
})
