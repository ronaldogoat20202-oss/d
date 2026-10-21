export interface Settings {
  clientId: string
  javaPath: string
  gameDirectory: string
  maxMemoryMiB: number
}
export interface Release { id: string; url: string; sha1: string; releasedAt: string }
export interface AccountSummary { id: string; name: string }
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
export interface PublicError { code: string; message: string }
export interface LogEntry { time: number; level: 'info' | 'error'; message: string }
export interface Snapshot {
  settings: Settings
  account: AccountState
  releases: Release[]
  selectedVersionId: string | null
  installedVersionIds: string[]
  operation: Operation
  logs: LogEntry[]
  error: PublicError | null
  offline: boolean
}
export interface LauncherApi {
  getSnapshot(): Promise<Snapshot>
  refreshVersions(): Promise<void>
  saveSettings(patch: Partial<Settings>): Promise<Snapshot>
  selectVersion(id: string): Promise<Snapshot>
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
