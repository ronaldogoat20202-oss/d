import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Controller, type ControllerDependencies } from '../../src/main/controller'
import { SettingsStore } from '../../src/main/services/settings'
import { InstallService } from '../../src/main/services/installer'
import { JavaService } from '../../src/main/services/java'
import { AccountStore } from '../../src/main/services/account-store'
import { AccountService } from '../../src/main/services/accounts'
import { LogService } from '../../src/main/services/logs'
import { minecraftFixture } from '../fixtures/minecraft'
import type { JavaRuntime } from '../../src/main/services/types'
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.map(root => rm(root, { recursive: true, force: true }))) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'orbit-controller-')); roots.push(root)
  const fixture = minecraftFixture()
  const runtime = { platform: 'win32' as const, architecture: 'x64', totalMemoryBytes: 8 * 1024 ** 3 }
  const id = '00000000-0000-4000-8000-000000000001'
  const session = { kind: 'microsoft' as const, clientId: id, xuid: '12345', accessToken: 'private-token', profile: { kind: 'microsoft' as const, id: 'a'.repeat(32), name: 'OrbitPlayer' } }
  const installer = new InstallService(fixture.fetcher, { name: 'windows', arch: 'x64', version: '10.0.0' })
  const deps: ControllerDependencies = {
    settings: new SettingsStore(root, runtime),
    versions: { list: async () => ({ releases: [fixture.release], latestReleaseId: 'fixture', cached: false }) },
    installer, runtime,
    java: new JavaService(async () => 'java.version = 21.0.1\nos.arch = amd64'),
    accounts: new AccountService({ authenticate: async () => session, refresh: async () => session, serialize: () => 'cache', deserialize: () => {}, clear: () => {} }, { load: async () => null, save: async () => false, clear: async () => {} }, new AccountStore(root)),
    logs: new LogService(), launch: vi.fn(async () => ({} as never))
  }
  const controller = new Controller(deps)
  vi.spyOn(deps.java, 'detect').mockResolvedValue([])
  await controller.initialize(); await controller.refreshVersions()
  return { controller, deps, id }
}
it('installs without account/Java and blocks duplicate operations and busy configuration changes', async () => {
  const { controller, deps } = await setup()
  const ensure = vi.spyOn(deps.installer, 'ensure')
  const results = await Promise.allSettled([controller.install(), controller.install(), controller.saveSettings({ javaPath: '/new/java' })])
  expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected', 'rejected'])
  expect(ensure).toHaveBeenCalledTimes(1)
  expect((await controller.snapshot()).installedVersionIds).toContain('fixture')
  await expect(controller.launch()).rejects.toThrow(/account|sign in|client ID/i)
})
it('requires Java and refreshes authentication before spawning; resets after game exits', async () => {
  const { controller, deps, id } = await setup()
  await controller.install(); await controller.saveSettings({ clientId: id }); await controller.signIn()
  await expect(controller.launch()).rejects.toThrow(/Java|executable/i)
  await controller.saveSettings({ javaPath: '/java21' })
  await controller.launch()
  expect((await controller.snapshot()).operation.phase).toBe('running')
  await expect(controller.launch()).rejects.toThrow(/progress|running|busy/i)
  const input = vi.mocked(deps.launch).mock.calls[0][0]
  input.onExit(0)
  expect((await controller.snapshot()).operation.phase).toBe('idle')
  expect(JSON.stringify(await controller.snapshot())).not.toContain('private-token')
})
it('releases busy state after a spawn error and reports a nonzero exit', async () => {
  const { controller, deps, id } = await setup()
  await controller.install(); await controller.saveSettings({ clientId: id, javaPath: '/java21' }); await controller.signIn()
  vi.mocked(deps.launch).mockRejectedValueOnce(new Error('Minecraft could not start.'))
  await expect(controller.launch()).rejects.toThrow(/could not start/)
  expect((await controller.snapshot()).operation.phase).toBe('idle')
  await controller.launch()
  vi.mocked(deps.launch).mock.calls[1][0].onExit(1)
  expect((await controller.snapshot()).error?.message).toMatch(/exit|stopped/i)
})
it('cleans subscribers and invalidates the account when the application ID changes', async () => {
  const { controller, id } = await setup()
  await controller.saveSettings({ clientId: id }); await controller.signIn()
  const listener = vi.fn(); const unsubscribe = controller.subscribe(listener); unsubscribe()
  await controller.saveSettings({ clientId: '' })
  expect((await controller.snapshot()).account.status).toBe('signedOut')
  expect(listener).not.toHaveBeenCalled()
})
it('cancels a pending launch when the account signs out during Java verification', async () => {
  const { controller, deps, id } = await setup()
  await controller.install(); await controller.saveSettings({ clientId: id, javaPath: '/java21' }); await controller.signIn()
  let release!: () => void
  deps.java.verify = vi.fn(() => new Promise<JavaRuntime>(resolve => { release = () => resolve({ executable: '/java21', major: 21, architecture: 'x64' }) }))
  const pending = controller.launch()
  await vi.waitFor(() => expect(release).toBeDefined())
  await controller.signOut(); release()
  await expect(pending).rejects.toThrow(/account|sign in|cancel/i)
  expect(deps.launch).not.toHaveBeenCalled()
  expect((await controller.snapshot()).account.status).toBe('signedOut')
  expect((await controller.snapshot()).operation.phase).toBe('idle')
})
it('invalidates authorization at the process boundary while launch prechecks are pending', async () => {
  const { controller, deps, id } = await setup()
  await controller.install(); await controller.saveSettings({ clientId: id, javaPath: '/java21' }); await controller.signIn()
  let resume!: () => void
  let spawns = 0
  deps.launch = vi.fn(async input => {
    await new Promise<void>(resolve => { resume = resolve })
    input.assertAuthorized(); spawns++
    return {} as never
  })
  const pending = controller.launch()
  await vi.waitFor(() => expect(resume).toBeDefined())
  await controller.signOut(); resume()
  await expect(pending).rejects.toThrow(/account|sign in|cancel/i)
  expect(spawns).toBe(0)
  expect((await controller.snapshot()).operation.phase).toBe('idle')
})
it('removes corrupt installed state and repairs the release with the Install action', async () => {
  const { controller, deps } = await setup()
  await controller.install()
  const root = (await controller.snapshot()).settings.gameDirectory
  await writeFile(join(root, 'versions/fixture/fixture.jar'), 'corrupt data')
  await expect(controller.launch()).rejects.toThrow(/repair|install/i)
  expect((await controller.snapshot()).installedVersionIds).not.toContain('fixture')
  expect(deps.launch).not.toHaveBeenCalled()
  await controller.install()
  expect((await controller.snapshot()).installedVersionIds).toContain('fixture')
})
it('does not spawn after the selected offline account changes', async () => {
  const { controller, deps } = await setup()
  await controller.install(); await controller.saveSettings({ javaPath: '/java21' })
  await controller.createOfflineAccount('First')
  let resume!: () => void
  let spawns = 0
  deps.launch = vi.fn(async input => {
    await new Promise<void>(resolve => { resume = resolve })
    input.assertAuthorized(); spawns++
    return {} as never
  })
  const pending = controller.launch()
  await vi.waitFor(() => expect(resume).toBeDefined())
  await controller.createOfflineAccount('Second'); resume()
  await expect(pending).rejects.toThrow(/account|cancel/i)
  expect(spawns).toBe(0)
})
