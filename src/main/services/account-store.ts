import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AccountIdentity, AccountIndex, AccountKind } from '../../shared/accounts'

export function offlineUuid(name: string): string {
  if (typeof name !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error('Username must contain 3–16 letters, digits, or underscores.')
  const bytes = createHash('md5').update(`OfflinePlayer:${name}`).digest()
  bytes[6] = (bytes[6] & 15) | 48; bytes[8] = (bytes[8] & 63) | 128
  return bytes.toString('hex')
}
interface Stored { schema: 1; accounts: AccountIdentity[]; selected: string | null }
const key = (a: AccountIdentity) => `${a.kind}:${a.id}`
export class AccountStore {
  private state: Stored | null = null
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private directory: string) {}
  private async load(): Promise<Stored> {
    if (this.state) return this.state
    const path = join(this.directory, 'accounts.json')
    let text: string
    try { text = await readFile(path, 'utf8') } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; return this.state = { schema: 1, accounts: [], selected: null } }
    try {
      const s = JSON.parse(text) as Stored
      if (s.schema !== 1 || !Array.isArray(s.accounts) || s.accounts.length > 1000) throw new Error('Invalid accounts')
      const keys = new Set<string>(), names = new Set<string>()
      let microsoft = 0
      for (const a of s.accounts) {
        if (!a || !['offline', 'microsoft'].includes(a.kind) || !/^[a-f0-9]{32}$/i.test(a.id) || typeof a.name !== 'string' || !/^[A-Za-z0-9_]{1,16}$/.test(a.name)) throw new Error('Invalid account')
        if (a.kind === 'offline' && (offlineUuid(a.name) !== a.id || names.has(a.name.toLowerCase()))) throw new Error('Invalid offline identity')
        if (a.kind === 'offline') names.add(a.name.toLowerCase())
        if (a.kind === 'microsoft' && ++microsoft > 1) throw new Error('Duplicate Microsoft account')
        if (keys.has(key(a))) throw new Error('Duplicate account'); keys.add(key(a))
      }
      if (s.selected !== null && !keys.has(s.selected)) throw new Error('Invalid selection')
      return this.state = { schema: 1, accounts: s.accounts.map(({ kind, id, name }) => ({ kind, id, name })), selected: s.selected }
    } catch {
      await copyFile(path, join(this.directory, `accounts.corrupt-${randomUUID()}.json`))
      return this.state = { schema: 1, accounts: [], selected: null }
    }
  }
  async read(): Promise<AccountIndex> {
    await this.queue
    const s = await this.load()
    return structuredClone({ accounts: s.accounts, selected: s.accounts.find(a => key(a) === s.selected) || null })
  }
  private mutate<T>(change: (s: Stored) => T): Promise<T> {
    const operation = this.queue.then(async () => {
      const next = structuredClone(await this.load()), result = change(next)
      await mkdir(this.directory, { recursive: true })
      const temp = join(this.directory, `accounts.${randomUUID()}.tmp`)
      await writeFile(temp, JSON.stringify(next, null, 2), { mode: 0o600 })
      await rename(temp, join(this.directory, 'accounts.json'))
      this.state = next; return structuredClone(result)
    })
    this.queue = operation.catch(() => undefined); return operation
  }
  createOffline(name: string): Promise<AccountIdentity> {
    return this.mutate(s => {
      const id = offlineUuid(name)
      if (s.accounts.some(a => a.kind === 'offline' && a.name.toLowerCase() === name.toLowerCase())) throw new Error('That offline username already exists.')
      const a: AccountIdentity = { kind: 'offline', id, name }; s.accounts.push(a); s.selected = key(a); return a
    })
  }
  rememberMicrosoft(profile: AccountIdentity): Promise<void> {
    return this.mutate(s => {
      if (profile.kind !== 'microsoft' || !/^[a-f0-9]{32}$/i.test(profile.id) || !/^[A-Za-z0-9_]{1,16}$/.test(profile.name)) throw new Error('Invalid Microsoft profile.')
      const a: AccountIdentity = { kind: 'microsoft', id: profile.id, name: profile.name }
      s.accounts = [...s.accounts.filter(a => a.kind !== 'microsoft'), a]; s.selected = key(a)
    })
  }
  select(kind: AccountKind, id: string): Promise<AccountIdentity> {
    return this.mutate(s => { const a = s.accounts.find(a => a.kind === kind && a.id === id); if (!a) throw new Error('Select a saved account.'); s.selected = key(a); return a })
  }
  remove(kind: AccountKind, id: string): Promise<void> {
    return this.mutate(s => { const target = `${kind}:${id}`; s.accounts = s.accounts.filter(a => key(a) !== target); if (s.selected === target) s.selected = null })
  }
  clearSelection(): Promise<void> { return this.mutate(s => { s.selected = null }) }
}
