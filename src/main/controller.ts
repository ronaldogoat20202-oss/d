import type { AccountKind, GameProfile, Loader, NewProfile, LauncherApi, PublicError, Settings, Snapshot } from '../shared/contracts'
import { mkdir } from 'node:fs/promises'
import { safeDestination } from './services/downloads'
import type { ProfileStore } from './services/profiles'
import type { SettingsStore } from './services/settings'
import type { VersionService } from './services/versions'
import type { InstallService } from './services/installer'
import type { FabricService } from './services/fabric'
import type { AddonService,ContentRequest } from './services/addons'
import type { ModrinthCatalog } from './adapters/modrinth'
import type { AddonKind,CatalogQuery } from '../shared/addons'
import type { AccountService } from './services/accounts'
import type { JavaService } from './services/java'
import type { LogService } from './services/logs'
import type { launchGame } from './services/game'
import { resolveClientId } from './services/auth-config'
import type { RuntimePort } from './services/types'

export interface ControllerDependencies {
  profiles: Pick<ProfileStore, 'list' | 'selected' | 'migrateLegacy' | 'create' | 'select' | 'rename' | 'remove'>
  configuredClientId?: string
  settings: Pick<SettingsStore, 'read' | 'update'>
  versions: Pick<VersionService, 'list'>
  installer: Pick<InstallService, 'ensure' | 'inspect'>
  fabric?: Pick<FabricService, 'listLoaders' | 'ensure' | 'inspect'>
  addons?: AddonService
  catalog?: ModrinthCatalog
  pickAddon?: (kind:AddonKind)=>Promise<string|null>
  accounts: Pick<AccountService, 'current' | 'signIn' | 'signOut' | 'session' | 'isPersistent' | 'index' | 'createOffline' | 'select' | 'remove' | 'cancelSignIn'>
  java: Pick<JavaService, 'verify' | 'detect'>
  logs: LogService
  launch: typeof launchGame
  runtime: RuntimePort
  pickJava?: () => Promise<string | null>
  pickGameDirectory?: () => Promise<string | null>
  openVerification?: (url: string) => Promise<void>
  writeClipboard?: (text: string) => void
}
export class Controller {
  private state!: Snapshot
  private listeners = new Set<(state: Snapshot) => void>()
  private authRequest: AbortController | null = null
  private editing = false
  private refreshing = false
  private accountRevision = 0
  private profileRevision = 0
  constructor(private deps: ControllerDependencies) {}
  async initialize(): Promise<void> {
    const stored = await this.deps.settings.read()
    const settings = { ...stored, clientId: resolveClientId(this.deps.configuredClientId || '', stored.clientId) || '' }
    this.state = { settings, accounts: (await this.deps.accounts.index()).accounts, microsoftConfigured: !!settings.clientId, account: { status: 'signedOut' }, releases: [], profiles: await this.deps.profiles.list(), selectedProfileId: (await this.deps.profiles.selected())?.id || null, profileInstallation: 'unknown', operation: { phase: 'idle' }, logs: [], error: null, offline: false }
  }
  async snapshot(): Promise<Snapshot> { return structuredClone({ ...this.state, logs: this.deps.logs.entries() }) }
  subscribe(listener: (state: Snapshot) => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private emit(): void {
    const state = structuredClone({ ...this.state, logs: this.deps.logs.entries() })
    for (const listener of this.listeners) listener(state)
  }
  private idle(): void { if (this.state.operation.phase !== 'idle' || this.editing) throw new Error('Another operation is in progress or Minecraft is running. Wait before making this change.') }
  private failure(error: unknown, code: string): Error {
    const message = error instanceof Error ? error.message : 'The operation failed. Please retry.'
    const publicError: PublicError = { code, message }
    this.state.error = publicError; this.deps.logs.append('error', message)
    if (!this.deps.accounts.current() && this.state.account.status !== 'signingIn') this.state.account = { status: 'signedOut' }
    this.emit(); return new Error(message)
  }
  async refreshVersions(): Promise<void> {
    this.idle(); if (this.refreshing) return; this.refreshing = true
    try {
      const list = await this.deps.versions.list()
      this.state.releases = list.releases; this.state.offline = list.cached; this.state.error = null
      if (this.state.operation.phase === 'idle' && !this.editing) {
        await this.deps.profiles.migrateLegacy(this.state.settings.gameDirectory, list.latestReleaseId)
        this.state.profiles = await this.deps.profiles.list()
        const selected = await this.deps.profiles.selected()
        if (selected) await this.selectProfile(selected.id)
      }
      this.deps.logs.append('info', list.cached ? 'Using cached releases while offline.' : 'Official Minecraft release list updated.')
    } catch (e) { this.state.offline = true; throw this.failure(e, 'VERSIONS_UNAVAILABLE') }
    finally { this.refreshing = false; this.emit() }
  }
  private profile() { const p = this.state.profiles.find(p => p.id === this.state.selectedProfileId); if (!p) throw new Error('Choose a game profile first.'); return p }
  private profileChanged(){this.profileRevision++;this.deps.addons?.invalidatePlans()}
  private installer(profile: GameProfile): Pick<InstallService, 'ensure'|'inspect'> {
    if (profile.loader.kind === 'vanilla') return this.deps.installer
    const fabric = this.deps.fabric, loader = profile.loader.version
    if (!fabric) throw new Error('Fabric support is unavailable in this build.')
    return {ensure:(base,root,progress)=>fabric.ensure(base,loader,root,progress),inspect:(base,root)=>fabric.inspect(base,loader,root)}
  }
  async selectProfile(id: string): Promise<Snapshot> {
    this.idle(); this.editing = true
    try {
      const p = await this.deps.profiles.select(id)
      this.profileChanged()
      this.state.profiles = await this.deps.profiles.list(); this.state.selectedProfileId = p.id; this.state.profileInstallation = 'unknown'
      const release = this.state.releases.find(r => r.id === p.minecraftVersion)
      if (release) this.state.profileInstallation = await this.installer(p).inspect(release,p.libraryRoot) ? 'installed' : 'missing'
      this.state.error = null; this.emit(); return this.snapshot()
    } finally { this.editing = false }
  }
  async createProfile(input: NewProfile): Promise<Snapshot> {
    this.idle(); this.editing = true
    try {
      if (!input || !this.state.releases.some(r => r.id === input.minecraftVersion)) throw new Error('Choose an available official Minecraft release.')
      let loader: Loader = {kind:'vanilla'}
      if (input.loader === 'fabric') {
        const stable = (await this.deps.fabric?.listLoaders(input.minecraftVersion))?.find(l=>l.stable)
        if (!stable) throw new Error('No stable Fabric loader is available for this Minecraft version.')
        loader = {kind:'fabric',version:stable.version}
      } else if (input.loader !== 'vanilla') throw new Error('Choose Vanilla or Fabric.')
      const p = await this.deps.profiles.create(input, this.state.settings.gameDirectory, loader)
      this.profileChanged()
      this.state.profiles = await this.deps.profiles.list(); this.state.selectedProfileId = p.id; this.state.profileInstallation = 'missing'; this.state.error = null
      this.emit(); return this.snapshot()
    } finally { this.editing = false }
  }
  async renameProfile(id: string, name: string): Promise<Snapshot> {
    this.idle(); this.editing = true
    try { await this.deps.profiles.rename(id,name); this.state.profiles = await this.deps.profiles.list(); this.emit(); return this.snapshot() } finally { this.editing = false }
  }
  async removeProfile(id: string): Promise<Snapshot> {
    this.idle(); this.editing = true
    try {
      await this.deps.profiles.remove(id); this.state.profiles = await this.deps.profiles.list(); this.state.selectedProfileId = (await this.deps.profiles.selected())?.id || null
      this.profileChanged()
      this.state.profileInstallation = 'unknown'; this.deps.logs.append('info','Profile removed from Orbit. Its worlds and files have been retained.'); this.emit(); return this.snapshot()
    } finally { this.editing = false }
  }
  async saveSettings(patch: Partial<Settings>): Promise<Snapshot> {
    this.idle(); this.editing = true
    try {
      const previous = this.state.settings
      const saved = await this.deps.settings.update(patch)
      const settings = { ...saved, clientId: resolveClientId(this.deps.configuredClientId || '', saved.clientId) || '' }
      if (settings.clientId !== previous.clientId) { this.accountRevision++; this.authRequest?.abort(); await this.deps.accounts.signOut(); this.state.account = { status: 'signedOut' } }
      this.state.settings = settings; this.state.microsoftConfigured = !!settings.clientId; this.state.error = null; this.emit(); return this.snapshot()
    } catch (e) { throw this.failure(e, 'SETTINGS_INVALID') } finally { this.editing = false }
  }
  async chooseJava(): Promise<Snapshot> { const path = await this.deps.pickJava?.(); return path ? this.saveSettings({ javaPath: path }) : this.snapshot() }
  async chooseGameDirectory(): Promise<Snapshot> { const path = await this.deps.pickGameDirectory?.(); return path ? this.saveSettings({ gameDirectory: path }) : this.snapshot() }
  async signIn(): Promise<void> {
    if (this.authRequest) throw new Error('Sign-in is already in progress.')
    this.accountRevision++
    const request = new AbortController(); this.authRequest = request
    this.state.account = { status: 'signingIn' }; this.state.error = null; this.emit()
    try {
      const profile = await this.deps.accounts.signIn(this.state.settings.clientId, async url => {
        if (!this.deps.openVerification) throw new Error('System browser is unavailable.')
        await this.deps.openVerification(url)
      }, request.signal)
      if (!request.signal.aborted) { this.state.account = { status: 'signedIn', profile, persistent: this.deps.accounts.isPersistent() }; this.state.accounts = (await this.deps.accounts.index()).accounts; this.deps.logs.append('info', 'Minecraft account connected.') }
    } catch (e) {
      if (!request.signal.aborted) { this.state.account = { status: 'signedOut' }; throw this.failure(e, 'SIGN_IN_FAILED') }
    } finally { if (this.authRequest === request) this.authRequest = null; this.emit() }
  }
  async cancelSignIn(): Promise<void> { this.accountRevision++; this.authRequest?.abort(); await this.deps.accounts.cancelSignIn(); this.state.account = { status: 'signedOut' }; this.emit() }
  async signOut(): Promise<void> { await this.cancelSignIn(); await this.deps.accounts.signOut(); this.state.accounts = (await this.deps.accounts.index()).accounts; this.deps.logs.append('info', 'Signed out. Local account cache removed.'); this.emit() }
  async restoreAccount(): Promise<void> {
    const selected = (await this.deps.accounts.index()).selected
    if (!selected && !this.state.settings.clientId) return
    const revision = this.accountRevision
    try { const session = await this.deps.accounts.session(this.state.settings.clientId); if (revision !== this.accountRevision || this.deps.accounts.current()?.id !== session.profile.id) return; this.state.account = { status: 'signedIn', profile: session.profile, persistent: this.deps.accounts.isPersistent() }; this.emit() } catch { /* sign-in remains available */ }
  }
  shutdown(): void { this.accountRevision++; this.authRequest?.abort(); this.listeners.clear() }
  async createOfflineAccount(name: string): Promise<Snapshot> {
    this.accountRevision++; this.authRequest?.abort()
    const profile = await this.deps.accounts.createOffline(name)
    this.state.account = { status: 'signedIn', profile, persistent: true }
    this.state.accounts = (await this.deps.accounts.index()).accounts; this.state.error = null; this.emit(); return this.snapshot()
  }
  async selectAccount(kind: AccountKind, id: string): Promise<Snapshot> {
    this.accountRevision++; this.authRequest?.abort()
    const profile = await this.deps.accounts.select(kind, id)
    this.state.account = { status: 'signedIn', profile, persistent: this.deps.accounts.isPersistent() }
    this.state.error = null; this.emit(); return this.snapshot()
  }
  async removeAccount(kind: AccountKind, id: string): Promise<Snapshot> {
    this.accountRevision++; this.authRequest?.abort(); await this.deps.accounts.remove(kind, id)
    if (!this.deps.accounts.current()) this.state.account = { status: 'signedOut' }
    this.state.accounts = (await this.deps.accounts.index()).accounts; this.emit(); return this.snapshot()
  }
  private release() { const release = this.state.releases.find(r => r.id === this.profile().minecraftVersion); if (!release) throw new Error('Choose an official Minecraft release first.'); return release }
  async install(): Promise<void> {
    this.idle(); const profile = this.profile(), release = this.release()
    this.state.operation = { phase: 'installing', versionId: release.id, progress: { completedBytes: 0, totalBytes: null, message: 'Preparing download' } }; this.state.error = null; this.emit()
    this.deps.logs.append('info', `Installing Minecraft ${release.id}.`)
    let lastUpdate = 0
    try {
      await this.installer(profile).ensure(release, profile.libraryRoot, progress => {
        this.state.operation = { phase: 'installing', versionId: release.id, progress }
        if (Date.now() - lastUpdate > 100 || progress.completedBytes === progress.totalBytes) { lastUpdate = Date.now(); this.emit() }
      })
      this.state.profileInstallation = 'installed'
      this.deps.logs.append('info', `Minecraft ${release.id} installation verified.`)
    } catch (e) { this.state.profileInstallation = 'missing'; throw this.failure(e, 'INSTALL_FAILED') }
    finally { this.state.operation = { phase: 'idle' }; this.emit() }
  }
  async launch(): Promise<void> {
    this.idle(); const profile = this.profile(), release = this.release()
    const revision = this.accountRevision
    this.state.operation = { phase: 'launching', versionId: release.id }; this.state.error = null; this.emit()
    let exited = false
    try {
      const version = await this.installer(profile).inspect(release, profile.libraryRoot)
      if (!version) { this.state.profileInstallation = 'missing'; throw new Error('Install or repair this Minecraft release before launching.') }
      await this.deps.addons?.assertReady(profile,version.javaMajor)
      await mkdir(profile.libraryRoot, {recursive:true}); await safeDestination(profile.libraryRoot, profile.gameDirectory + '/.orbit-check'); await mkdir(profile.gameDirectory, {recursive:true})
      const session = await this.deps.accounts.session(this.state.settings.clientId)
      const assertAuthorized = () => {
        if (revision !== this.accountRevision || this.state.selectedProfileId !== profile.id || this.deps.accounts.current()?.id !== session.profile.id || (session.kind === 'microsoft' && this.state.settings.clientId !== session.clientId))
          throw new Error('Your account changed while preparing Minecraft. Sign in and try again.')
      }
      assertAuthorized()
      this.state.account = { status: 'signedIn', profile: session.profile, persistent: this.deps.accounts.isPersistent() }
      let javaPath = this.state.settings.javaPath
      if (!javaPath) {
        const detected = (await this.deps.java.detect()).find(java => java.major === version.javaMajor && java.architecture === 'x64')
        if (detected) javaPath = detected.executable
      }
      await this.deps.java.verify(javaPath, version.javaMajor)
      const cap = Math.floor(this.deps.runtime.totalMemoryBytes * .75 / 1048576)
      if (this.deps.runtime.architecture !== 'x64' || this.state.settings.maxMemoryMiB < 1024 || this.state.settings.maxMemoryMiB > cap) throw new Error('Check x64 Java and memory allocation in Settings before launching.')
      if (session.kind === 'microsoft') this.deps.logs.registerSecret(session.accessToken)
      assertAuthorized()
      await this.deps.launch({ gameDirectory: profile.gameDirectory, settings: { ...this.state.settings, javaPath }, version, session, assertAuthorized,
        onLog: text => { this.deps.logs.append('info', text); this.emit() },
        onExit: code => { if (exited) return; exited = true; this.state.operation = { phase: 'idle' }; this.deps.logs.append(code === 0 ? 'info' : 'error', `Minecraft exited with ${code === null ? 'an interruption' : `code ${code}`}.`); if (code !== 0) this.state.error = { code: 'GAME_EXIT', message: `Minecraft stopped with exit code ${code ?? 'unknown'}. Check Logs and Java settings.` }; this.emit() }
      })
      if (!exited) { this.state.operation = { phase: 'running', versionId: release.id }; this.deps.logs.append('info', `Minecraft ${release.id} process started.`); this.emit() }
    } catch (e) { this.state.operation = { phase: 'idle' }; throw this.failure(e, 'LAUNCH_FAILED') }
  }
  async copyLogs(): Promise<void> { this.deps.writeClipboard?.(this.deps.logs.entries().map(line => `${new Date(line.time).toISOString()} [${line.level}] ${line.message}`).join('\n')) }
  private addons(){if(!this.deps.addons)throw new Error('The content library is unavailable in this build.');return this.deps.addons}
  private kind(value:unknown):asserts value is AddonKind{if(!['mod','resourcepack','datapack','shader'].includes(value as string))throw new Error('Invalid content kind.')}
  private identifier(value:unknown):asserts value is string{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw new Error('Invalid library identifier.')}
  private fields(value:unknown,allowed:string[]):void{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw new Error('Invalid library request fields or arguments.')}
  private world(value:unknown):void{if(value!==undefined&&(typeof value!=='string'||value.length>512||!value.includes(':')))throw new Error('Invalid world selection.')}
  private async content<T>(message:string,action:(p:GameProfile,progress:(v:import('../shared/contracts').DownloadProgress)=>void)=>Promise<T>):Promise<T>{
    this.idle();const profile=this.profile();this.state.operation={phase:'content',message,progress:null};this.state.error=null;this.emit()
    try{return await action(profile,progress=>{this.state.operation={phase:'content',message,progress};this.emit()})}
    catch(error){throw this.failure(error,'CONTENT_FAILED')}
    finally{this.state.operation={phase:'idle'};this.emit()}
  }
  async getLibrary(){const profile=this.profile(),revision=this.profileRevision,result=await this.addons().library(profile);if(revision!==this.profileRevision)throw new Error('The game profile changed. Refresh the library.');return result}
  async searchAddons(query:Omit<CatalogQuery,'gameVersion'>){
    this.fields(query,['kind','query','offset','limit']);this.kind(query.kind)
    if(!this.deps.catalog)throw new Error('Modrinth is unavailable.')
    const p=this.profile(),revision=this.profileRevision,result=await this.deps.catalog.search({...query,gameVersion:p.minecraftVersion})
    if(revision!==this.profileRevision)throw new Error('The game profile changed. Search again.');return result
  }
  async addonVersions(projectId:string,kind:AddonKind){this.identifier(projectId);this.kind(kind);if(!this.deps.catalog)throw new Error('Modrinth is unavailable.');const p=this.profile(),revision=this.profileRevision,result=await this.deps.catalog.versions(projectId,{kind,gameVersion:p.minecraftVersion,loader:p.loader.kind});if(revision!==this.profileRevision)throw new Error('The game profile changed. Choose the add-on again.');return result}
  async previewAddon(request:ContentRequest){this.fields(request,['kind','projectId','versionId','worldId']);this.kind(request.kind);if(request.projectId!==undefined)this.identifier(request.projectId);if(request.versionId!==undefined)this.identifier(request.versionId);this.world(request.worldId);return this.content('Checking compatibility and dependencies',(p)=>this.addons().plan(p,request))}
  async installAddon(id:string){this.identifier(id);return this.content('Installing add-ons',(p,progress)=>this.addons().install(p,id,progress))}
  async previewImport(kind:AddonKind,worldId?:string){this.kind(kind);this.world(worldId);return this.content('Inspecting local archive',async p=>{const path=await this.deps.pickAddon?.(kind);return path?this.addons().prepareImport(p,path,kind,worldId):null})}
  async installImport(id:string,allowUnverified:boolean){this.identifier(id);if(typeof allowUnverified!=='boolean')throw new Error('Invalid import confirmation.');return this.content('Importing add-ons',(p,progress)=>this.addons().commitImport(p,id,allowUnverified,progress))}
  async setAddonEnabled(id:string,enabled:boolean){this.identifier(id);if(typeof enabled!=='boolean')throw new Error('Invalid enabled state.');return this.content('Changing installed content',p=>this.addons().setEnabled(p,id,enabled))}
  async removeAddon(id:string){this.identifier(id);return this.content('Removing managed add-on',p=>this.addons().remove(p,id))}
  async updateAddon(id:string){this.identifier(id);return this.content('Updating compatible add-on',(p,progress)=>this.addons().update(p,id,progress))}
  async repairAddons(){return this.content('Recovering interrupted changes',p=>this.addons().recover(p))}
  api(): Omit<LauncherApi, 'subscribe'> {
    return { getLibrary:()=>this.getLibrary(),searchAddons:q=>this.searchAddons(q),addonVersions:(id,kind)=>this.addonVersions(id,kind),previewAddon:r=>this.previewAddon(r),installAddon:id=>this.installAddon(id),previewImport:(kind,world)=>this.previewImport(kind,world),installImport:(id,allow)=>this.installImport(id,allow),setAddonEnabled:(id,enabled)=>this.setAddonEnabled(id,enabled),removeAddon:id=>this.removeAddon(id),updateAddon:id=>this.updateAddon(id),repairAddons:()=>this.repairAddons(), createOfflineAccount: name => this.createOfflineAccount(name), selectAccount: (kind,id) => this.selectAccount(kind,id), removeAccount: (kind,id) => this.removeAccount(kind,id), getSnapshot: () => this.snapshot(), saveSettings: patch => this.saveSettings(patch), createProfile: input => this.createProfile(input), selectProfile: id => this.selectProfile(id), renameProfile: (id,name) => this.renameProfile(id,name), removeProfile: id => this.removeProfile(id), signIn: () => this.signIn(), cancelSignIn: () => this.cancelSignIn(), signOut: () => this.signOut(), chooseJava: () => this.chooseJava(), chooseGameDirectory: () => this.chooseGameDirectory(), install: () => this.install(), launch: () => this.launch(), copyLogs: () => this.copyLogs(), refreshVersions: () => this.refreshVersions() }
  }
}
