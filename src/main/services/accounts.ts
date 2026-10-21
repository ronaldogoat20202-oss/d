import type { AccountSummary, DeviceInstructions } from '../../shared/contracts'
import type { GameSession } from './types'
import { validClientId } from './settings'

export interface AuthPort {
  authenticate(clientId: string, onCode: (code: DeviceInstructions) => void, signal: AbortSignal): Promise<GameSession>
  refresh(clientId: string, signal: AbortSignal): Promise<GameSession>
  serialize(): string
  deserialize(clientId: string, cache: string): void
  clear(): void
}
type CachePort = { load(): Promise<string | null>; save(value: string): Promise<boolean>; clear(): Promise<void> }
const cancelled = () => new Error('Sign-in was cancelled. Start again when you are ready.')
export class AccountService {
  private profile: AccountSummary | null = null
  private generation = 0
  private clientId = ''
  private persistent = false
  constructor(private auth: AuthPort, private cache: CachePort) {}
  current(): AccountSummary | null { return this.profile ? { ...this.profile } : null }
  isPersistent(): boolean { return this.persistent }
  private validateId(id: string): void { if (!id || !validClientId(id)) throw new Error('Set your own Microsoft application client ID in Settings before signing in.') }
  private guard(generation: number, signal?: AbortSignal): void { if (generation !== this.generation || signal?.aborted) throw cancelled() }
  private async accept(session: GameSession, id: string, generation: number, signal: AbortSignal): Promise<void> {
    this.guard(generation, signal)
    if (!session.accessToken || !session.profile?.id || !session.profile.name || !session.xuid || session.clientId !== id) throw new Error('Minecraft did not return a complete authenticated profile. Sign in again.')
    this.persistent = await this.cache.save(JSON.stringify({ clientId: id, cache: this.auth.serialize() }))
    this.guard(generation, signal)
    this.profile = { ...session.profile }
  }
  async signIn(id: string, onCode: (code: DeviceInstructions) => void, signal: AbortSignal): Promise<AccountSummary> {
    this.validateId(id)
    const generation = ++this.generation
    this.guard(generation, signal)
    this.profile = null; this.persistent = false; this.clientId = id; this.auth.clear()
    try {
      const session = await this.auth.authenticate(id, code => { this.guard(generation, signal); onCode(code) }, signal)
      await this.accept(session, id, generation, signal)
      return { ...session.profile }
    } catch (error) { if (generation === this.generation) this.profile = null; throw error }
  }
  async session(id: string): Promise<GameSession> {
    this.validateId(id)
    if (this.clientId && this.clientId !== id) await this.signOut()
    const generation = this.generation
    this.clientId = id
    const signal = AbortSignal.timeout(60000)
    try {
      if (!this.profile) {
        const raw = await this.cache.load(); this.guard(generation)
        if (raw) {
          try { const stored = JSON.parse(raw) as { clientId: string; cache: string }; if (stored.clientId === id && typeof stored.cache === 'string') this.auth.deserialize(id, stored.cache) } catch { /* a corrupt cache requires sign-in */ }
        }
      }
      const result = await this.auth.refresh(id, signal)
      await this.accept(result, id, generation, signal)
      return result
    } catch {
      if (generation !== this.generation) throw cancelled()
      await this.signOut()
      throw new Error('Your session could not be refreshed. Please sign in again; check your connection if the problem continues.')
    }
  }
  async signOut(): Promise<void> {
    this.generation++; this.profile = null; this.clientId = ''; this.persistent = false; this.auth.clear()
    await this.cache.clear()
  }
}
