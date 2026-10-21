import { EnvHttpProxyAgent, fetch as fetchWithProxy } from 'undici'

export type FetchPort = (url: string, init?: RequestInit) => Promise<Response>
export type UrlPolicy = (url: string) => void
const dispatcher = new EnvHttpProxyAgent()
export const networkFetch: FetchPort = (url, init) => fetchWithProxy(url, {
  ...init, dispatcher, redirect: 'error',
  signal: init?.signal || AbortSignal.timeout(60000)
} as Parameters<typeof fetchWithProxy>[1]) as unknown as Promise<Response>

const downloadHosts = new Set(['piston-meta.mojang.com', 'piston-data.mojang.com', 'libraries.minecraft.net', 'resources.download.minecraft.net', 'launchermeta.mojang.com', 'launcher.mojang.com'])
export function assertOfficialUrl(value: string): void {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !downloadHosts.has(url.hostname))
    throw new Error('Download URL is not an allowed official Minecraft endpoint.')
}
export function assertVersionId(value: string): void {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,100}$/.test(value)) throw new Error('Invalid Minecraft version ID in official metadata.')
}
export function assertFabricUrl(value: string): void {
  try { assertOfficialUrl(value); return } catch { /* provider-specific hosts follow */ }
  const u = new URL(value)
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !['maven.fabricmc.net', 'repo.maven.apache.org'].includes(u.hostname)) throw new Error('Fabric download host is not allowed.')
}
export function assertModrinthUrl(value: string): void {
  const u = new URL(value)
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hostname !== 'cdn.modrinth.com') throw new Error('Modrinth download host is not allowed.')
}
