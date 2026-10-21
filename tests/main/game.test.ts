import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateArguments } from '@xmcl/core'
import { minecraftFixture } from '../fixtures/minecraft'
import { InstallService } from '../../src/main/services/installer'
import { makeLaunchOptions, guardSpawn } from '../../src/main/adapters/minecraft-launcher'
import { launchGame } from '../../src/main/services/game'
import { vi } from 'vitest'
const roots: string[] = []
afterEach(async () => { await Promise.all(roots.map(root => rm(root, { recursive: true, force: true }))) })
it('constructs authenticated arguments with client ID and XUID and preserves spaced paths', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orbit game ')); roots.push(root)
  const fixture = minecraftFixture()
  const platform = { name: 'windows' as const, arch: 'x64', version: '10.0.0' }
  const installed = await new InstallService(fixture.fetcher, platform).ensure(fixture.release, root, () => {})
  const options = await makeLaunchOptions({ settings: { clientId: 'own-public-id', javaPath: 'C:\\Program Files\\Java\\bin\\java.exe', gameDirectory: root, maxMemoryMiB: 2048 }, version: installed, session: { kind: 'microsoft', clientId: 'own-public-id', xuid: '123456', accessToken: 'private-token', profile: { kind: 'microsoft' as const, id: 'a'.repeat(32), name: 'OrbitPlayer' } } }, platform)
  const args = await generateArguments(options)
  expect(args[0]).toBe('C:\\Program Files\\Java\\bin\\java.exe')
  expect(args).toContain('own-public-id'); expect(args).toContain('123456')
  expect(args.join(' ')).not.toMatch(/\$\{clientid\}|\$\{auth_xuid\}/)
  expect(args).toContain('OrbitPlayer')
})
it('rejects missing credentials rather than using the core offline fallback', async () => {
  await expect(makeLaunchOptions({ settings: { clientId: '', javaPath: '/java', gameDirectory: '/game', maxMemoryMiB: 2048 }, version: { id: 'x', root: '/game', javaMajor: 21 }, session: { kind: 'microsoft', accessToken: '', clientId: '', xuid: '', profile: { kind: 'microsoft' as const, id: '', name: '' } } })).rejects.toThrow(/sign in|authenticated/i)
})
it('refuses unresolved placeholders and shell execution at the process boundary', () => {
  expect(() => guardSpawn('/java', ['${auth_xuid}'], { shell: false })).toThrow(/unresolved/i)
  expect(() => guardSpawn('/java', ['Main'], { shell: true })).toThrow(/shell/i)
  expect(() => guardSpawn('/java path/java', ['argument with spaces'], { shell: false })).not.toThrow()
})
it('rechecks authorization after asynchronous core prechecks before spawning Java', async () => {
  const root = await mkdtemp(join(tmpdir(), 'orbit-spawn-')); roots.push(root)
  const fixture = minecraftFixture()
  const version = await new InstallService(fixture.fetcher).ensure(fixture.release, root, () => {})
  let resume!: () => void
  let authorized = true
  const spawn = vi.fn(() => { throw new Error('Actual process must not spawn') })
  const pending = launchGame({ settings: { clientId: 'own-id', javaPath: '/java', gameDirectory: root, maxMemoryMiB: 2048 }, version,
    session: { kind: 'microsoft', clientId: 'own-id', xuid: '12345', accessToken: 'secret', profile: { kind: 'microsoft' as const, id: 'a'.repeat(32), name: 'OrbitPlayer' } },
    assertAuthorized: () => { if (!authorized) throw new Error('Account changed') }, onLog: () => {}, onExit: () => {}
  }, { spawn, launch: async options => { await new Promise<void>(resolve => { resume = resolve }); return options.spawn!('/java', ['Main'], { shell: false }) } })
  await vi.waitFor(() => expect(resume).toBeDefined())
  authorized = false; resume()
  await expect(pending).rejects.toThrow(/could not start/i)
  expect(spawn).not.toHaveBeenCalled()
})
