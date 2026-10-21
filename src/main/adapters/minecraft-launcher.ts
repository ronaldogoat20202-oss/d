import { getPlatform, Version, type LaunchOption, type Platform } from '@xmcl/core'
import type { SpawnOptions } from 'node:child_process'
import type { Settings } from '../../shared/contracts'
import type { GameSession, InstalledVersion } from '../services/types'

export interface LaunchConfiguration { settings: Settings; version: InstalledVersion; session: GameSession }
export function guardSpawn(executable: string, args: readonly string[], options: SpawnOptions): void {
  if (options.shell) throw new Error('Shell execution is disabled for Minecraft.')
  if (!executable || executable.includes('\0') || args.some(arg => typeof arg !== 'string' || arg.includes('\0') || /\$\{[^}]+\}/.test(arg))) throw new Error('Unresolved or invalid Minecraft launch arguments.')
}
export async function makeLaunchOptions(input: LaunchConfiguration, platform: Platform = getPlatform()): Promise<LaunchOption> {
  const { settings, version, session } = input
  if (!session.accessToken || !session.profile.id || !session.profile.name || !session.clientId || !session.xuid) throw new Error('Sign in with an authenticated Minecraft account before launching.')
  const resolved = await Version.parse(version.root, version.id, platform)
  return {
    gamePath: settings.gameDirectory, resourcePath: version.root, version: resolved, javaPath: settings.javaPath,
    gameProfile: session.profile, accessToken: session.accessToken, minMemory: 512, maxMemory: settings.maxMemoryMiB,
    launcherName: 'Orbit', launcherBrand: 'Orbit', platform,
    features: { orbit_auth: { clientid: session.clientId, auth_xuid: session.xuid } },
    extraExecOption: { shell: false, windowsHide: true }
  }
}
