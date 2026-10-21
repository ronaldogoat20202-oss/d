import { PublicClientApplication, CryptoProvider, type INetworkModule, type NetworkRequestOptions, type NetworkResponse } from '@azure/msal-node'
import { MicrosoftAuthenticator, MojangClient } from '@xmcl/user'
import { randomBytes } from 'node:crypto'
import { openOAuthCallback } from '../services/oauth-callback'
import type { AuthPort } from '../services/accounts'
import type { GameSession } from '../services/types'
import { networkFetch, type FetchPort } from '../services/network'

const scopes = ['XboxLive.signin', 'offline_access']
async function msalRequest<T>(url: string, method: string, options?: NetworkRequestOptions): Promise<NetworkResponse<T>> {
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:' || !['login.microsoftonline.com', 'login.live.com'].includes(parsed.hostname)) throw new Error('Unexpected Microsoft authentication endpoint.')
  const response = await networkFetch(url, { method, headers: options?.headers, body: options?.body, signal: AbortSignal.timeout(30000) })
  return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body: await response.json() as T }
}
const networkClient: INetworkModule = {
  sendGetRequestAsync: <T>(url: string, options?: NetworkRequestOptions) => msalRequest<T>(url, 'GET', options),
  sendPostRequestAsync: <T>(url: string, options?: NetworkRequestOptions) => msalRequest<T>(url, 'POST', options)
}
export class MinecraftAuthAdapter implements AuthPort {
  private client: PublicClientApplication | null = null
  private id = ''
  constructor(private fetcher: FetchPort = networkFetch) {}
  private application(id: string): PublicClientApplication {
    if (!this.client || this.id !== id) {
      this.id = id
      this.client = new PublicClientApplication({ auth: { clientId: id, authority: 'https://login.microsoftonline.com/consumers' }, system: { networkClient, loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} } } })
    }
    return this.client
  }
  serialize(): string { return this.client?.getTokenCache().serialize() || '{}' }
  deserialize(id: string, cache: string): void { this.application(id).getTokenCache().deserialize(cache) }
  clear(): void { this.client = null; this.id = '' }
  async authenticate(id: string, openBrowser: (url: string) => Promise<void>, signal: AbortSignal): Promise<GameSession> {
    const application = this.application(id)
    const state = randomBytes(32).toString('hex')
    const callback = await openOAuthCallback({ state, signal })
    try {
      const pkce = await new CryptoProvider().generatePkceCodes()
      const url = await application.getAuthCodeUrl({ scopes, redirectUri: callback.redirectUri, state, codeChallenge: pkce.challenge, codeChallengeMethod: 'S256', prompt: 'select_account' })
      if (signal.aborted) throw new Error('Sign-in cancelled.')
      await openBrowser(url)
      const code = await callback.code
      const token = await application.acquireTokenByCode({ code, scopes, redirectUri: callback.redirectUri, codeVerifier: pkce.verifier })
      if (!token?.accessToken || signal.aborted) throw new Error('Sign-in cancelled.')
      return await this.exchange(token.accessToken, id, signal)
    } catch (error) {
      if (signal.aborted) throw new Error('Microsoft sign-in was cancelled.')
      if (error instanceof AuthenticationFailure) throw error
      throw new Error('Microsoft browser sign-in failed or expired. Check Orbit application registration and your connection, then try again.')
    } finally { await callback.close() }
  }
  async refresh(id: string, signal: AbortSignal): Promise<GameSession> {
    const application = this.application(id)
    const accounts = await application.getTokenCache().getAllAccounts()
    if (!accounts.length) throw new Error('Please sign in with Microsoft first.')
    const token = await application.acquireTokenSilent({ scopes, account: accounts[0] })
    if (!token?.accessToken) throw new Error('Please sign in again.')
    return this.exchange(token.accessToken, id, signal)
  }
  private async exchange(token: string, id: string, signal: AbortSignal): Promise<GameSession> {
    const authFetch: typeof fetch = (input, init) => this.fetcher(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init)
    const xbox = new MicrosoftAuthenticator({ fetch: authFetch })
    const minecraft = new MojangClient({ fetch: authFetch as unknown as typeof import('undici').fetch })
    try {
      const { minecraftXstsResponse, liveXstsResponse } = await xbox.acquireXBoxToken(token, signal)
      const claim = minecraftXstsResponse.DisplayClaims.xui[0]
      const xuid = liveXstsResponse?.DisplayClaims.xui[0]?.xid || claim.xid
      const game = await xbox.loginMinecraftWithXBox(claim.uhs, minecraftXstsResponse.Token, signal)
      const ownership = await minecraft.checkGameOwnership(game.access_token, signal)
      if (!ownership.items?.some(item => ['game_minecraft', 'product_minecraft'].includes(item.name))) throw new AuthenticationFailure('This Microsoft account does not own Minecraft Java Edition. Use an account with a Java entitlement.')
      const profile = await minecraft.getProfile(game.access_token, signal)
      if (!profile.id || !profile.name || !xuid) throw new AuthenticationFailure('Minecraft or Xbox did not return a complete player profile. Complete account setup and try again.')
      return { accessToken: game.access_token, profile: { id: profile.id, name: profile.name }, clientId: id, xuid }
    } catch (error) {
      if (error instanceof AuthenticationFailure) throw error
      throw new AuthenticationFailure('Xbox or Minecraft authorization failed. Check your Xbox account setup, Minecraft application API access, and connection, then retry.')
    }
  }
}
class AuthenticationFailure extends Error {}
