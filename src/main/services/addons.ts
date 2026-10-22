import { randomUUID } from 'node:crypto'
import { readFile,readdir,stat } from 'node:fs/promises'
import { basename,join,relative } from 'node:path'
import type { AddonKind,AddonPlan,AddonRequest,AddonTarget,CatalogVersion,ImportPreview,LibraryState,ManagedAddon } from '../../shared/addons'
import type { GameProfile } from '../../shared/profiles'
import type { DownloadProgress } from '../../shared/contracts'
import { compatible,ModrinthCatalog } from '../adapters/modrinth'
import { resolveAddons } from './addon-dependencies'
import * as importsDefault from './addon-imports'
import * as worldsDefault from './worlds'
import { addonPath,readManifest,safeFilename,type AddonManifest } from './addon-manifest'
import { AddonTransactions,unchanged,type AddonWrite } from './addon-transactions'
import { assertModrinthUrl,networkFetch,type FetchPort } from './network'
import { downloadFile,safeDestination,validFile } from './downloads'
import { compareFabricVersions,matchesFabricVersion } from './fabric-predicates'
type Progress=(value:DownloadProgress)=>void
export interface ContentRequest extends AddonRequest { kind:AddonKind; worldId?:string }
interface Prepared { id:string; context:string; profileId:string; before:string; versions:CatalogVersion[]; worldId:string|null; expires:number; optional:string[] }
interface PreparedImport { id:string; context:string; before:string; path:string; worldId:string|null; inspected:Awaited<ReturnType<typeof importsDefault.inspectAddon>>; prepared:Prepared; expires:number }
interface ModUnit { mod:importsDefault.FabricMod; owner:string|null }
class DependencyError extends Error { constructor(message:string,readonly projectId:string|null,readonly modId:string,readonly predicate:string|string[]){super(message)} }
const context=(p:GameProfile)=>JSON.stringify([p.id,p.gameDirectory,p.minecraftVersion,p.loader])
const target=(p:GameProfile,kind:AddonKind):AddonTarget=>({kind,gameVersion:p.minecraftVersion,loader:p.loader.kind})
const IRIS='YL57xq9U'
export class AddonService {
  private plans=new Map<string,Prepared>()
  private previews=new Map<string,PreparedImport>()
  private locked=new Set<string>()
  invalidatePlans():void{this.plans.clear();this.previews.clear()}
  constructor(private catalog=new ModrinthCatalog(),private dependencies=resolveAddons,private imports=importsDefault,private worlds=worldsDefault,private fetcher:FetchPort=networkFetch,private transactions=new AddonTransactions()){}
  private async lock<T>(p:GameProfile,action:()=>Promise<T>):Promise<T>{if(this.locked.has(p.gameDirectory))throw new Error('Another add-on operation is in progress.');this.locked.add(p.gameDirectory);try{return await action()}finally{this.locked.delete(p.gameDirectory)}}
  private remember<T>(map:Map<string,T>,id:string,value:T){if(map.size>=20)map.delete(map.keys().next().value!);map.set(id,value)}
  async library(p:GameProfile):Promise<LibraryState>{const m=await readManifest(p);return {profileId:p.id,worlds:await this.worlds.listWorlds(p),installed:m.entries,needsRecovery:await this.transactions.pending(p)}}
  private async ready(p:GameProfile){if(await this.transactions.pending(p))throw new Error('Recover the interrupted add-on transaction before launching or changing content.')}
  private async effective(p:GameProfile,entries:ManagedAddon[]):Promise<ManagedAddon[]>{return Promise.all(entries.map(async e=>e.kind==='datapack'&&e.worldId&&await this.worlds.unavailableWorld(p,e.worldId)?{...e,enabled:false}:e))}
  private async cache(p:GameProfile,v:CatalogVersion,onProgress:Progress):Promise<string>{
    const file=v.files[0];safeFilename(file.filename)
    const path=await addonPath(p,`.orbit/cache/${file.sha512}${v.kind==='mod'?'.jar':'.zip'}`)
    const artifact={path,urls:[file.url],size:file.size,checksum:{algorithm:'sha512',value:file.sha512}}
    if(!await validFile(artifact)){let bytes=0;await downloadFile(artifact,p.gameDirectory,this.fetcher,n=>{bytes+=n;onProgress({completedBytes:bytes,totalBytes:file.size,message:`Checking ${v.name}`})},assertModrinthUrl)}
    await this.imports.inspectAddon(path,v.kind,target(p,v.kind))
    return path
  }
  private async units(p:GameProfile,entries:ManagedAddon[],sources=new Map<string,string>(),knownEntries=entries):Promise<ModUnit[]>{
    if(p.loader.kind!=='fabric')return []
    const units:ModUnit[]=[],managedNames=new Set([...entries,...knownEntries].filter(e=>e.kind==='mod').map(e=>basename(e.relativePath).toLowerCase()))
    for(const e of entries.filter(e=>e.enabled&&e.kind==='mod')){const path=sources.get(e.id)||await addonPath(p,e.relativePath);for(const mod of (await this.imports.inspectArchive(path)).mods)units.push({mod,owner:e.projectId})}
    // Existing user-managed mods participate in compatibility checks; they are never adopted or changed.
    try{for(const name of await readdir(join(p.gameDirectory,'mods'))){if(!name.toLowerCase().endsWith('.jar')||managedNames.has(name.toLowerCase()))continue;safeFilename(name);const path=await addonPath(p,'mods/'+name);for(const mod of(await this.imports.inspectArchive(path)).mods)units.push({mod,owner:null})}}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
    return units
  }
  private async javaMajor(p:GameProfile):Promise<number|undefined>{
    const path=join(p.libraryRoot,'versions',p.minecraftVersion,p.minecraftVersion+'.json');await safeDestination(p.libraryRoot,path)
    try{if((await stat(path)).size>4*1024**2)throw new Error('Minecraft metadata exceeds the size limit.');const major=JSON.parse(await readFile(path,'utf8')).javaVersion?.majorVersion;if(major!==undefined&&(!Number.isInteger(major)||major<1||major>255))throw new Error('Invalid Minecraft Java metadata.');return major}
    catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw e}
  }
  private check(p:GameProfile,units:ModUnit[],needsIris=false,javaMajor?:number):void{
    const available=new Map<string,{version:string;owner:string|null}>();available.set('minecraft',{version:p.minecraftVersion,owner:null});if(javaMajor)available.set('java',{version:String(javaMajor),owner:null})
    if(p.loader.kind==='fabric')available.set('fabricloader',{version:p.loader.version,owner:null})
    const roots=units.filter(u=>!u.mod.nested),nested=new Map<string,ModUnit[]>(),selected=new Map<string,ModUnit>()
    for(const unit of roots)for(const id of[unit.mod.id,...unit.mod.provides]){if(available.has(id))throw new Error(`Conflicting rendering/mod identity: ${id}. Disable or remove the conflicting mod.`);available.set(id,{version:unit.mod.version,owner:unit.owner})}
    for(const unit of units.filter(u=>u.mod.nested)){if(available.has(unit.mod.id))continue;const group=nested.get(unit.mod.id)||[];group.push(unit);nested.set(unit.mod.id,group)}
    for(const [id,group]of nested){group.sort((a,b)=>compareFabricVersions(b.mod.version,a.mod.version));selected.set(id,group[0])}
    // Bundled modules can appear in several JARs. Select one version that meets
    // the requirements of the selected bundle; top-level mods remain mandatory.
    for(let attempt=0;attempt<32;attempt++){
      const all=[...roots,...selected.values()];let changed=false
      for(const[id,candidates]of nested){const predicates=all.flatMap(u=>u.mod.depends[id]?[u.mod.depends[id]]:[]);const next=candidates.find(c=>predicates.every(predicate=>matchesFabricVersion(c.mod.version,predicate)));if(!next)throw new Error(`Bundled dependency conflict for ${id}.`);if(next!==selected.get(id)){selected.set(id,next);changed=true}}
      if(!changed)break;if(attempt===31)throw new Error('Bundled Fabric dependency resolution exceeded its limit.')
    }
    for(const unit of selected.values())for(const id of[unit.mod.id,...unit.mod.provides]){if(available.has(id))throw new Error(`Conflicting mod identity: ${id}.`);available.set(id,{version:unit.mod.version,owner:unit.owner})}
    for(const {mod}of [...roots,...selected.values()]){
      for(const[id,predicate]of Object.entries(mod.depends)){if(id==='java'&&!javaMajor)continue;const item=available.get(id);if(!item||!matchesFabricVersion(item.version,predicate))throw new DependencyError(`${mod.name} requires ${id} ${JSON.stringify(predicate)}. Enable or install compatible required dependencies.`,item?.owner||null,id,predicate)}
      for(const[id,predicate]of Object.entries(mod.breaks)){const item=available.get(id);if(item&&matchesFabricVersion(item.version,predicate))throw new Error(`${mod.name} declares an incompatible mod: ${id}.`)}
    }
    if(needsIris&&(!available.has('iris')||available.has('optifabric')||available.has('optifine')))throw new Error('Shader packs require compatible Iris in a Fabric profile without conflicting rendering mods.')
  }
  private async prepared(p:GameProfile,request:ContentRequest|null,needsIris=false):Promise<Prepared>{
    await this.ready(p);const manifest=await readManifest(p)
    if(request?.kind==='datapack'){if(!request.worldId)throw new Error('Choose an existing world for this data pack.');await this.worlds.resolveWorld(p,request.worldId)}
    if((request?.kind==='mod'||request?.kind==='shader'||needsIris)&&p.loader.kind!=='fabric')throw new Error('Mods and Iris shader packs require a Fabric game profile.')
    const roots:ContentRequest[]=request?[request]:[]
    const effective=await this.effective(p,manifest.entries),existingUnits=await this.units(p,effective),javaMajor=await this.javaMajor(p)
    const addIris=(request?.kind==='shader'||needsIris)&&!existingUnits.some(u=>u.mod.id==='iris')
    const pinned=new Map<string,CatalogVersion>(),seen=new Set<string>();let versions:CatalogVersion[]=[],optional:string[]=[]
    for(let attempt=0;attempt<32;attempt++){
      const proxy={version:(id:string)=>this.catalog.version(id),versions:async(id:string,t:AddonTarget)=>pinned.has(id)?[pinned.get(id)!]:this.catalog.versions(id,t),dependencyVersions:async(id:string,t:Pick<AddonTarget,'gameVersion'|'loader'>)=>pinned.has(id)?[pinned.get(id)!]:this.catalog.dependencyVersions(id,t)}
      const resolved=await Promise.all(roots.map(r=>this.dependencies(r,target(p,r.kind),effective,proxy)))
      if(addIris&&!resolved.some(group=>group.versions.some(v=>v.projectId===IRIS)))resolved.push(await this.dependencies({projectId:IRIS},target(p,'mod'),effective,proxy))
      const byProject=new Map<string,CatalogVersion>();for(const group of resolved)for(const v of group.versions){const prior=byProject.get(v.projectId);if(prior&&prior.id!==v.id)throw new Error('Conflicting dependency versions across content plans.');byProject.set(v.projectId,v)}
      versions=Array.from(byProject.values());if(versions.length>100)throw new Error('The add-on dependency plan is too large.')
      optional=Array.from(new Set(resolved.flatMap(g=>g.optionalDependencies)))
      const units=existingUnits.filter(u=>!u.owner||!byProject.has(u.owner))
      for(const v of versions){const path=await this.cache(p,v,()=>{});if(v.kind==='mod')for(const mod of(await this.imports.inspectArchive(path)).mods)units.push({mod,owner:v.projectId})}
      try{this.check(p,units,request?.kind==='shader'||needsIris,javaMajor);break}
      catch(error){
        if(!(error instanceof DependencyError)||!error.projectId||roots.some(r=>r.projectId===error.projectId)||attempt===31)throw error
        const candidates=await this.catalog.versions(error.projectId,target(p,'mod'));let replacement:CatalogVersion|undefined
        for(const v of candidates.slice(0,100)){
          if(seen.has(v.id)||byProject.get(v.projectId)?.id===v.id)continue
          seen.add(v.id);const path=await this.cache(p,v,()=>{})
          const mod=(await this.imports.inspectArchive(path)).mods.find(m=>m.id===error.modId||m.provides.includes(error.modId))
          if(mod&&matchesFabricVersion(mod.version,error.predicate)){replacement=v;break}
        }
        if(!replacement)throw new Error('No dependency version satisfies the actual Fabric mod requirements. Choose another compatible mod version.')
        pinned.set(replacement.projectId,replacement)
      }
    }
    return {id:randomUUID(),context:context(p),profileId:p.id,before:JSON.stringify(manifest),versions,worldId:request?.worldId||null,expires:Date.now()+15*60000,optional}
  }
  private publicPlan(plan:Prepared):AddonPlan{return{id:plan.id,profileId:plan.profileId,entries:plan.versions.map(v=>({name:v.name,kind:v.kind,versionId:v.id,bytes:v.files[0].size})),optionalDependencies:plan.optional}}
  async plan(p:GameProfile,request:ContentRequest):Promise<AddonPlan>{return this.lock(p,async()=>{const prepared=await this.prepared(p,request);this.remember(this.plans,prepared.id,prepared);return this.publicPlan(prepared)})}
  private async current(p:GameProfile,prepared:Prepared):Promise<AddonManifest>{await this.ready(p);if(prepared.context!==context(p)||Date.now()>prepared.expires||prepared.before!==JSON.stringify(await readManifest(p)))throw new Error('This plan is stale or belongs to another profile. Prepare it again.');if(prepared.worldId)await this.worlds.resolveWorld(p,prepared.worldId);return readManifest(p)}
  private async activePath(p:GameProfile,kind:AddonKind,filename:string,worldId:string|null):Promise<string>{
    safeFilename(filename)
    if(kind==='datapack'){if(!worldId)throw new Error('Choose an existing world.');return relative(p.gameDirectory,join(await this.worlds.resolveWorld(p,worldId),'datapacks',filename)).split('\\').join('/')}
    return `${{mod:'mods',resourcepack:'resourcepacks',shader:'shaderpacks'}[kind]}/${filename}`
  }
  private async entries(p:GameProfile,before:AddonManifest,prepared:Prepared,onProgress:Progress):Promise<{after:AddonManifest;writes:AddonWrite[];sources:Map<string,string>}>{
    const after:AddonManifest=structuredClone(before),writes:AddonWrite[]=[],sources=new Map<string,string>()
    for(const v of prepared.versions){
      const file=v.files[0],old=after.entries.find(e=>e.projectId===v.projectId&&e.kind===v.kind&&e.worldId===(v.kind==='datapack'?prepared.worldId:null)),id=old?.id||randomUUID()
      const path=await this.cache(p,v,onProgress),active=await this.activePath(p,v.kind,file.filename,prepared.worldId)
      const entry:ManagedAddon={id,kind:v.kind,name:v.name,source:'modrinth',projectId:v.projectId,versionId:v.id,relativePath:active,sha512:file.sha512,providerSize:file.size,providerSha512:file.sha512,enabled:true,worldId:v.kind==='datapack'?prepared.worldId:null,dependencies:v.dependencies.filter(d=>d.type==='required').map(d=>d.versionId||d.projectId||''),catalogDependencies:structuredClone(v.dependencies),compatibility:'declared',gameVersion:p.minecraftVersion,loader:p.loader.kind}
      after.entries=after.entries.filter(e=>e.id!==id);after.entries.push(entry);writes.push({relativePath:active,source:path,sha512:file.sha512});sources.set(id,path)
    }
    return {after,writes,sources}
  }
  private async validate(p:GameProfile,entries:ManagedAddon[],sources?:Map<string,string>,knownEntries=entries,javaMajor?:number){
    entries=await this.effective(p,entries)
    for(const e of entries.filter(e=>e.enabled)){if(e.gameVersion!==p.minecraftVersion||e.loader!==p.loader.kind)throw new Error('Managed content belongs to another Minecraft version or loader.');if(e.kind==='datapack')await this.worlds.resolveWorld(p,e.worldId!)}
    this.check(p,await this.units(p,entries,sources,knownEntries),entries.some(e=>e.enabled&&e.kind==='shader'),javaMajor??await this.javaMajor(p))
    const active=new Set(entries.filter(e=>e.enabled).flatMap(e=>[e.id,e.projectId,e.versionId].filter(Boolean)))
    for(const e of entries.filter(e=>e.enabled))for(const dep of e.dependencies)if(!active.has(dep))throw new Error(`${e.name} requires another enabled dependency.`)
    const enabled=entries.filter(e=>e.enabled)
    for(const e of enabled)for(const d of e.catalogDependencies||[]){
      const other=d.projectId?enabled.find(v=>v.projectId===d.projectId):enabled.find(v=>v.versionId===d.versionId)
      if(d.type==='required'&&(!other||d.versionId&&other.versionId!==d.versionId))throw new Error(`${e.name} requires a different enabled dependency version.`)
      if(d.type==='incompatible'&&other&&(!d.versionId||other.versionId===d.versionId))throw new Error(`${e.name} declares incompatible enabled content.`)
    }
  }
  async install(p:GameProfile,planId:string,onProgress:Progress):Promise<void>{return this.lock(p,async()=>{const plan=this.plans.get(planId);if(!plan)throw new Error('This add-on plan is stale. Prepare it again.');const before=await this.current(p,plan),{after,writes,sources}=await this.entries(p,before,plan,onProgress);await this.validate(p,after.entries,sources,before.entries);await this.transactions.commit(p,before,after,writes);this.plans.delete(planId)})}
  async prepareImport(p:GameProfile,path:string,kind:AddonKind,worldId?:string):Promise<ImportPreview>{return this.lock(p,async()=>{
    await readManifest(p);const inspected=await this.imports.inspectAddon(path,kind,target(p,kind));safeFilename(basename(path))
    if(kind==='datapack'){if(!worldId)throw new Error('Choose an existing world.');await this.worlds.resolveWorld(p,worldId)}
    const prepared=await this.prepared(p,null,kind==='shader'),id=randomUUID();prepared.worldId=worldId||null
    const preview:PreparedImport={id,context:context(p),before:prepared.before,path,worldId:worldId||null,inspected,prepared,expires:prepared.expires};this.remember(this.previews,id,preview)
    return{id,profileId:p.id,name:inspected.name,kind,compatibility:inspected.compatibility,requiredAddons:this.publicPlan(prepared).entries}
  })}
  async commitImport(p:GameProfile,previewId:string,allowUnverified:boolean,onProgress:Progress):Promise<void>{return this.lock(p,async()=>{
    const preview=this.previews.get(previewId);if(!preview||preview.context!==context(p)||Date.now()>preview.expires)throw new Error('This import is stale or belongs to another profile.')
    if(preview.inspected.compatibility==='unverified'&&allowUnverified!==true)throw new Error('Confirm the unverified compatibility before importing this pack.')
    if(await this.imports.fileHash(preview.path)!==preview.inspected.sha512)throw new Error('The import source changed. Prepare a new preview.')
    const before=await this.current(p,preview.prepared),{after,writes,sources}=await this.entries(p,before,preview.prepared,onProgress)
    const info=preview.inspected,filename=basename(preview.path),active=await this.activePath(p,info.kind,filename,preview.worldId)
    const old=after.entries.find(e=>e.source==='local'&&e.kind===info.kind&&basename(e.relativePath).toLowerCase()===filename.toLowerCase()&&e.worldId===preview.worldId),id=old?.id||randomUUID()
    const entry:ManagedAddon={id,kind:info.kind,name:info.name,source:'local',projectId:null,versionId:null,relativePath:active,sha512:info.sha512,providerSize:null,providerSha512:null,enabled:true,worldId:preview.worldId,dependencies:[],compatibility:info.compatibility,gameVersion:p.minecraftVersion,loader:p.loader.kind}
    after.entries=after.entries.filter(e=>e.id!==id);after.entries.push(entry);sources.set(id,preview.path);writes.push({relativePath:active,source:preview.path,sha512:info.sha512})
    await this.validate(p,after.entries,sources,before.entries);await this.transactions.commit(p,before,after,writes);this.previews.delete(previewId)
  })}
  async setEnabled(p:GameProfile,id:string,enabled:boolean):Promise<void>{return this.lock(p,async()=>{
    await this.ready(p);if(typeof enabled!=='boolean')throw new Error('Invalid enabled state.')
    const before=await readManifest(p),after=structuredClone(before),entry=after.entries.find(e=>e.id===id);if(!entry)throw new Error('Choose an installed add-on.');if(entry.enabled===enabled)return
    const oldPath=await addonPath(p,entry.relativePath),filename=basename(entry.relativePath)
    entry.relativePath=enabled?await this.activePath(p,entry.kind,filename,entry.worldId):`.orbit/disabled/${id}/${filename}`;entry.enabled=enabled
    await this.validate(p,after.entries,new Map([[id,oldPath]]),before.entries);await this.transactions.commit(p,before,after,[])
  })}
  async remove(p:GameProfile,id:string):Promise<void>{return this.lock(p,async()=>{await this.ready(p);const before=await readManifest(p),entry=before.entries.find(e=>e.id===id);if(!entry)throw new Error('Choose an installed add-on.');if(entry.kind==='datapack'&&entry.worldId&&await this.worlds.unavailableWorld(p,entry.worldId)){await this.transactions.forgetWorldEntry(p,before,id);return}await unchanged(p,entry.relativePath,entry.sha512);const after={...before,entries:before.entries.filter(e=>e.id!==id)};await this.validate(p,after.entries,undefined,before.entries);await this.transactions.commit(p,before,after,[])})}
  async update(p:GameProfile,id:string,onProgress:Progress):Promise<void>{
    return this.lock(p,async()=>{
    const before=await readManifest(p),entry=before.entries.find(e=>e.id===id)
    if(!entry?.projectId||entry.source!=='modrinth')throw new Error('Local imports must be replaced with a new import.')
    await unchanged(p,entry.relativePath,entry.sha512)
    const prepared=await this.prepared(p,{kind:entry.kind,projectId:entry.projectId,worldId:entry.worldId||undefined})
    await this.current(p,prepared)
    const {after,writes,sources}=await this.entries(p,before,prepared,onProgress)
    for(const next of after.entries){if(before.entries.find(e=>e.id===next.id)?.enabled===false&&next.enabled){const active=next.relativePath;next.enabled=false;next.relativePath=`.orbit/disabled/${next.id}/${basename(active)}`;const write=writes.find(w=>w.relativePath===active);if(write)write.relativePath=next.relativePath}}
    await this.validate(p,after.entries,sources,before.entries);await this.transactions.commit(p,before,after,writes)
    })
  }
  async recover(p:GameProfile):Promise<void>{return this.lock(p,()=>this.transactions.recover(p))}
  async assertReady(p:GameProfile,javaMajor?:number):Promise<void>{await this.ready(p);const manifest=await readManifest(p),effective=await this.effective(p,manifest.entries);for(const e of effective.filter(e=>e.enabled))await unchanged(p,e.relativePath,e.sha512);await this.validate(p,effective,undefined,manifest.entries,javaMajor)}
}
