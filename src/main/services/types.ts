import type { AccountIdentity } from '../../shared/accounts'
export interface JavaRuntime { executable: string; major: number; architecture: 'x64' | 'ia32' | 'arm64' | 'unknown' }
export interface InstalledVersion { id: string; root: string; javaMajor: number }
export interface MicrosoftSession { kind: 'microsoft'; accessToken: string; profile: AccountIdentity; clientId: string; xuid: string }
export type GameSession = MicrosoftSession | { kind: 'offline'; profile: AccountIdentity }
export interface RuntimePort { platform: NodeJS.Platform; architecture: string; totalMemoryBytes: number }
