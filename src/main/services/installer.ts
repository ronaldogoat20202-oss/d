import { mkdir } from 'node:fs/promises'
import { getPlatform, type Platform } from '@xmcl/core'
import type { InstallFile } from './artifacts'
import { MinecraftInstallerAdapter } from '../adapters/minecraft-installer'
import { downloadFile, safeDestination, validFile } from './downloads'
import { assertVersionId, networkFetch, type FetchPort } from './network'
import type { DownloadProgress, Release } from '../../shared/contracts'
import type { InstalledVersion } from './types'

export class InstallService {
  constructor(private fetcher: FetchPort = networkFetch, private platform: Platform = getPlatform(), private adapter = new MinecraftInstallerAdapter()) {}
  async inspect(release: Release, root: string): Promise<InstalledVersion | null> {
    try {
      assertVersionId(release.id)
      const metadata = this.adapter.metadata(release, root)
      for (const file of metadata) { await safeDestination(root, file.path); if (!await validFile(file)) return null }
      const version = await this.adapter.version(release, root, this.platform)
      const dependencies = this.adapter.dependencies(version, root)
      for (const file of dependencies) { await safeDestination(root, file.path); if (!await validFile(file)) return null }
      const assets = await this.adapter.assets(version, root)
      for (const file of assets) { await safeDestination(root, file.path); if (!await validFile(file)) return null }
      return { id: release.id, root, javaMajor: version.javaVersion?.majorVersion ?? 8 }
    } catch { return null }
  }
  async ensure(release: Release, root: string, onProgress: (progress: DownloadProgress) => void): Promise<InstalledVersion> {
    assertVersionId(release.id)
    await mkdir(root, { recursive: true })
    const run = async (files: InstallFile[], message: string) => {
      const pending: InstallFile[] = []
      for (const file of files) { await safeDestination(root, file.path); if (!await validFile(file)) pending.push(file) }
      let completed = 0
      const total = pending.every(f => f.size !== undefined) ? pending.reduce((sum, f) => sum + f.size!, 0) : null
      onProgress({ completedBytes: 0, totalBytes: total, message })
      const download = async (downloads: InstallFile[]) => {
        let cursor = 0, failure: unknown
        const worker = async () => {
          while (!failure && cursor < downloads.length) {
            const file = downloads[cursor++]
            try { await downloadFile(file, root, this.fetcher, bytes => { completed += bytes; onProgress({ completedBytes: completed, totalBytes: total, message }) }) }
            catch (error) { failure = error }
          }
        }
        await Promise.all(Array.from({ length: Math.min(4, downloads.length) }, worker))
        if (failure) throw failure
      }
      await download(pending)
      for (const file of files) if (!await validFile(file)) throw new Error('Installed artifact failed integrity validation. Retry installation.')
    }
    await run(this.adapter.metadata(release, root), 'Preparing version metadata')
    const version = await this.adapter.version(release, root, this.platform)
    await run(this.adapter.dependencies(version, root), 'Downloading game and libraries')
    await run(await this.adapter.assets(version, root), 'Downloading game assets')
    const result = await this.inspect(release, root)
    if (!result) throw new Error('Minecraft installation is incomplete. Retry installation.')
    return result
  }
}
