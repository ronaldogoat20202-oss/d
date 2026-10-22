import { mkdir,readFile,rename,stat,writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ManagedAddon } from '../../shared/addons'
import type { GameProfile } from '../../shared/profiles'
import { safeDestination } from './downloads'
export interface AddonManifest { schema:1; profileId:string; entries:ManagedAddon[] }
export function safeFilename(name:string):void {
  if(typeof name!=='string'||name.length>200||!name||/[\\/:<>"|?*\u0000-\u001f]/.test(name)||/[. ]$/.test(name)||name==='.'||name==='..'||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))throw new Error('Unsafe add-on filename for Windows.')
}
export function safeRelative(path:string):void {
  if(typeof path!=='string'||path.length>1024||path.startsWith('/')||path.includes('\\')||path.split('/').some(s=>!s||s==='.'||s==='..'))throw new Error('Invalid managed add-on path.')
  for(const part of path.split('/'))safeFilename(part)
}
export async function addonPath(profile:GameProfile,path:string):Promise<string>{safeRelative(path);const full=join(profile.gameDirectory,path);await safeDestination(profile.gameDirectory,full);return full}
export function parseManifest(value:any,profile:GameProfile):AddonManifest {
  if(value?.schema!==1||value.profileId!==profile.id||!Array.isArray(value.entries)||value.entries.length>5000)throw new Error('Add-on manifest needs repair. Preserve its files and restore a valid manifest.')
  const ids=new Set<string>(),paths=new Set<string>()
  for(const e of value.entries){
    if(!e||typeof e.id!=='string'||!/^[A-Za-z0-9-]{1,128}$/.test(e.id)||ids.has(e.id)||!['mod','resourcepack','datapack','shader'].includes(e.kind)||typeof e.name!=='string'||e.name.length>256||!['modrinth','local'].includes(e.source)||typeof e.enabled!=='boolean'||!/^[a-f0-9]{128}$/.test(e.sha512)||!Array.isArray(e.dependencies)||e.dependencies.length>500||!e.dependencies.every((s:unknown)=>typeof s==='string')||!['declared','unverified'].includes(e.compatibility)||!['vanilla','fabric'].includes(e.loader)||typeof e.gameVersion!=='string')throw new Error('Invalid managed add-on manifest.')
    safeRelative(e.relativePath)
    if(e.catalogDependencies!==undefined&&(!Array.isArray(e.catalogDependencies)||e.catalogDependencies.length>500||!e.catalogDependencies.every((d:any)=>d&&['required','optional','incompatible','embedded'].includes(d.type)&&[d.projectId,d.versionId].every(s=>s===null||typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s)))))throw new Error('Invalid catalog dependency constraints.')
    if(e.kind==='datapack'?(typeof e.worldId!=='string'||!e.worldId.startsWith(profile.id+':')):e.worldId!==null)throw new Error('Invalid managed add-on world association.')
    if(!/^(?:mods\/[^/]+\.jar|(?:resourcepacks|shaderpacks)\/[^/]+\.zip|saves\/[^/]+\/datapacks\/[^/]+\.zip|\.orbit\/disabled\/[A-Za-z0-9-]+\/[^/]+\.(?:jar|zip))$/i.test(e.relativePath)||paths.has(e.relativePath.toLowerCase()))throw new Error('Invalid or colliding managed content path.')
    ids.add(e.id);paths.add(e.relativePath.toLowerCase())
  }
  return value
}
export async function ensureAddonDirectory(profile:GameProfile):Promise<void>{await mkdir(profile.libraryRoot,{recursive:true});await safeDestination(profile.libraryRoot,join(profile.gameDirectory,'.orbit'));await mkdir(profile.gameDirectory,{recursive:true});await safeDestination(profile.gameDirectory,join(profile.gameDirectory,'.orbit'));await mkdir(join(profile.gameDirectory,'.orbit'),{recursive:true})}
export async function readManifest(profile:GameProfile):Promise<AddonManifest>{
  await ensureAddonDirectory(profile);const path=await addonPath(profile,'.orbit/addons.json')
  try{if((await stat(path)).size>4*1024**2)throw new Error('Add-on manifest is too large.');return parseManifest(JSON.parse(await readFile(path,'utf8')),profile)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {schema:1,profileId:profile.id,entries:[]};throw e}
}
export async function writeManifest(profile:GameProfile,value:AddonManifest):Promise<void>{parseManifest(value,profile);const path=await addonPath(profile,'.orbit/addons.json');await writeFile(path+'.part',JSON.stringify(value));await rename(path+'.part',path)}
