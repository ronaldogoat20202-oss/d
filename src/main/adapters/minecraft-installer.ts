import { MinecraftFolder, Version, type Platform, type ResolvedVersion } from '@xmcl/core'
import { readFile } from 'node:fs/promises'
import type { Release } from '../../shared/contracts'
import type { InstallFile } from '../services/artifacts'

function artifact(path: string, download: { url: string; sha1?: string; size?: number }): InstallFile {
  if (download.sha1 && !/^[0-9a-f]{40}$/i.test(download.sha1)) throw new Error('Invalid artifact checksum in official metadata.')
  if (download.size !== undefined && (!Number.isInteger(download.size) || download.size < 0)) throw new Error('Invalid artifact size in official metadata.')
  return { path, urls: [download.url], size: download.size, checksum: download.sha1 ? { algorithm: 'sha1', value: download.sha1 } : undefined }
}

export class MinecraftInstallerAdapter {
  metadata(release: Release, root: string): InstallFile[] {
    return [artifact(new MinecraftFolder(root).getVersionJson(release.id), { url: release.url, sha1: release.sha1 })]
  }
  async version(release: Release, root: string, platform: Platform): Promise<ResolvedVersion> {
    return Version.parse(root, release.id, platform)
  }
  dependencies(version: ResolvedVersion, root: string, fabric = false): InstallFile[] {
    const folder = new MinecraftFolder(root)
    if (!version.downloads.client) throw new Error('Official metadata has no Minecraft client download.')
    const result = [artifact(folder.getVersionJar(version.minecraftVersion), version.downloads.client)]
    for (const library of version.libraries) result.push(artifact(folder.getLibraryByPath(library.download.path || library.path), { ...library.download, size: fabric && library.download.size === -1 ? undefined : library.download.size }))
    if (version.assetIndex) result.push(artifact(folder.getAssetsIndex(version.assetIndex.id), version.assetIndex))
    if (version.logging?.client?.file) result.push(artifact(folder.getLogConfig(version.logging.client.file.id), version.logging.client.file))
    return result
  }
  async assets(version: ResolvedVersion, root: string): Promise<InstallFile[]> {
    if (!version.assetIndex) return []
    const folder = new MinecraftFolder(root)
    const index = JSON.parse(await readFile(folder.getAssetsIndex(version.assetIndex.id), 'utf8')) as { objects?: Record<string, { hash: string; size: number }> }
    if (!index.objects || typeof index.objects !== 'object' || Array.isArray(index.objects)) throw new Error('Invalid Minecraft asset index.')
    return Object.entries(index.objects).map(([name, entry]) => {
      if (name.split(/[\\/]/).includes('..') || name.startsWith('/') || name.includes('\0') || !/^[a-f0-9]{40}$/.test(entry.hash) || !Number.isInteger(entry.size) || entry.size < 0) throw new Error('Invalid asset metadata path or checksum.')
      return artifact(folder.getAsset(entry.hash), { url: `https://resources.download.minecraft.net/${entry.hash.slice(0, 2)}/${entry.hash}`, sha1: entry.hash, size: entry.size })
    })
  }
}
