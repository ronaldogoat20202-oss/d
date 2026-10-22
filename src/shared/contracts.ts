import type { GameProfile, NewProfile } from './profiles'
export type { GameProfile, Loader, NewProfile } from './profiles'
import type { AccountIdentity, AccountKind } from './accounts'
import type { AddonKind,AddonPlan,CatalogQuery,CatalogVersion,ImportPreview,LibraryState,SearchPage } from './addons'
export type { AccountIdentity, AccountIndex, AccountKind } from './accounts'
export interface Settings {
  clientId: string
  javaPath: string
  gameDirectory: string
  maxMemoryMiB: number
}
export interface Release { id: string; url: string; sha1: string; releasedAt: string }
export type AccountSummary = AccountIdentity
export interface DeviceInstructions { userCode: string; verificationUri: string; expiresAt: number }
export type AccountState =
  | { status: 'signedOut' }
  | { status: 'signingIn'; device?: DeviceInstructions }
  | { status: 'signedIn'; profile: AccountSummary; persistent?: boolean }
export interface DownloadProgress { completedBytes: number; totalBytes: number | null; message: string }
export type Operation =
  | { phase: 'idle' }
  | { phase: 'installing'; versionId: string; progress: DownloadProgress }
  | { phase: 'launching' | 'running'; versionId: string }
  | { phase:'content'; message:string; progress:DownloadProgress|null }
export interface PublicError { code: string; message: string }
export interface LogEntry { time: number; level: 'info' | 'error'; message: string }
export interface Snapshot {
  settings: Settings
  accounts: AccountIdentity[]
  microsoftConfigured: boolean
  account: AccountState
  releases: Release[]
  profiles: GameProfile[]
  selectedProfileId: string | null
  profileInstallation: 'unknown' | 'missing' | 'installed'
  operation: Operation
  logs: LogEntry[]
  error: PublicError | null
  offline: boolean
}
export interface LauncherApi {
  getLibrary():Promise<LibraryState>
  searchAddons(query:Omit<CatalogQuery,'gameVersion'>):Promise<SearchPage>
  addonVersions(projectId:string,kind:AddonKind):Promise<CatalogVersion[]>
  previewAddon(request:{kind:AddonKind;projectId?:string;versionId?:string;worldId?:string}):Promise<AddonPlan>
  installAddon(planId:string):Promise<void>
  previewImport(kind:AddonKind,worldId?:string):Promise<ImportPreview|null>
  installImport(previewId:string,allowUnverified:boolean):Promise<void>
  setAddonEnabled(id:string,enabled:boolean):Promise<void>
  removeAddon(id:string):Promise<void>
  updateAddon(id:string):Promise<void>
  repairAddons():Promise<void>
  getSnapshot(): Promise<Snapshot>
  refreshVersions(): Promise<void>
  saveSettings(patch: Partial<Settings>): Promise<Snapshot>
  createProfile(input: NewProfile): Promise<Snapshot>
  selectProfile(id: string): Promise<Snapshot>
  renameProfile(id: string, name: string): Promise<Snapshot>
  removeProfile(id: string): Promise<Snapshot>
  createOfflineAccount(name: string): Promise<Snapshot>
  selectAccount(kind: AccountKind, id: string): Promise<Snapshot>
  removeAccount(kind: AccountKind, id: string): Promise<Snapshot>
  signIn(): Promise<void>
  cancelSignIn(): Promise<void>
  signOut(): Promise<void>
  chooseJava(): Promise<Snapshot>
  chooseGameDirectory(): Promise<Snapshot>
  install(): Promise<void>
  launch(): Promise<void>
  copyLogs(): Promise<void>
  subscribe(listener: (state: Snapshot) => void): () => void
}
declare global { interface Window { orbit?: LauncherApi } }
