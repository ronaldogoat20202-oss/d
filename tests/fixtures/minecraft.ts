import { createHash } from 'node:crypto'
export const hash = (bytes: string | Uint8Array) => createHash('sha1').update(bytes).digest('hex')
export function minecraftFixture() {
  const jar = Buffer.from('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==', 'base64')
  const asset = Buffer.from('a tiny official-transport fixture')
  const assetHash = hash(asset)
  const assetIndex = JSON.stringify({ objects: { 'test/sound.ogg': { hash: assetHash, size: asset.length } } })
  const clientUrl = 'https://piston-data.mojang.com/fixture/client.jar'
  const indexUrl = 'https://piston-meta.mojang.com/fixture/index.json'
  const metadataUrl = 'https://piston-meta.mojang.com/fixture/version.json'
  const libraryUrl = 'https://libraries.minecraft.net/test/fixture/1/fixture-1.jar'
  const metadata = JSON.stringify({
    id: 'fixture', type: 'release', time: '2026-01-01T00:00:00Z', releaseTime: '2026-01-01T00:00:00Z',
    mainClass: 'net.minecraft.client.main.Main', arguments: { game: ['--username', '${auth_player_name}', '--clientId', '${clientid}', '--xuid', '${auth_xuid}'], jvm: [] },
    javaVersion: { majorVersion: 21, component: 'java-runtime-delta' },
    downloads: { client: { url: clientUrl, sha1: hash(jar), size: jar.length } },
    libraries: [
      { name: 'test:fixture:1', downloads: { artifact: { path: 'test/fixture/1/fixture-1.jar', url: libraryUrl, sha1: hash(jar), size: jar.length } } },
      { name: 'test:linux:1', rules: [{ action: 'allow', os: { name: 'linux' } }], downloads: { artifact: { path: 'test/linux/1/linux-1.jar', url: 'https://libraries.minecraft.net/linux.jar', sha1: hash(jar), size: jar.length } } }
    ],
    assetIndex: { id: 'fixture', url: indexUrl, sha1: hash(assetIndex), size: Buffer.byteLength(assetIndex), totalSize: asset.length }, assets: 'fixture'
  })
  const release = { id: 'fixture', url: metadataUrl, sha1: hash(metadata), releasedAt: '2026-01-01T00:00:00Z' }
  const files = new Map<string, Uint8Array>([[metadataUrl, Buffer.from(metadata)], [clientUrl, jar], [libraryUrl, jar], ['https://libraries.minecraft.net/linux.jar', jar], [indexUrl, Buffer.from(assetIndex)], [`https://resources.download.minecraft.net/${assetHash.slice(0, 2)}/${assetHash}`, asset]])
  const fetcher = async (url: string) => {
    const bytes = files.get(url)
    if (!bytes) throw new Error('Unexpected fixture URL: ' + url)
    return new Response(new Uint8Array(bytes))
  }
  return { release, fetcher, files, clientUrl, libraryUrl, assetHash }
}
