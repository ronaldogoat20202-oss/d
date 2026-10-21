import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'
import type { GameProfile, Loader, NewProfile } from '../../shared/profiles'
import { assertVersionId } from './network'
import { safeDestination } from './downloads'
interface Stored { schema: 1; profiles: GameProfile[]; selected: string | null; migrated: boolean }
function name(value: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 64 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Profile name must contain 1–64 readable characters.')
  return value.trim()
}
export class ProfileStore {
  private state: Stored | null = null
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private directory: string) {}
  private async load(): Promise<Stored> {
    if (this.state) return this.state
    const file = join(this.directory, 'profiles.json')
    let text: string
    try { text = await readFile(file, 'utf8') } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; return this.state = { schema: 1, profiles: [], selected: null, migrated: false } }
    try {
      const s = JSON.parse(text) as Stored
      if (s.schema !== 1 || !Array.isArray(s.profiles) || s.profiles.length > 1000 || typeof s.migrated !== 'boolean') throw new Error('Invalid profiles')
      const ids = new Set<string>()
      for (const p of s.profiles) {
        if (!p || !/^[a-f0-9-]{36}$/.test(p.id) || ids.has(p.id) || !isAbsolute(p.libraryRoot) || typeof p.legacy !== 'boolean') throw new Error('Invalid profile')
        name(p.name); assertVersionId(p.minecraftVersion); ids.add(p.id)
        if (!p.loader || !['vanilla', 'fabric'].includes(p.loader.kind)) throw new Error('Invalid loader')
        if (p.loader.kind === 'fabric') assertVersionId(p.loader.version)
        if (p.gameDirectory !== (p.legacy ? p.libraryRoot : join(p.libraryRoot, 'instances', p.id))) throw new Error('Invalid profile path')
      }
      if (s.selected !== null && !ids.has(s.selected)) throw new Error('Invalid selection')
      return this.state = s
    } catch {
      await copyFile(file, join(this.directory, `profiles.corrupt-${randomUUID()}.json`))
      return this.state = { schema: 1, profiles: [], selected: null, migrated: false }
    }
  }
  private mutate<T>(fn: (s: Stored) => Promise<T> | T): Promise<T> {
    const task = this.queue.then(async () => {
      const next = structuredClone(await this.load()), result = await fn(next)
      await mkdir(this.directory, { recursive: true })
      const temp = join(this.directory, `profiles.${randomUUID()}.tmp`)
      await writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600 }); await rename(temp, join(this.directory, 'profiles.json'))
      this.state = next; return structuredClone(result)
    })
    this.queue = task.catch(() => undefined); return task
  }
  async list(): Promise<GameProfile[]> { await this.queue; return structuredClone((await this.load()).profiles) }
  async selected(): Promise<GameProfile | null> { await this.queue; const s = await this.load(); return structuredClone(s.profiles.find(p => p.id === s.selected) || null) }
  migrateLegacy(root: string, releaseId: string | null): Promise<GameProfile | null> {
    return this.mutate(s => {
      if (s.migrated || !releaseId) return s.profiles.find(p => p.legacy) || null
      if (!isAbsolute(root)) throw new Error('Choose an absolute game library.')
      assertVersionId(releaseId)
      const p: GameProfile = { id: randomUUID(), name: 'Existing Vanilla', minecraftVersion: releaseId, loader: { kind: 'vanilla' }, libraryRoot: resolve(root), gameDirectory: resolve(root), legacy: true }
      s.profiles.push(p); s.selected = p.id; s.migrated = true; return p
    })
  }
  create(input: NewProfile, libraryRoot: string, loader: Loader): Promise<GameProfile> {
    return this.mutate(async s => {
      if (!input || !isAbsolute(libraryRoot)) throw new Error('Choose an absolute game library.')
      const label = name(input.name); assertVersionId(input.minecraftVersion)
      if (!loader || !['vanilla', 'fabric'].includes(loader.kind) || input.loader !== loader.kind) throw new Error('Choose a supported loader.')
      if (loader.kind === 'fabric') assertVersionId(loader.version)
      const id = randomUUID(), root = resolve(libraryRoot), gameDirectory = join(root, 'instances', id)
      await mkdir(root, { recursive: true }); await safeDestination(root, gameDirectory); await mkdir(gameDirectory, { recursive: true })
      const p: GameProfile = { id, name: label, minecraftVersion: input.minecraftVersion, loader, libraryRoot: root, gameDirectory, legacy: false }
      s.profiles.push(p); s.selected = id; return p
    })
  }
  select(id: string): Promise<GameProfile> { return this.mutate(s => { const p = s.profiles.find(p => p.id === id); if (!p) throw new Error('Select an available game profile.'); s.selected = id; return p }) }
  rename(id: string, value: string): Promise<void> { return this.mutate(s => { const p = s.profiles.find(p => p.id === id); if (!p) throw new Error('Select an available game profile.'); p.name = name(value) }) }
  remove(id: string): Promise<void> { return this.mutate(s => { if (!s.profiles.some(p => p.id === id)) throw new Error('Select an available game profile.'); s.profiles = s.profiles.filter(p => p.id !== id); if (s.selected === id) s.selected = null }) }
}
