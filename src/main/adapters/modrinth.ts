import { createHash } from 'node:crypto'
import { mkdir,readFile,readdir,rename,rm,stat,writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AddonKind,AddonTarget,CatalogKind,CatalogDependency,CatalogFile,CatalogProject,CatalogProjectDetails,CatalogQuery,CatalogVersion,ModpackVersion,ProjectVersion,SearchPage } from '../../shared/addons'
import { projectImage } from '../../shared/project-links'
import { assertModrinthUrl,assertVersionId,boundedText,networkFetch,type FetchPort } from '../services/network'
const kinds:AddonKind[]=['mod','resourcepack','datapack','shader']
const id=(v:unknown):string=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v))throw new Error('Invalid Modrinth identifier.');return v}
const plain=(v:unknown,max=4096):string=>{if(typeof v!=='string'||v.length>max||/[\u0000-\u0008]/.test(v))throw new Error('Invalid provider text.');return v}
export const loaderTag=(kind:AddonKind)=>({mod:'fabric',resourcepack:'minecraft',datapack:'datapack',shader:'iris'})[kind]
export function compatible(v:CatalogVersion,t:AddonTarget):boolean { return v.kind===t.kind && v.gameVersions.includes(t.gameVersion) && v.loaders.includes(loaderTag(t.kind)) && (t.kind!=='mod'||t.loader==='fabric') }
function inferKind(loaders:string[]):AddonKind { if(loaders.includes('datapack'))return 'datapack';if(loaders.includes('iris')||loaders.includes('optifine'))return 'shader';if(loaders.includes('minecraft'))return 'resourcepack';return 'mod' }
function project(v:any,kind?:CatalogKind,detail=false):CatalogProject {
  if(!v||typeof v!=='object')throw new Error('Invalid Modrinth project.')
  const count=(value:unknown)=>Number.isSafeInteger(value)&&Number(value)>=0?Number(value):undefined
  const date=detail?v.updated:v.date_modified??v.updated
  const categories=Array.isArray(v.display_categories??v.categories)?(v.display_categories??v.categories).slice(0,30).map((s:unknown)=>plain(s,80)):[]
  return {id:id(v.project_id||v.id),name:plain(v.title,256),description:plain(v.description),kind:kind||([...kinds,'modpack'].includes(v.project_type)?v.project_type:'mod'),author:typeof v.author==='string'?plain(v.author,128):undefined,iconUrl:projectImage(v.icon_url),downloads:count(v.downloads),followers:count(detail?v.followers:v.follows??v.followers),updatedAt:typeof date==='string'&&Number.isFinite(Date.parse(date))?date:undefined,categories:[...new Set<string>([...categories,...(Array.isArray(v.loaders)?v.loaders.slice(0,30).map((s:unknown)=>plain(s,80)):[])])],clientSide:['required','optional','unsupported'].includes(v.client_side)?v.client_side:undefined,serverSide:['required','optional','unsupported'].includes(v.server_side)?v.server_side:undefined}
}
function version(v:any,kind?:AddonKind):CatalogVersion
function version(v:any,kind:'modpack'):ModpackVersion
function version(v:any,kind?:CatalogKind):ProjectVersion {
  if(!v||!Array.isArray(v.game_versions)||v.game_versions.length>2000||!Array.isArray(v.loaders)||v.loaders.length>100||!Array.isArray(v.files)||v.files.length>100||!Array.isArray(v.dependencies)||v.dependencies.length>500||!Number.isFinite(Date.parse(v.date_published)))throw new Error('Invalid Modrinth version metadata.')
  const loaders=v.loaders.map((s:unknown)=>plain(s,80)),gameVersions=v.game_versions.map((s:unknown)=>plain(s,101))
  const primary=v.files.filter((f:any)=>f?.primary===true)
  if(primary.length>1||!v.files.length||(primary.length===0&&v.files.length!==1))throw new Error('Ambiguous Modrinth primary file.')
  // Auxiliary signatures and other attachments are never installed. Validate
  // the single selected artifact against the requested content format.
  const files:CatalogFile[]=(primary.length?primary:v.files).map((f:any)=>{
    if(!f||typeof f.filename!=='string'||!(kind==='modpack'?/^[A-Za-z0-9][A-Za-z0-9._+() -]{0,199}\.mrpack$/:/^[A-Za-z0-9][A-Za-z0-9._+() -]{0,199}\.(?:jar|zip)$/).test(f.filename)||!Number.isSafeInteger(f.size)||f.size<=0||f.size>512*1024**2||!/^[a-f0-9]{128}$/i.test(f.hashes?.sha512))throw new Error('Invalid add-on file name, size or checksum.')
    assertModrinthUrl(f.url);return {filename:f.filename,url:f.url,size:f.size,sha512:f.hashes.sha512.toLowerCase(),primary:f.primary===true}
  })
  const dependencies:CatalogDependency[]=v.dependencies.map((d:any)=>{if(!['required','optional','incompatible','embedded'].includes(d?.dependency_type))throw new Error('Invalid add-on dependency.');return {type:d.dependency_type,projectId:d.project_id?id(d.project_id):null,versionId:d.version_id?id(d.version_id):null}})
  return {id:id(v.id),projectId:id(v.project_id),name:plain(v.name,256),kind:kind||inferKind(loaders),gameVersions,loaders,files,dependencies,publishedAt:v.date_published}
}
export class ModrinthCatalog {
  constructor(private fetcher:FetchPort=networkFetch,private cacheDirectory?:string){}
  private async request<T>(path:string,parse:(data:any)=>T):Promise<{value:T;cached:boolean}> {
    const cache=this.cacheDirectory?join(this.cacheDirectory,createHash('sha256').update(path).digest('hex')+'.json'):null
    let response:Response
    try {response=await this.fetcher('https://api.modrinth.com/v2'+path,{headers:{'User-Agent':'ronaldogoat20202-oss/Orbit-Launcher/0.2.0'}});if(!response.ok)throw new Error(response.status===429?'Modrinth rate limit reached. Retry shortly.':`Modrinth returned ${response.status}. Retry later.`)}
    catch(error) {
      if(cache)try {const info=await stat(cache);if(info.size<=4*1024**2&&Date.now()-info.mtimeMs<7*86400000)return {value:parse(JSON.parse(await readFile(cache,'utf8'))),cached:true}}catch{/* unavailable */}
      throw error
    }
    const raw=JSON.parse(await boundedText(response)),value=parse(raw)
    if(cache)try {
      await mkdir(this.cacheDirectory!,{recursive:true});await writeFile(cache+'.part',JSON.stringify(raw));await rename(cache+'.part',cache)
      const names=(await readdir(this.cacheDirectory!)).filter(n=>/^[a-f0-9]{64}\.json$/.test(n));if(names.length>128){const files=await Promise.all(names.map(async n=>({path:join(this.cacheDirectory!,n),time:(await stat(join(this.cacheDirectory!,n))).mtimeMs})));files.sort((a,b)=>a.time-b.time);for(const f of files.slice(0,names.length-128))await rm(f.path,{force:true})}
    }catch{/* caching is optional */}
    return {value,cached:false}
  }
  async search(q:CatalogQuery):Promise<SearchPage> {
    if(!q||![...kinds,'modpack'].includes(q.kind)||typeof q.query!=='string'||q.query.length>200||!Number.isInteger(q.offset)||q.offset<0||q.offset>10000||!Number.isInteger(q.limit)||q.limit<1||q.limit>50||!['relevance','downloads','follows','newest','updated'].includes(q.sort||'relevance'))throw new Error('Invalid catalog search.')
    assertVersionId(q.gameVersion)
    const facets=[['project_type:'+q.kind],['versions:'+q.gameVersion]];if(q.kind==='mod')facets.push(['categories:fabric'])
    const params=new URLSearchParams({query:q.query,facets:JSON.stringify(facets),offset:String(q.offset),limit:String(q.limit),index:q.sort||'relevance'})
    const result=await this.request('/search?'+params,data=>{
      if(!Array.isArray(data?.hits)||data.hits.length>q.limit||![data.offset,data.limit,data.total_hits].every(Number.isSafeInteger)||data.offset<0||data.limit<1||data.limit>50||data.total_hits<0)throw new Error('Invalid catalog search results.')
      return {projects:data.hits.map((v:any)=>project(v,q.kind)),offset:data.offset,limit:data.limit,total:data.total_hits}
    })
    return {...result.value,cached:result.cached}
  }
  async project(projectId:string,kind?:CatalogKind):Promise<CatalogProjectDetails>{return (await this.request('/project/'+id(projectId),v=>{const p=project(v,kind,true);if(p.id!==projectId)throw new Error('Unexpected project identity.');return {...p,body:plain(v.body??'',256*1024)}})).value}
  async versions(projectId:string,target:AddonTarget):Promise<CatalogVersion[]> {
    if(!kinds.includes(target.kind))throw new Error('Invalid content kind.');assertVersionId(target.gameVersion)
    const params=new URLSearchParams({game_versions:JSON.stringify([target.gameVersion]),loaders:JSON.stringify([loaderTag(target.kind)])})
    const result=await this.request('/project/'+id(projectId)+'/version?'+params,v=>{if(!Array.isArray(v)||v.length>5000)throw new Error('Invalid version list.');return v.map(row=>version(row,target.kind))})
    return result.value.filter(v=>v.projectId===projectId&&compatible(v,target)).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||a.id.localeCompare(b.id))
  }
  async version(versionId:string):Promise<CatalogVersion>{const v=(await this.request('/version/'+id(versionId),v=>version(v))).value;if(v.id!==versionId)throw new Error('Unexpected Modrinth version identity.');return v}
  async modpackVersion(versionId:string):Promise<ModpackVersion>{const v=(await this.request('/version/'+id(versionId),v=>version(v,'modpack'))).value;if(v.id!==versionId)throw new Error('Unexpected Modrinth version identity.');return v}
  async modpackVersions(projectId:string,gameVersion:string):Promise<ModpackVersion[]>{
    assertVersionId(gameVersion)
    const params=new URLSearchParams({game_versions:JSON.stringify([gameVersion])})
    const result=await this.request('/project/'+id(projectId)+'/version?'+params,v=>{if(!Array.isArray(v)||v.length>5000)throw new Error('Invalid version list.');return v.map(row=>version(row,'modpack'))})
    return result.value.filter(v=>v.projectId===projectId&&v.gameVersions.includes(gameVersion)).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||a.id.localeCompare(b.id))
  }
  async dependencyVersions(projectId:string,target:Pick<AddonTarget,'gameVersion'|'loader'>):Promise<CatalogVersion[]>{
    assertVersionId(target.gameVersion)
    const params=new URLSearchParams({game_versions:JSON.stringify([target.gameVersion])})
    const result=await this.request('/project/'+id(projectId)+'/version?'+params,v=>{if(!Array.isArray(v)||v.length>5000)throw new Error('Invalid dependency version list.');return v.map(row=>version(row))})
    return result.value.filter(v=>v.projectId===projectId&&compatible(v,{...target,kind:v.kind})).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt)||a.id.localeCompare(b.id))
  }
}
