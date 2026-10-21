import { assertVersionId, networkFetch, type FetchPort } from '../services/network'
export interface FabricLibrary { name: string; url?: string; sha1?: string; sha512?: string; size?: number }
export interface FabricProfile { id: string; inheritsFrom: string; mainClass: string; libraries: FabricLibrary[]; [key: string]: unknown }
export const fabricId = (game: string, loader: string) => `fabric-loader-${loader}-${game}`
export class FabricMeta {
  constructor(private fetcher: FetchPort = networkFetch) {}
  private async request(path: string): Promise<unknown> {
    const response = await this.fetcher('https://meta.fabricmc.net/v2/' + path, { headers: { 'User-Agent':'ronaldogoat20202-oss/Orbit-Launcher/0.2.0' } })
    if (!response.ok) throw new Error('Fabric metadata is unavailable for this release. Check your connection and try again.')
    const body = await response.text()
    if (Buffer.byteLength(body) > 4 * 1024 ** 2) throw new Error('Fabric metadata is too large.')
    return JSON.parse(body)
  }
  async listLoaders(game: string): Promise<{version:string;stable:boolean}[]> {
    assertVersionId(game)
    const data = await this.request(`versions/loader/${encodeURIComponent(game)}`)
    if (!Array.isArray(data) || data.length > 5000) throw new Error('Invalid Fabric loader list.')
    return data.filter(row => row?.loader?.stable === true).map(row => { assertVersionId(row.loader.version); return { version:row.loader.version,stable:true } })
  }
  async profile(game: string, loader: string): Promise<FabricProfile> {
    assertVersionId(game); assertVersionId(loader)
    const value = await this.request(`versions/loader/${encodeURIComponent(game)}/${encodeURIComponent(loader)}/profile/json`) as FabricProfile
    if (!value || value.id !== fabricId(game,loader) || value.inheritsFrom !== game || !/^net\.fabricmc\.loader\.(?:impl\.)?launch\.knot\.KnotClient$/.test(value.mainClass) || !Array.isArray(value.libraries) || value.libraries.length > 500 || value.downloads || value.jar || value.assetIndex) throw new Error('Invalid Fabric metadata or inheritance.')
    for (const lib of value.libraries) {
      if (!lib || typeof lib.name !== 'string' || !/^[A-Za-z0-9_.-]+:[A-Za-z0-9_.-]+:[A-Za-z0-9_.+-]+(?::[A-Za-z0-9_.-]+)?$/.test(lib.name)) throw new Error('Invalid Fabric library metadata.')
      if (lib.size !== undefined && (!Number.isSafeInteger(lib.size) || lib.size < 0)) throw new Error('Invalid Fabric artifact size.')
      if (lib.sha1 && !/^[a-f0-9]{40}$/i.test(lib.sha1)) throw new Error('Invalid Fabric artifact checksum.')
      if (lib.sha512 && !/^[a-f0-9]{128}$/i.test(lib.sha512)) throw new Error('Invalid Fabric artifact checksum.')
    }
    return value
  }
}
