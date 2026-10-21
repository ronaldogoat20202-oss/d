import type { AccountIdentity, AccountIndex, AccountKind } from '../../shared/accounts'
import type { GameSession, MicrosoftSession } from './types'
import { validClientId } from './settings'
import type { AccountStore } from './account-store'

export interface AuthPort {
  authenticate(clientId: string, openBrowser: (url: string) => Promise<void>, signal: AbortSignal): Promise<MicrosoftSession>
  refresh(clientId: string, signal: AbortSignal): Promise<MicrosoftSession>
  serialize(): string
  deserialize(clientId: string, cache: string): void
  clear(): void
}
type CachePort = { load(): Promise<string | null>; save(value: string): Promise<boolean>; clear(): Promise<void> }
const cancelled = () => new Error('Sign-in was cancelled. Start again when you are ready.')
export class AccountService {
  private profile: AccountIdentity | null = null
  private generation = 0
  private clientId = ''
  private persistent = false
  private commits: Promise<unknown> = Promise.resolve()
  constructor(private auth: AuthPort, private cache: CachePort, private store?: AccountStore) {}
  current(): AccountIdentity | null { return this.profile ? { ...this.profile } : null }
  isPersistent(): boolean { return this.profile?.kind === 'offline' || this.persistent }
  async index(): Promise<AccountIndex> { return this.store ? this.store.read() : { accounts: this.profile ? [this.profile] : [], selected: this.current() } }
  private validateId(id: string): void { if (!id || !validClientId(id)) throw new Error('Orbit Microsoft application client ID is not configured by the publisher. You can use an offline profile.') }
  private guard(generation: number, signal?: AbortSignal): void { if (generation !== this.generation || signal?.aborted) throw cancelled() }
  private async accept(session: MicrosoftSession, id: string, generation: number, signal: AbortSignal): Promise<void> {
    const commit = this.commits.then(async () => {
      this.guard(generation, signal)
      if (session.kind !== 'microsoft' || !session.accessToken || !session.profile?.id || !session.profile.name || !session.xuid || session.clientId !== id) throw new Error('Minecraft did not return a complete authenticated profile. Sign in again.')
      const previous = await this.cache.load(); this.guard(generation, signal)
      this.persistent = await this.cache.save(JSON.stringify({ clientId: id, cache: this.auth.serialize() }))
      try { this.guard(generation, signal) } catch (e) { if (previous) await this.cache.save(previous); else await this.cache.clear(); throw e }
      await this.store?.rememberMicrosoft(session.profile)
      this.guard(generation, signal)
      this.profile = { ...session.profile }
    })
    this.commits = commit.catch(() => undefined); await commit
  }
  async signIn(id: string, openBrowser: (url: string) => Promise<void>, signal: AbortSignal): Promise<AccountIdentity> {
    this.validateId(id)
    const generation = ++this.generation
    this.guard(generation, signal)
    this.profile = null; this.persistent = false; this.clientId = id; this.auth.clear()
    await this.store?.clearSelection(); this.guard(generation, signal)
    try {
      const session = await this.auth.authenticate(id, async url => { this.guard(generation, signal); await openBrowser(url) }, signal)
      await this.accept(session, id, generation, signal)
      return { ...session.profile }
    } catch (error) { if (generation === this.generation) this.profile = null; throw error }
  }
  async session(id: string): Promise<GameSession> {
    if (!this.profile && this.store) {
      const selected = (await this.store.read()).selected
      if (!selected) throw new Error('Select an account or create an offline profile before playing.')
      this.profile = selected
    }
    if (this.profile?.kind === 'offline') return { kind: 'offline', profile: { ...this.profile } }
    this.validateId(id)
    if (this.clientId && this.clientId !== id) { await this.signOut(); throw new Error('Orbit application changed. Sign in again.') }
    const generation = this.generation, expected = this.profile?.id
    this.clientId = id
    const signal = AbortSignal.timeout(60000)
    try {
      const raw = await this.cache.load(); this.guard(generation)
      if (raw) {
        try { const stored = JSON.parse(raw) as { clientId: string; cache: string }; if (stored.clientId === id && typeof stored.cache === 'string') this.auth.deserialize(id, stored.cache) } catch { /* corrupt cache requires sign-in */ }
      }
      const result = await this.auth.refresh(id, signal)
      if (expected && result.profile.id !== expected) throw new Error('Saved Microsoft account no longer matches.')
      await this.accept(result, id, generation, signal)
      return result
    } catch {
      if (generation !== this.generation) throw cancelled()
      await this.signOut()
      throw new Error('Your Microsoft session could not be refreshed. Please sign in again; check your connection if the problem continues.')
    }
  }
  async createOffline(name: string): Promise<AccountIdentity> {
    if (!this.store) throw new Error('Local account storage is unavailable.')
    const generation = ++this.generation
    const profile = await this.store.createOffline(name); this.guard(generation)
    this.auth.clear(); this.profile = profile; return profile
  }
  async select(kind: AccountKind, id: string): Promise<AccountIdentity> {
    if (!this.store) throw new Error('Local account storage is unavailable.')
    const generation = ++this.generation
    const profile = await this.store.select(kind, id); this.guard(generation)
    this.auth.clear(); this.profile = profile; return profile
  }
  async remove(kind: AccountKind, id: string): Promise<void> {
    if (!this.store) throw new Error('Local account storage is unavailable.')
    ++this.generation
    if (this.profile?.kind === kind && this.profile.id === id) { this.profile = null; this.auth.clear() }
    await this.store.remove(kind, id)
    if (kind === 'microsoft') { await this.commits; await this.cache.clear() }
  }
  async cancelSignIn(): Promise<void> { this.generation++; this.profile = null; this.auth.clear(); await this.store?.clearSelection() }
  async signOut(): Promise<void> {
    const profile = this.profile
    this.generation++; this.profile = null; this.clientId = ''; this.persistent = false; this.auth.clear()
    await this.store?.clearSelection(); await this.commits
    if (profile?.kind !== 'offline') {
      await this.cache.clear()
      const remembered = (await this.store?.read())?.accounts.find(a => a.kind === 'microsoft')
      if (remembered) await this.store?.remove('microsoft', remembered.id)
    }
  }
}
