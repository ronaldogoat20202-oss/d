import { lstat,readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { GameProfile } from '../../shared/profiles'
import type { WorldSummary } from '../../shared/addons'
import { safeDestination } from './downloads'
function nameFrom(profile:GameProfile,id:string):string {
  if(typeof id!=='string'||!id.startsWith(profile.id+':'))throw new Error('World belongs to a different profile.')
  const encoded=id.slice(profile.id.length+1),name=Buffer.from(encoded,'base64url').toString('utf8')
  if(!name||name==='.'||name==='..'||/[\\/\u0000-\u001f]/.test(name)||Buffer.from(name).toString('base64url')!==encoded)throw new Error('Invalid world identifier.')
  return name
}
export async function resolveWorld(profile:GameProfile,id:string):Promise<string>{
  const name=nameFrom(profile,id),saves=join(profile.gameDirectory,'saves'),path=join(saves,name)
  await safeDestination(profile.gameDirectory,path)
  if(!(await lstat(saves)).isDirectory()||!(await lstat(path)).isDirectory()||!(await lstat(join(path,'level.dat'))).isFile())throw new Error('The selected world is no longer available.')
  return path
}
export async function unavailableWorld(profile:GameProfile,id:string):Promise<boolean>{
  nameFrom(profile,id)
  try{await resolveWorld(profile,id);return false}catch(e){const code=(e as NodeJS.ErrnoException).code;if(code&&!['ENOENT','ENOTDIR'].includes(code))throw e;return true}
}
export async function listWorlds(profile:GameProfile):Promise<WorldSummary[]> {
  const saves=join(profile.gameDirectory,'saves');let names:string[]
  try{if(!(await lstat(saves)).isDirectory())return [];names=await readdir(saves)}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e}
  const worlds:WorldSummary[]=[]
  for(const name of names){const id=profile.id+':'+Buffer.from(name).toString('base64url');try{await resolveWorld(profile,id);worlds.push({id,name})}catch{/* skip linked, invalid or incomplete worlds */}}
  return worlds.sort((a,b)=>a.name.localeCompare(b.name))
}
