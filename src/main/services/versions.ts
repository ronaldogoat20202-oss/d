import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { Release } from '../../shared/contracts'
import { assertOfficialUrl, assertVersionId, networkFetch, type FetchPort } from './network'

export const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
function parseManifest(data: unknown): { releases: Release[]; latestReleaseId: string } {
  const value = data as { latest?: { release?: unknown }; versions?: unknown[] }
  if (!value || !Array.isArray(value.versions) || typeof value.latest?.release !== 'string') throw new Error('Invalid official version manifest.')
  const releases = value.versions.filter(entry => (entry as { type?: string })?.type === 'release').map(entry => {
    const item = entry as Record<string, unknown>
    if (typeof item.id !== 'string' || typeof item.url !== 'string' || typeof item.sha1 !== 'string' || !/^[0-9a-f]{40}$/i.test(item.sha1) || typeof item.releaseTime !== 'string') throw new Error('Invalid official version manifest entry.')
    assertVersionId(item.id); assertOfficialUrl(item.url)
    return { id: item.id, url: item.url, sha1: item.sha1, releasedAt: item.releaseTime }
  })
  if (!releases.some(release => release.id === value.latest!.release)) throw new Error('Official manifest has no latest release.')
  return { releases, latestReleaseId: value.latest.release }
}
export class VersionService {
  constructor(private cacheDirectory: string, private fetcher: FetchPort = networkFetch) {}
  async list(): Promise<{ releases: Release[]; latestReleaseId: string; cached: boolean }> {
    const path = join(this.cacheDirectory, 'version-manifest.json')
    try {
      const response = await this.fetcher(MANIFEST_URL, { signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error('Version service unavailable.')
      const raw: unknown = await response.json()
      const result = parseManifest(raw)
      await mkdir(this.cacheDirectory, { recursive: true })
      const temp = path + '.' + randomUUID() + '.tmp'
      await writeFile(temp, JSON.stringify(raw)); await rename(temp, path)
      return { ...result, cached: false }
    } catch (error) {
      try { return { ...parseManifest(JSON.parse(await readFile(path, 'utf8'))), cached: true } }
      catch { throw new Error(error instanceof Error && /manifest|official|version ID/.test(error.message) ? error.message : 'Could not reach the official version manifest. Check your connection and Minecraft network access, then retry.') }
    }
  }
  async requiredJavaMajor(release: Release): Promise<number> {
    assertVersionId(release.id); assertOfficialUrl(release.url)
    const response = await this.fetcher(release.url, { signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw new Error('Could not retrieve version metadata.')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (createHash('sha1').update(bytes).digest('hex') !== release.sha1.toLowerCase()) throw new Error('Version metadata checksum integrity check failed.')
    const metadata = JSON.parse(bytes.toString('utf8')) as { javaVersion?: { majorVersion: number } }
    const major = metadata.javaVersion?.majorVersion ?? 8
    if (!Number.isInteger(major) || major < 8 || major > 100) throw new Error('Invalid Java runtime requirement.')
    return major
  }
}
