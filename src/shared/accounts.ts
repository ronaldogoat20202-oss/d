export type AccountKind = 'microsoft' | 'offline'
export interface AccountIdentity { kind: AccountKind; id: string; name: string }
export interface AccountIndex { accounts: AccountIdentity[]; selected: AccountIdentity | null }
