import type { AccountSummary } from '../../shared/contracts'
export interface JavaRuntime { executable: string; major: number; architecture: 'x64' | 'ia32' | 'arm64' | 'unknown' }
export interface InstalledVersion { id: string; root: string; javaMajor: number }
export interface GameSession { accessToken: string; profile: AccountSummary; clientId: string; xuid: string }
export interface RuntimePort { platform: NodeJS.Platform; architecture: string; totalMemoryBytes: number }
