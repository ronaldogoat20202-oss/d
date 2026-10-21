import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { isAbsolute, join, win32 } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Settings } from '../../shared/contracts'
import type { RuntimePort } from './types'

export const validClientId = (value: string) => value === '' || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export async function pickSetting(store: SettingsStore, open: () => Promise<{ canceled: boolean; filePaths: string[] }>, key: 'javaPath' | 'gameDirectory'): Promise<Settings> {
  const result = await open()
  if (result.canceled || !result.filePaths.length) return store.read()
  return store.update({ [key]: result.filePaths[0] })
}

export class SettingsStore {
  private cached: Settings | null = null
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private directory: string, private runtime: RuntimePort) {}
  private defaults(): Settings {
    const cap = Math.floor(this.runtime.totalMemoryBytes * .75 / 1048576)
    if (cap < 1024) throw new Error('Insufficient memory: at least 1024 MiB must be available for Minecraft.')
    return { clientId: '', javaPath: '', gameDirectory: join(this.directory, 'minecraft'), maxMemoryMiB: Math.min(2048, cap) }
  }
  private validate(value: Settings): Settings {
    for (const [key, item] of Object.entries(value)) {
      if (!['clientId', 'javaPath', 'gameDirectory', 'maxMemoryMiB'].includes(key)) throw new Error('Unknown launcher setting.')
      if (key !== 'maxMemoryMiB' && typeof item !== 'string') throw new Error('Invalid launcher setting.')
    }
    if (!validClientId(value.clientId)) throw new Error('Microsoft client ID must be a valid application UUID, or empty.')
    for (const key of ['javaPath', 'gameDirectory'] as const) {
      const path = value[key]
      if (path.includes('\0')) throw new Error('Paths cannot contain NUL characters.')
      if ((path || key === 'gameDirectory') && !(isAbsolute(path) || win32.isAbsolute(path))) throw new Error('Choose an absolute path.')
    }
    const cap = Math.floor(this.runtime.totalMemoryBytes * .75 / 1048576)
    if (!Number.isInteger(value.maxMemoryMiB) || value.maxMemoryMiB < 1024 || value.maxMemoryMiB > cap)
      throw new Error(`Memory must be an integer from 1024 to ${cap} MiB (75% of system memory).`)
    return value
  }
  async read(): Promise<Settings> {
    if (this.cached) return { ...this.cached }
    const defaults = this.defaults()
    let text: string
    try { text = await readFile(join(this.directory, 'settings.json'), 'utf8') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Unable to read launcher preferences. Check the application-data directory permissions.')
      this.cached = defaults
      return { ...defaults }
    }
    try {
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid preferences')
      this.cached = this.validate({ ...defaults, ...parsed })
    } catch {
      await copyFile(join(this.directory, 'settings.json'), join(this.directory, `settings.corrupt-${Date.now()}-${randomUUID()}.json`))
      this.cached = defaults
    }
    return { ...this.cached }
  }
  update(patch: Partial<Settings>): Promise<Settings> {
    const update = this.queue.then(async () => {
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings update.')
      const value = this.validate({ ...await this.read(), ...patch })
      await mkdir(this.directory, { recursive: true })
      const temp = join(this.directory, `settings.${randomUUID()}.tmp`)
      try {
        await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 })
        await rename(temp, join(this.directory, 'settings.json'))
      } catch { throw new Error('Unable to save preferences. Check the application-data directory permissions.') }
      this.cached = value
      return { ...value }
    })
    this.queue = update.catch(() => undefined)
    return update
  }
}
