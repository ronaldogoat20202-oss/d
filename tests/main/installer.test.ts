import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InstallService } from '../../src/main/services/installer'
import { minecraftFixture } from '../fixtures/minecraft'
let root: string
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'orbit-install-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
const platform = { name: 'windows' as const, arch: 'x64', version: '10.0.0' }
it('installs and validates actual fixture bytes without an account or Java', async () => {
  const fixture = minecraftFixture()
  const requested: string[] = []
  const service = new InstallService(async url => { requested.push(url); return fixture.fetcher(url) }, platform)
  const progress: number[] = []
  expect(await service.inspect(fixture.release, root)).toBeNull()
  expect(await service.ensure(fixture.release, root, p => progress.push(p.completedBytes))).toMatchObject({ id: 'fixture', javaMajor: 21 })
  expect((await service.inspect(fixture.release, root))?.id).toBe('fixture')
  expect(requested.some(url => url.includes('linux.jar'))).toBe(false)
  expect(await readFile(join(root, 'versions/fixture/fixture.jar'))).toEqual(fixture.files.get(fixture.clientUrl))
  expect(progress.some(bytes => bytes > 0)).toBe(true)
})
it('never marks corrupt downloads installed and succeeds after a corrected retry', async () => {
  const fixture = minecraftFixture()
  const bad = new InstallService(async url => url === fixture.clientUrl ? new Response('bad bytes') : fixture.fetcher(url), platform)
  await expect(bad.ensure(fixture.release, root, () => {})).rejects.toThrow(/integrity|checksum/i)
  expect(await bad.inspect(fixture.release, root)).toBeNull()
  const good = new InstallService(fixture.fetcher, platform)
  await good.ensure(fixture.release, root, () => {})
  expect((await good.inspect(fixture.release, root))?.id).toBe('fixture')
  await writeFile(join(root, 'versions/fixture/fixture.jar'), 'corrupt cache')
  expect(await good.inspect(fixture.release, root)).toBeNull()
  await good.ensure(fixture.release, root, () => {})
  expect((await good.inspect(fixture.release, root))?.id).toBe('fixture')
})
it('handles interrupted streams and never commits the partial artifact', async () => {
  const fixture = minecraftFixture()
  const service = new InstallService(async url => url === fixture.clientUrl ? new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.error(new Error('interrupted')) } })) : fixture.fetcher(url), platform)
  await expect(service.ensure(fixture.release, root, () => {})).rejects.toThrow()
  expect(await service.inspect(fixture.release, root)).toBeNull()
  await expect(readFile(join(root, 'versions/fixture/fixture.jar'))).rejects.toThrow()
})
it('rejects traversal IDs before writing files', async () => {
  const fixture = minecraftFixture()
  await expect(new InstallService(fixture.fetcher, platform).ensure({ ...fixture.release, id: '../escape' }, root, () => {})).rejects.toThrow(/version|path/i)
})
