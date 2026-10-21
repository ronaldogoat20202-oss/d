import { getPlatform, Version, type LaunchOption, type Platform } from '@xmcl/core'
import type { SpawnOptions } from 'node:child_process'
import type { Settings } from '../../shared/contracts'
import type { GameSession, InstalledVersion } from '../services/types'

export interface LaunchConfiguration { gameDirectory?: string; settings: Settings; version: InstalledVersion; session: GameSession }
export function guardSpawn(executable: string, args: readonly string[], options: SpawnOptions): void {
  if (options.shell) throw new Error('Shell execution is disabled for Minecraft.')
  if (!executable || executable.includes('\0') || args.some(arg => typeof arg !== 'string' || arg.includes('\0') || /\$\{[^}]+\}/.test(arg))) throw new Error('Unresolved or invalid Minecraft launch arguments.')
}
export async function makeLaunchOptions(input: LaunchConfiguration, platform: Platform = getPlatform()): Promise<LaunchOption> {
  const { settings, version, session } = input
  if (!session.profile.id || !session.profile.name || (session.kind === 'microsoft' && (!session.accessToken || !session.clientId || !session.xuid))) throw new Error('Sign in with an authenticated Minecraft account before launching.')
  const resolved = await Version.parse(version.root, version.id, platform)
  if (session.kind === 'offline') {
    // Core leaves empty substitutions unresolved. Offline sessions have no
    // Microsoft client identity or XUID, so omit those optional arguments.
    const strip = (args: typeof resolved.arguments.game): typeof resolved.arguments.game => args.flatMap<(typeof args)[number]>((arg, i, all) => {
      if (typeof arg === 'string') return ['--clientId', '--xuid'].includes(arg) || (typeof all[i - 1] === 'string' && ['--clientId', '--xuid'].includes(all[i - 1] as string)) ? [] : [arg]
      return [{ ...arg, value: Array.isArray(arg.value) ? strip(arg.value) as string[] : arg.value }]
    })
    resolved.arguments.game = strip(resolved.arguments.game)
  }
  return {
    gamePath: input.gameDirectory || settings.gameDirectory, resourcePath: version.root, version: resolved, javaPath: settings.javaPath,
    gameProfile: session.profile, accessToken: session.kind === 'microsoft' ? session.accessToken : '0', userType: session.kind === 'microsoft' ? undefined : 'legacy', minMemory: 512, maxMemory: settings.maxMemoryMiB,
    launcherName: 'Orbit', launcherBrand: 'Orbit', platform,
    features: { orbit_auth: { clientid: session.kind === 'microsoft' ? session.clientId : '', auth_xuid: session.kind === 'microsoft' ? session.xuid : '' } },
    extraExecOption: { shell: false, windowsHide: true }
  }
}
