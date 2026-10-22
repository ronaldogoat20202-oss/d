import type { Loader } from './profiles'
export interface ModpackPreview { id:string; name:string; versionName:string; minecraftVersion:string; loader:Loader; files:number; downloadBytes:number; optionalFiles:number; skippedServerFiles:number }
