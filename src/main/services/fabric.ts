import { createHash } from 'node:crypto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { MinecraftFolder, Version, getPlatform, type Platform } from '@xmcl/core'
import { FabricMeta, fabricId } from '../adapters/fabric-meta'
import { MinecraftInstallerAdapter } from '../adapters/minecraft-installer'
import { InstallService } from './installer'
import { assertFabricUrl, networkFetch, type FetchPort } from './network'
import { downloadFile, safeDestination, validFile } from './downloads'
import type { Release, DownloadProgress } from '../../shared/contracts'
import type { InstallFile } from './artifacts'
import type { InstalledVersion } from './types'
interface Receipt { metadataHash: string; files: InstallFile[] }
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex')
export class FabricService {
  private meta: FabricMeta
  private vanilla: InstallService
  private adapter = new MinecraftInstallerAdapter()
  constructor(private fetcher: FetchPort = networkFetch, private platform: Platform = getPlatform()) { this.meta = new FabricMeta(fetcher); this.vanilla = new InstallService(fetcher,platform) }
  listLoaders(game: string) { return this.meta.listLoaders(game) }
  async inspect(base: Release, loader: string, root: string): Promise<InstalledVersion|null> {
    try {
      if (!await this.vanilla.inspect(base,root)) return null
      const id = fabricId(base.id,loader), path = new MinecraftFolder(root).getVersionJson(id)
      await safeDestination(root,path)
      const text = await readFile(path,'utf8'), receipt = JSON.parse(await readFile(path+'.orbit.json','utf8')) as Receipt
      if (receipt.metadataHash !== sha256(text) || !Array.isArray(receipt.files)) return null
      const raw = JSON.parse(text)
      if (raw.inheritsFrom !== base.id || raw.id !== id) return null
      const resolved = await Version.parse(root,id,this.platform)
      const expected = this.adapter.dependencies(resolved,root,true)
      if (receipt.files.length !== expected.length || new Set(receipt.files.map(f=>f.path)).size !== expected.length) return null
      for (const file of expected) {
        const recorded = receipt.files.find(f=>f.path===file.path)
        if (!recorded?.checksum || !['sha1','sha256','sha512'].includes(recorded.checksum.algorithm)) return null
        if (file.size !== undefined && recorded.size !== file.size) return null
        if (file.checksum && (recorded.checksum.algorithm !== file.checksum.algorithm || recorded.checksum.value !== file.checksum.value)) return null
        await safeDestination(root,file.path)
        if (!await validFile(recorded)) return null
      }
      return {id,root,javaMajor:resolved.javaVersion?.majorVersion || 8}
    } catch { return null }
  }
  async ensure(base: Release, loader: string, root: string, onProgress: (value:DownloadProgress)=>void): Promise<InstalledVersion> {
    await this.vanilla.ensure(base,root,onProgress)
    const raw = await this.meta.profile(base.id,loader), folder = new MinecraftFolder(root), path = folder.getVersionJson(raw.id)
    await safeDestination(root,path)
    const { mkdir } = await import('node:fs/promises')
    await mkdir(folder.getVersionRoot(raw.id),{recursive:true})
    const text = JSON.stringify(raw), temp = path+'.part'
    await writeFile(temp,text); await rename(temp,path)
    const resolved = await Version.parse(root,raw.id,this.platform)
    const files = this.adapter.dependencies(resolved,root,true)
    for (const file of files) {
      await safeDestination(root,file.path); assertFabricUrl(file.urls[0])
      if (!file.checksum) {
        const url = file.urls[0]
        const lib = raw.libraries.find(l => {
          const [group,name,version,classifier] = l.name.split(':')
          return url === `${l.url || 'https://libraries.minecraft.net/'}${group.replaceAll('.','/')}/${name}/${version}/${name}-${version}${classifier?'-'+classifier:''}.jar`
        })
        if (lib?.sha512) file.checksum = {algorithm:'sha512',value:lib.sha512}
        else if (lib?.sha1) file.checksum = {algorithm:'sha1',value:lib.sha1}
        if (lib?.size !== undefined) file.size = lib.size
        if (!file.checksum) {
          const sidecar = await this.fetcher(url+'.sha1')
          if (sidecar.ok) {
            const digest = (await sidecar.text()).trim().split(/\s/)[0]
            if (!/^[a-f0-9]{40}$/i.test(digest)) throw new Error('Invalid Fabric Maven checksum.')
            file.checksum = {algorithm:'sha1',value:digest}
          } else if (sidecar.status !== 404) throw new Error('Could not verify the Fabric library checksum. Retry.')
        }
      }
      if (!await validFile(file)) {
        let bytes = 0
        onProgress({completedBytes:0,totalBytes:file.size ?? null,message:'Installing Fabric libraries'})
        await downloadFile(file,root,this.fetcher,n=>{bytes+=n;onProgress({completedBytes:bytes,totalBytes:file.size??null,message:'Installing Fabric libraries'})},assertFabricUrl)
      }
      // A TLS-only artifact still gets a local receipt for subsequent corruption checks.
      if (!file.checksum) file.checksum = {algorithm:'sha256',value:sha256(await readFile(file.path))}
    }
    const receipt: Receipt = {metadataHash:sha256(text),files}
    await writeFile(path+'.orbit.part',JSON.stringify(receipt)); await rename(path+'.orbit.part',path+'.orbit.json')
    const installed = await this.inspect(base,loader,root)
    if (!installed) throw new Error('Fabric installation needs repair. Retry the installation.')
    return installed
  }
}
