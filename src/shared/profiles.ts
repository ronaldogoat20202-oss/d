export type Loader = { kind: 'vanilla' } | { kind: 'fabric'; version: string }
export interface GameProfile { id: string; name: string; minecraftVersion: string; loader: Loader; libraryRoot: string; gameDirectory: string; legacy: boolean }
export interface NewProfile { name: string; minecraftVersion: string; loader: 'vanilla' | 'fabric' }
