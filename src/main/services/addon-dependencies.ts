import type { AddonRequest,AddonTarget,CatalogVersion,ManagedAddon } from '../../shared/addons'
import { compatible,type ModrinthCatalog } from '../adapters/modrinth'
type Catalog=Pick<ModrinthCatalog,'versions'|'version'|'dependencyVersions'>
export async function resolveAddons(request:AddonRequest,target:AddonTarget,installed:ManagedAddon[],catalog:Catalog):Promise<{versions:CatalogVersion[];optionalDependencies:string[]}> {
  const chosen=new Map<string,CatalogVersion>(),visiting=new Set<string>(),versions:CatalogVersion[]=[],optional=new Set<string>()
  const visit=async(req:AddonRequest,root=false):Promise<void>=>{
    if(!req.projectId&&!req.versionId)throw new Error('Choose a Modrinth project or version.')
    const current=req.projectId?chosen.get(req.projectId):null
    if(current){if(visiting.has(current.projectId))throw new Error('Required dependency cycle detected.');if(req.versionId&&req.versionId!==current.id)throw new Error('Conflicting pinned dependency versions.');return}
    const v=req.versionId?await catalog.version(req.versionId):(await(root?catalog.versions(req.projectId!,target):catalog.dependencyVersions(req.projectId!,target)))[0]
    if(!v||!compatible(v,{...target,kind:root?target.kind:v.kind})||req.projectId&&v.projectId!==req.projectId)throw new Error('No compatible add-on version is available for this game profile.')
    const prior=chosen.get(v.projectId);if(prior){if(visiting.has(v.projectId))throw new Error('Required dependency cycle detected.');if(prior.id!==v.id)throw new Error('Conflicting pinned dependency versions.');return}
    chosen.set(v.projectId,v);visiting.add(v.projectId)
    for(const dep of v.dependencies){if(dep.type==='optional'){optional.add(dep.projectId||dep.versionId||'Optional dependency');continue}if(dep.type==='required')await visit({projectId:dep.projectId||undefined,versionId:dep.versionId||undefined})}
    visiting.delete(v.projectId);versions.push(v)
  }
  await visit(request,true)
  const active=new Map<string,CatalogVersion>()
  for(const entry of installed.filter(i=>i.enabled&&i.source==='modrinth'&&i.projectId&&i.versionId&&!chosen.has(i.projectId!)))active.set(entry.projectId!,await catalog.version(entry.versionId!))
  for(const [key,v]of chosen)active.set(key,v)
  for(const v of active.values())for(const d of v.dependencies){
    const other=d.projectId?active.get(d.projectId):Array.from(active.values()).find(v=>v.id===d.versionId)
    if(d.type==='incompatible'&&other&&(!d.versionId||d.versionId===other.id))throw new Error(`${v.name} declares an incompatible installed add-on.`)
    if(d.type==='required'&&(!other||d.versionId&&d.versionId!==other.id))throw new Error(`${v.name} requires a different dependency version. Remove or update its dependent first.`)
  }
  return {versions,optionalDependencies:Array.from(optional).sort()}
}
