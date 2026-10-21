import { launch } from '@xmcl/core'
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { guardSpawn, makeLaunchOptions, type LaunchConfiguration } from '../adapters/minecraft-launcher'

export interface LaunchInput extends LaunchConfiguration { onLog(text: string): void; onExit(code: number | null): void }
export async function launchGame(input: LaunchInput): Promise<ChildProcess> {
  try {
    const options = await makeLaunchOptions(input)
    let spawned: Promise<ChildProcess> | null = null
    const child = await launch({ ...options, spawn: (command: string, args: readonly string[] = [], execOptions: SpawnOptions = {}) => {
      guardSpawn(command, args, execOptions)
      const process = nodeSpawn(command, [...args], { ...execOptions, shell: false, windowsHide: true })
      spawned = new Promise<ChildProcess>((resolve, reject) => {
        process.once('spawn', () => resolve(process))
        process.once('error', () => reject(new Error('Minecraft could not start. Check Java and retry.')))
      })
      return process
    } })
    if (!spawned) throw new Error('No game process was created.')
    await spawned
    let exited = false
    const finish = (code: number | null) => { if (!exited) { exited = true; input.onExit(code) } }
    child.once('exit', finish)
    child.on('error', () => { input.onLog('The Minecraft process reported an error. Check Java and the game installation.'); finish(1) })
    for (const stream of [child.stdout, child.stderr]) {
      let pending = '', discarding = false
      stream?.on('data', chunk => {
        const text = String(chunk)
        for (const part of text.split(/(?<=\n)/)) {
          if (!discarding) pending += part
          if (part.endsWith('\n')) { if (pending) input.onLog(pending.trimEnd()); pending = ''; discarding = false }
          else if (pending.length > 65536) { input.onLog(pending.slice(0, 8192) + ' [line truncated]'); pending = ''; discarding = true }
        }
      })
      stream?.once('end', () => { if (pending) input.onLog(pending) })
    }
    if (child.exitCode !== null) finish(child.exitCode)
    return child
  } catch { throw new Error('Minecraft could not start. Check your Java executable and game files, then retry. See Logs for launcher activity.') }
}
