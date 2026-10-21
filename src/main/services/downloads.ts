import { createReadStream } from 'node:fs'
import { lstat, mkdir, open, realpath, rename, rm, stat } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import type { InstallFile } from './artifacts'
import { assertOfficialUrl, type FetchPort, type UrlPolicy } from './network'

export async function safeDestination(root: string, destination: string): Promise<void> {
  const base = resolve(root), path = resolve(destination)
  const rel = relative(base, path)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error('Artifact path escapes the game directory.')
  let existing = path
  while (true) {
    try { await lstat(existing); break } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; existing = dirname(existing) }
  }
  const actual = await realpath(existing), actualBase = await realpath(base)
  const actualRelative = relative(actualBase, actual)
  if (actualRelative.startsWith('..') || isAbsolute(actualRelative)) throw new Error('Artifact path follows a link outside the game directory.')
}
export async function validFile(file: InstallFile): Promise<boolean> {
  try {
    const info = await stat(file.path)
    if (!info.isFile() || (file.size !== undefined && info.size !== file.size)) return false
    if (file.checksum) {
      const digest = createHash(file.checksum.algorithm)
      for await (const chunk of createReadStream(file.path)) digest.update(chunk)
      if (digest.digest('hex').toLowerCase() !== file.checksum.value.toLowerCase()) return false
    }
    return true
  } catch { return false }
}
export async function downloadFile(file: InstallFile, root: string, fetcher: FetchPort, onBytes: (count: number) => void, policy: UrlPolicy = assertOfficialUrl): Promise<void> {
  await safeDestination(root, file.path)
  const urls = file.urls.filter(url => { try { policy(url); return true } catch { return false } })
  if (!urls.length) throw new Error('Artifact has no allowed official download URL.')
  const response = await fetcher(urls[0], { signal: AbortSignal.timeout(120000) })
  if (!response.ok || !response.body) throw new Error('Minecraft download failed. Check your connection and retry.')
  await mkdir(dirname(file.path), { recursive: true })
  const partial = file.path + '.' + randomUUID() + '.part'
  const handle = await open(partial, 'wx', 0o600)
  const reader = response.body.getReader()
  const digest = file.checksum ? createHash(file.checksum.algorithm) : null
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (file.size !== undefined && size > file.size) throw new Error('Download integrity check failed: unexpected file size.')
      digest?.update(value); await handle.writeFile(value); onBytes(value.byteLength)
    }
    if (file.size !== undefined && size !== file.size) throw new Error('Download integrity check failed: incomplete file size.')
    if (digest && digest.digest('hex').toLowerCase() !== file.checksum!.value.toLowerCase()) throw new Error('Download checksum integrity check failed.')
    await handle.close()
    await safeDestination(root, file.path)
    await rename(partial, file.path)
  } catch (error) {
    await handle.close().catch(() => undefined)
    await reader.cancel().catch(() => undefined)
    await rm(partial, { force: true }).catch(() => undefined)
    throw error
  }
}
