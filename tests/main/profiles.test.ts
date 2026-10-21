import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProfileStore } from '../../src/main/services/profiles'
let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'orbit-profiles-')) })
afterEach(async () => { await rm(dir, { force: true, recursive: true }) })
it('defers legacy migration without release metadata and preserves existing worlds', async () => {
  const store = new ProfileStore(dir), root = join(dir, 'game')
  await mkdir(join(root, 'saves/World'), { recursive: true }); await writeFile(join(root, 'saves/World/level.dat'), 'preserve')
  await expect(store.migrateLegacy(root, null)).resolves.toBeNull()
  expect(await store.list()).toEqual([])
  const legacy = await store.migrateLegacy(root, '1.21.1')
  expect(legacy).toMatchObject({ name: 'Existing Vanilla', minecraftVersion: '1.21.1', gameDirectory: root, libraryRoot: root, legacy: true })
  await store.migrateLegacy(root, '1.21.2')
  expect(await store.list()).toHaveLength(1)
  expect(await readFile(join(root, 'saves/World/level.dat'), 'utf8')).toBe('preserve')
})
it('isolates game directories while preserving roots, selection and files after removal', async () => {
  const store = new ProfileStore(dir), root = join(dir, 'library')
  const a = await store.create({ name: 'One', minecraftVersion: '1.21.1', loader: 'vanilla' }, root, { kind: 'vanilla' })
  const b = await store.create({ name: 'Two', minecraftVersion: '1.21.1', loader: 'vanilla' }, root, { kind: 'vanilla' })
  expect(a.gameDirectory).not.toBe(b.gameDirectory); expect(a.libraryRoot).toBe(b.libraryRoot)
  expect(a.gameDirectory).toBe(join(root, 'instances', a.id))
  await store.select(a.id); await store.rename(a.id, 'Renamed')
  expect((await new ProfileStore(dir).selected())?.name).toBe('Renamed')
  await writeFile(join(a.gameDirectory, 'keep.txt'), 'keep')
  await store.remove(a.id)
  expect(await readFile(join(a.gameDirectory, 'keep.txt'), 'utf8')).toBe('keep')
  const c = await store.create({ name: 'Other root', minecraftVersion: '1.21.1', loader: 'vanilla' }, join(dir, 'other'), { kind: 'vanilla' })
  expect((await store.list()).find(p => p.id === b.id)?.libraryRoot).toBe(root)
  expect(c.libraryRoot).not.toBe(root)
})
it('rejects arbitrary IDs, invalid names and versions', async () => {
  const store = new ProfileStore(dir)
  await expect(store.select('../escape')).rejects.toThrow(/profile/i)
  await expect(store.create({ name: '', minecraftVersion: '1.21.1', loader: 'vanilla' }, dir, { kind: 'vanilla' })).rejects.toThrow(/name/i)
  await expect(store.create({ name: 'A', minecraftVersion: '../escape', loader: 'vanilla' }, dir, { kind: 'vanilla' })).rejects.toThrow(/version/i)
})
