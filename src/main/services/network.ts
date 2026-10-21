import { EnvHttpProxyAgent, fetch as fetchWithProxy } from 'undici'

export type FetchPort = (url: string, init?: RequestInit) => Promise<Response>
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
