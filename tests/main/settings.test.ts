import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsStore, pickSetting } from '../../src/main/services/settings'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'orbit-settings-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })
const runtime = { platform: 'win32' as const, architecture: 'x64', totalMemoryBytes: 8 * 1024 ** 3 }
describe('settings', () => {
  it('starts safely without an account and persists preferences across restarts', async () => {
    const store = new SettingsStore(dir, runtime)
    expect(await store.read()).toMatchObject({ clientId: '', javaPath: '', maxMemoryMiB: 2048, gameDirectory: join(dir, 'minecraft') })
    await store.update({ javaPath: 'C:\\Program Files\\Java\\bin\\java.exe', maxMemoryMiB: 4096 })
    expect((await new SettingsStore(dir, runtime).read()).maxMemoryMiB).toBe(4096)
    expect(JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8')).javaPath).toContain('Program Files')
  })
  it.each([1023, 6145, 1.5, NaN])('rejects invalid memory %s', async maxMemoryMiB => {
    await expect(new SettingsStore(dir, runtime).update({ maxMemoryMiB })).rejects.toThrow(/memory/i)
  })
  it('caps defaults on small systems and reports insufficient memory', async () => {
    expect((await new SettingsStore(dir, { ...runtime, totalMemoryBytes: 2 * 1024 ** 3 }).read()).maxMemoryMiB).toBe(1536)
    await expect(new SettingsStore(dir, { ...runtime, totalMemoryBytes: 1024 ** 3 }).read()).rejects.toThrow(/memory/i)
  })
  it('rejects unknown keys, malformed IDs, relative paths and NULs', async () => {
    const store = new SettingsStore(dir, runtime)
    await expect(store.update({ extra: true } as never)).rejects.toThrow(/setting/i)
    await expect(store.update({ clientId: 'borrowed-id' })).rejects.toThrow(/client ID/i)
    await expect(store.update({ gameDirectory: '../elsewhere' })).rejects.toThrow(/absolute/i)
    await expect(store.update({ javaPath: '/bin/java\0' })).rejects.toThrow(/path/i)
  })
  it('preserves corrupted JSON and returns recoverable defaults', async () => {
    await writeFile(join(dir, 'settings.json'), '{broken')
    expect((await new SettingsStore(dir, runtime).read()).clientId).toBe('')
    const backup = (await readdir(dir)).find(name => name.includes('.corrupt-'))!
    expect(await readFile(join(dir, backup), 'utf8')).toBe('{broken')
  })
  it('does not replace preferences after a failed validation', async () => {
    const store = new SettingsStore(dir, runtime)
    await store.update({ maxMemoryMiB: 4096 })
    await expect(store.update({ maxMemoryMiB: -10 })).rejects.toThrow()
    expect((await store.read()).maxMemoryMiB).toBe(4096)
  })
  it('reports inaccessible preference directories', async () => {
    const file = join(dir, 'not-a-directory')
    await writeFile(file, 'preserve')
    await expect(new SettingsStore(file, runtime).read()).rejects.toThrow(/permissions/i)
    expect(await readFile(file, 'utf8')).toBe('preserve')
  })
  it('keeps the previous preference when a native picker is cancelled', async () => {
    const store = new SettingsStore(dir, runtime)
    const previous = await store.read()
    expect(await pickSetting(store, async () => ({ canceled: true, filePaths: [] }), 'javaPath')).toEqual(previous)
  })
})
