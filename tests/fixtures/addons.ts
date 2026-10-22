import { createHash } from 'node:crypto'
import { join } from 'node:path'
import type { GameProfile } from '../../src/shared/profiles'
import { zipFixture } from './archives'
import { modrinthFixture } from './modrinth'
export const digest=(bytes:Uint8Array|string)=>createHash('sha512').update(bytes).digest('hex')
export const gameProfile=(root:string):GameProfile=>({id:'profile-one',name:'Test',minecraftVersion:'1.21.1',loader:{kind:'fabric',version:'0.16.0'},libraryRoot:root,gameDirectory:join(root,'instance'),legacy:false})
export function addonFixture(){
  const f=modrinthFixture(),contents=new Map<string,Buffer>()
  const add=(project:string,versionId:string,entries:Record<string,string|Uint8Array>,kind='mod',dependencies:unknown[]=[])=>{
    const bytes=zipFixture(entries),raw={...f.version(versionId,project,dependencies),loaders:[{mod:'fabric',resourcepack:'minecraft',datapack:'datapack',shader:'iris'}[kind]!],files:[{filename:versionId+(kind==='mod'?'.jar':'.zip'),url:`https://cdn.modrinth.com/data/${project}/${versionId}`,size:bytes.length,hashes:{sha512:digest(bytes)},primary:true}]}
    contents.set(raw.files[0].url,bytes);f.records.set('/version/'+versionId,raw);f.records.set('/project/'+project+'/version',[raw]);return raw
  }
  const mod=(id:string,version='1.0.0',depends:Record<string,string|string[]>={minecraft:'1.21.x'})=>({'fabric.mod.json':JSON.stringify({schemaVersion:1,id,name:id,version,depends})})
  const fetcher=async(url:string)=>contents.has(url)?new Response(new Uint8Array(contents.get(url)!)):f.fetcher(url)
  return {...f,add,mod,contents,fetcher}
}
