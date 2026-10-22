import { constants } from 'node:fs'
import { copyFile,lstat,mkdir,readFile,readdir,rename,rm,rmdir,stat,writeFile } from 'node:fs/promises'
import { dirname,join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { GameProfile } from '../../shared/profiles'
import { addonPath,ensureAddonDirectory,parseManifest,readManifest,writeManifest,type AddonManifest } from './addon-manifest'
import { fileHash } from './addon-imports'
interface Move { from:string; to:string; sha512:string }
interface Journal { schema:1; profileId:string; before:AddonManifest; after:AddonManifest; moves:Move[]; done:number; directory:string }
export interface AddonWrite { relativePath:string; source:string; sha512:string }
const exists=async(path:string)=>{try{await lstat(path);return true}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return false;throw e}}
export async function unchanged(profile:GameProfile,path:string,digest:string):Promise<void>{const full=await addonPath(profile,path);if(!(await lstat(full)).isFile()||await fileHash(full)!==digest)throw new Error('Managed add-on changed or conflicts with another file. Your file was preserved.')}
export class AddonTransactions {
  constructor(private hook?:(stage:'staged'|'moved'|'manifest')=>void|Promise<void>){}
  async pending(profile:GameProfile):Promise<boolean>{await ensureAddonDirectory(profile);return exists(await addonPath(profile,'.orbit/pending.json'))}
  private async save(profile:GameProfile,journal:Journal){const path=await addonPath(profile,'.orbit/pending.json');await writeFile(path+'.part',JSON.stringify(journal));await rename(path+'.part',path)}
  async commit(profile:GameProfile,before:AddonManifest,after:AddonManifest,writes:AddonWrite[]):Promise<void>{
    if(await this.pending(profile))throw new Error('Recover the interrupted add-on transaction before continuing.')
    if(JSON.stringify(await readManifest(profile))!==JSON.stringify(before))throw new Error('The add-on plan is stale. Refresh the library.')
    parseManifest(after,profile)
    const directory='.orbit/staging/'+randomUUID(),moves:Move[]=[],backups=new Map<string,string>()
    const changed=before.entries.filter(old=>{const next=after.entries.find(e=>e.id===old.id);return !next||next.relativePath!==old.relativePath||next.sha512!==old.sha512})
    for(const old of changed)await unchanged(profile,old.relativePath,old.sha512)
    const removedPaths=new Set(changed.map(e=>e.relativePath.toLowerCase()))
    for(const next of after.entries){
      const old=before.entries.find(e=>e.id===next.id);if(old?.relativePath===next.relativePath&&old.sha512===next.sha512)continue
      const full=await addonPath(profile,next.relativePath),parent=dirname(full)
      if(await exists(parent)){const collision=(await readdir(parent)).find(n=>n.toLowerCase()===next.relativePath.split('/').at(-1)!.toLowerCase());if(collision&&!removedPaths.has(next.relativePath.toLowerCase()))throw new Error('An unrelated file exists at the add-on destination (case collision).')}
    }
    await mkdir(await addonPath(profile,directory),{recursive:true})
    for(const [i,old]of changed.entries()){const backup=`${directory}/backup-${i}`;backups.set(old.id,backup);moves.push({from:old.relativePath,to:backup,sha512:old.sha512})}
    for(const [i,next]of after.entries.entries()){
      const old=before.entries.find(e=>e.id===next.id);if(old?.relativePath===next.relativePath&&old.sha512===next.sha512)continue
      let source=old?.sha512===next.sha512?backups.get(old.id):undefined
      if(!source){const write=writes.find(w=>w.relativePath===next.relativePath&&w.sha512===next.sha512);if(!write)throw new Error('Missing verified content for the transaction.');source=`${directory}/new-${i}`;const full=await addonPath(profile,source);await copyFile(write.source,full,constants.COPYFILE_EXCL);await unchanged(profile,source,next.sha512)}
      moves.push({from:source,to:next.relativePath,sha512:next.sha512})
    }
    const journal:Journal={schema:1,profileId:profile.id,before,after,moves,done:0,directory}
    await this.save(profile,journal);await this.hook?.('staged');await this.finish(profile,journal)
  }
  private async finish(profile:GameProfile,journal:Journal):Promise<void>{
    for(let i=journal.done;i<journal.moves.length;i++){
      const move=journal.moves[i],from=await addonPath(profile,move.from),to=await addonPath(profile,move.to),hasSource=await exists(from),hasTarget=await exists(to)
      if(hasSource&&hasTarget)throw new Error('Recovery conflict: both source and destination exist. Your files were preserved.')
      if(hasSource){await unchanged(profile,move.from,move.sha512);await mkdir(dirname(to),{recursive:true});await rename(from,to)}
      else if(hasTarget)await unchanged(profile,move.to,move.sha512)
      else throw new Error('Recovery needs a missing staged file. Preserve the pending transaction and restore the file.')
      journal.done=i+1;await this.save(profile,journal);await this.hook?.('moved')
    }
    for(const e of journal.after.entries)await unchanged(profile,e.relativePath,e.sha512)
    await writeManifest(profile,journal.after);await this.hook?.('manifest')
    for(const move of journal.moves.filter(m=>m.to.startsWith(journal.directory+'/'))){if(await exists(await addonPath(profile,move.to))){await unchanged(profile,move.to,move.sha512);await rm(await addonPath(profile,move.to))}}
    await rmdir(await addonPath(profile,journal.directory)).catch(()=>undefined)
    await rm(await addonPath(profile,'.orbit/pending.json'))
  }
  async recover(profile:GameProfile):Promise<void>{
    if(!await this.pending(profile))return
    const path=await addonPath(profile,'.orbit/pending.json');if((await stat(path)).size>8*1024**2)throw new Error('Recovery journal exceeds the size limit.')
    const j=JSON.parse(await readFile(path,'utf8')) as Journal
    if(j.schema!==1||j.profileId!==profile.id||!/^\.orbit\/staging\/[a-f0-9-]{36}$/.test(j.directory)||!Array.isArray(j.moves)||j.moves.length>10000||!Number.isInteger(j.done)||j.done<0||j.done>j.moves.length)throw new Error('Invalid recovery journal. Preserve it for repair.')
    parseManifest(j.before,profile);parseManifest(j.after,profile)
    const allowed=new Set([...j.before.entries,...j.after.entries].map(e=>e.relativePath))
    for(const move of j.moves){if(!/^[a-f0-9]{128}$/.test(move.sha512)||![move.from,move.to].every(p=>allowed.has(p)||p.startsWith(j.directory+'/')))throw new Error('Invalid recovery move.');await addonPath(profile,move.from);await addonPath(profile,move.to)}
    const current=JSON.stringify(await readManifest(profile));if(current!==JSON.stringify(j.before)&&current!==JSON.stringify(j.after))throw new Error('Recovery manifest conflict. Preserve your files and pending journal.')
    await this.finish(profile,j)
  }
}
