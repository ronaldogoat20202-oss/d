import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { VersionService } from '../../src/main/services/versions'
let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'orbit-versions-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })
const version = { id: '1.21', type: 'release', url: 'https://piston-meta.mojang.com/version.json', sha1: 'a'.repeat(40), releaseTime: '2024-06-13T00:00:00Z' }
it('filters releases and uses a validated cached manifest while offline', async () => {
  const service = new VersionService(dir, async () => Response.json({ latest: { release: '1.21' }, versions: [version, { ...version, type: 'snapshot', id: '24w01a' }] }))
  expect(await service.list()).toMatchObject({ latestReleaseId: '1.21', cached: false, releases: [{ id: '1.21' }] })
  const offline = new VersionService(dir, async () => { throw new Error('network unavailable') })
  expect(await offline.list()).toMatchObject({ cached: true, releases: [{ id: '1.21' }] })
})
it('rejects unsafe manifest IDs and nonofficial metadata hosts', async () => {
  for (const bad of [{ ...version, id: '../escape' }, { ...version, url: 'https://evil.test/version.json' }]) {
    await expect(new VersionService(dir, async () => Response.json({ latest: { release: bad.id }, versions: [bad] })).list()).rejects.toThrow(/manifest|official/i)
  }
})
it('verifies version metadata before reading its Java requirement', async () => {
  const body = JSON.stringify({ javaVersion: { majorVersion: 21 } })
  const release = { id: '1.21', url: version.url, releasedAt: version.releaseTime, sha1: createHash('sha1').update(body).digest('hex') }
  expect(await new VersionService(dir, async () => new Response(body)).requiredJavaMajor(release)).toBe(21)
  await expect(new VersionService(dir, async () => new Response('{}')).requiredJavaMajor(release)).rejects.toThrow(/integrity|checksum/i)
})
it('passes a bounded cancellation signal to metadata requests', async () => {
  let signal: AbortSignal | null | undefined
  const service = new VersionService(dir, async (_url, init) => { signal = init?.signal; return Response.json({ latest: { release: version.id }, versions: [version] }) })
  await service.list()
  expect(signal).toBeInstanceOf(AbortSignal)
})
