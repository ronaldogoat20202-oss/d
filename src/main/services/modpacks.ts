import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { lstat,mkdir,mkdtemp,readFile,rename,rm } from 'node:fs/promises'
import { basename,dirname,join } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { crc32 } from 'node:zlib'
import { open,openEntryReadStream,walkEntriesGenerator } from '@xmcl/unzip'
import type { CatalogFile,ManagedAddon } from '../../shared/addons'
import type { DownloadProgress } from '../../shared/contracts'
import type { ModpackPreview } from '../../shared/modpacks'
import type { GameProfile,Loader } from '../../shared/profiles'
import type { ModrinthCatalog } from '../adapters/modrinth'
import { ensureAddonDirectory,safeRelative,writeManifest } from './addon-manifest'
import { fileHash } from './addon-imports'
import { downloadFile,safeDestination,validFile } from './downloads'
import { assertModrinthUrl,assertVersionId,networkFetch,type FetchPort } from './network'
import type { ProfileStore } from './profiles'
const MAX_FILE=512*1024**2,MAX_TOTAL=4*1024**3
interface PackFile {path:string;size:number;sha512:string;url:string}
interface Override {path:string;entry:string;size:number;crc:number}
export interface ParsedPack {name:string;minecraftVersion:string;loader:Loader;files:PackFile[];overrides:Override[];optionalFiles:number;skippedServerFiles:number}
export interface PackContext {profileId:string;libraryRoot:string;gameVersion:string}
interface Pending {directory:string;archive:string;file:CatalogFile;pack:ParsedPack;context:PackContext;expires:number;preview:ModpackPreview}
function text(v:unknown,max=256):string {if(typeof v!=='string'||!v.trim()||v.length>max||/[\x00-\x1f\x7f]/.test(v))throw new Error('Invalid modpack text.');return v.trim()}
function packPath(value:unknown):string {if(typeof value!=='string')throw new Error('Invalid modpack path.');safeRelative(value);if(value.split('/').some(p=>p.toLowerCase()==='.orbit'))throw new Error('Modpacks cannot write launcher metadata.');return value}
function checkPaths(paths:string[]):void {
  const seen=new Map<string,string>()
  for(const path of paths){const key=path.toLowerCase(),previous=seen.get(key);if(previous&&previous!==path)throw new Error('Modpack paths collide on Windows.');seen.set(key,path)}
  for(const key of seen.keys()){const parts=key.split('/');for(let n=1;n<parts.length;n++)if(seen.has(parts.slice(0,n).join('/')))throw new Error('Modpack file and directory paths collide.')}
}
async function entriesFor(path:string){
  const info=await lstat(path);if(!info.isFile()||info.size>MAX_FILE)throw new Error('Choose a regular mrpack archive no larger than 512 MiB.')
  const zip=await open(path,{lazyEntries:true,autoClose:false,validateEntrySizes:true,strictFileNames:true})
  try {
    if(zip.entryCount>10000)throw new Error('Modpack archive has too many entries.')
    const entries=new Map<string,Parameters<typeof openEntryReadStream>[1]>(),lower=new Set<string>();let total=0
    for await(const entry of walkEntriesGenerator(zip)){
      const name=entry.fileName,folder=name.endsWith('/'),type=(entry.externalFileAttributes>>>16)&0o170000
      packPath(folder?name.slice(0,-1):name)
      if(lower.has(name.toLowerCase()))throw new Error('Duplicate modpack archive path.')
      if(type!==0&&type!==(folder?0o040000:0o100000))throw new Error('Modpack archive links and special entries are unsupported.')
      if(entry.isEncrypted()||![0,8].includes(entry.compressionMethod)||!Number.isSafeInteger(entry.uncompressedSize)||entry.uncompressedSize<0||entry.uncompressedSize>MAX_FILE)throw new Error('Unsupported modpack archive entry or size.')
      total+=entry.uncompressedSize;if(total>MAX_TOTAL)throw new Error('Modpack uncompressed size exceeds 4 GiB.')
      entries.set(name,entry);lower.add(name.toLowerCase())
    }
    checkPaths([...entries.keys()].filter(p=>!p.endsWith('/')))
    return {zip,entries}
  }catch(error){zip.close();throw error}
}
export async function readMrpack(path:string):Promise<ParsedPack>{
  const {zip,entries}=await entriesFor(path)
  try {
    const entry=entries.get('modrinth.index.json');if(!entry||entry.uncompressedSize>4*1024**2)throw new Error('Missing or oversized modrinth.index.json.')
    const stream=await openEntryReadStream(zip,entry),chunks:Buffer[]=[];let size=0
    try{await new Promise<void>((resolve,reject)=>{stream.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>entry.uncompressedSize||size>4*1024**2){stream.destroy();reject(new Error('Modpack manifest size exceeds its limit.'))}else chunks.push(Buffer.from(chunk))});stream.once('end',resolve);stream.once('error',reject)})}finally{stream.destroy()}
    const bytes=Buffer.concat(chunks);if(size!==entry.uncompressedSize||crc32(bytes)!==entry.crc32)throw new Error('Modpack manifest checksum mismatch.')
    const raw=JSON.parse(bytes.toString('utf8'))
    if(raw.game!=='minecraft'||raw.formatVersion!==1||!raw.dependencies||typeof raw.dependencies!=='object'||Array.isArray(raw.dependencies)||!Array.isArray(raw.files)||raw.files.length>5000)throw new Error('Unsupported modpack format or file count.')
    const name=text(raw.name);text(raw.versionId);assertVersionId(raw.dependencies.minecraft)
    if(Object.keys(raw.dependencies).some(k=>!['minecraft','fabric-loader'].includes(k)))throw new Error('This pack requires an unsupported loader. Orbit supports Vanilla and Fabric modpacks; Forge, NeoForge and Quilt are not available.')
    let loader:Loader={kind:'vanilla'}
    if(raw.dependencies['fabric-loader']!==undefined){assertVersionId(raw.dependencies['fabric-loader']);loader={kind:'fabric',version:raw.dependencies['fabric-loader']}}
    const files:PackFile[]=[],allPaths:string[]=[];let optionalFiles=0,skippedServerFiles=0,total=0
    const seen=new Set<string>()
    for(const f of raw.files){
      const path=packPath(f?.path)
      if(seen.has(path.toLowerCase()))throw new Error('Duplicate modpack file path.');seen.add(path.toLowerCase());allPaths.push(path)
      if(!Number.isSafeInteger(f.fileSize)||f.fileSize<0||f.fileSize>MAX_FILE||! /^[a-f0-9]{128}$/i.test(f.hashes?.sha512)||! /^[a-f0-9]{40}$/i.test(f.hashes?.sha1)||!Array.isArray(f.downloads)||!f.downloads.length||f.downloads.length>10||!f.downloads.every((u:unknown)=>typeof u==='string'&&u.length<=4096))throw new Error('Invalid modpack download size, hashes or URLs.')
      total+=f.fileSize;if(total>MAX_TOTAL)throw new Error('Modpack installed size exceeds 4 GiB.')
      if(f.env!==undefined&&(!f.env||!['required','optional','unsupported'].includes(f.env.client)||!['required','optional','unsupported'].includes(f.env.server)))throw new Error('Invalid modpack environment metadata.')
      if(f.env?.client==='unsupported'){skippedServerFiles++;continue}
      if(f.env?.client==='optional'){optionalFiles++;continue}
      const url=f.downloads.find((u:string)=>{try{assertModrinthUrl(u);return true}catch{return false}})
      if(!url)throw new Error('This pack contains a required download outside the Modrinth CDN. Orbit currently supports direct cdn.modrinth.com downloads only.')
      files.push({path,size:f.fileSize,sha512:f.hashes.sha512.toLowerCase(),url})
    }
    const overrideMap=new Map<string,Override>()
    for(const prefix of ['overrides/','client-overrides/'])for(const [name,entry] of entries){
      if(!name.startsWith(prefix)||name.endsWith('/'))continue
      const path=packPath(name.slice(prefix.length));allPaths.push(path);total+=entry.uncompressedSize
      if(total>MAX_TOTAL)throw new Error('Modpack installed size exceeds 4 GiB.')
      overrideMap.set(path,{path,entry:name,size:entry.uncompressedSize,crc:entry.crc32})
    }
    checkPaths(allPaths)
    return {name,minecraftVersion:raw.dependencies.minecraft,loader,files,overrides:[...overrideMap.values()],optionalFiles,skippedServerFiles}
  }finally{zip.close()}
}
async function extractOverrides(path:string,root:string,overrides:Override[]):Promise<void>{
  const {zip,entries}=await entriesFor(path)
  try{for(const item of overrides){
    const entry=entries.get(item.entry);if(!entry||entry.uncompressedSize!==item.size||entry.crc32!==item.crc)throw new Error('Modpack archive changed. Preview it again.')
    const destination=join(root,item.path);await safeDestination(root,destination);await mkdir(dirname(destination),{recursive:true})
    const partial=destination+'.'+randomUUID()+'.part',stream=await openEntryReadStream(zip,entry);let size=0,crc=0
    try {
      await pipeline(stream,new Transform({transform(chunk:Buffer,_encoding,done){size+=chunk.length;if(size>item.size){done(new Error('Modpack override size mismatch.'));return}crc=crc32(chunk,crc);done(null,chunk)}}),createWriteStream(partial,{flags:'wx',mode:0o600}))
      if(size!==item.size||crc!==item.crc)throw new Error('Modpack override checksum mismatch.')
      await safeDestination(root,destination);await rename(partial,destination)
    }finally{await rm(partial,{force:true})}
  }}finally{zip.close()}
}
export class ModpackService {
  private pending=new Map<string,Pending>()
  private generation=0
  constructor(private catalog:ModrinthCatalog,private scratch:string,private fetcher:FetchPort=networkFetch){}
  invalidatePlans(){this.generation++;for(const p of this.pending.values())void rm(p.directory,{recursive:true,force:true}).catch(()=>{});this.pending.clear()}
  async preview(versionId:string,context:PackContext,progress:(v:DownloadProgress)=>void):Promise<ModpackPreview>{
    this.invalidatePlans();const generation=this.generation
    const release=await this.catalog.modpackVersion(versionId)
    if(!release.gameVersions.includes(context.gameVersion))throw new Error('Choose a pack version for the selected Minecraft version.')
    await mkdir(this.scratch,{recursive:true});const directory=await mkdtemp(join(this.scratch,'pack-')),archive=join(directory,'package.mrpack'),file=release.files[0];let retained=false
    try{
      let completedBytes=0
      await downloadFile({path:archive,urls:[file.url],size:file.size,checksum:{algorithm:'sha512',value:file.sha512}},directory,this.fetcher,n=>{completedBytes+=n;progress({completedBytes,totalBytes:file.size,message:'Checking modpack archive'})},assertModrinthUrl)
      const pack=await readMrpack(archive)
      if(pack.minecraftVersion!==context.gameVersion||generation!==this.generation)throw new Error('The game profile or pack Minecraft version changed. Preview the pack again.')
      const id=randomUUID(),paths=new Set([...pack.files.map(f=>f.path),...pack.overrides.map(f=>f.path)])
      const preview:ModpackPreview={id,name:pack.name,versionName:release.name,minecraftVersion:pack.minecraftVersion,loader:pack.loader,files:paths.size,downloadBytes:pack.files.reduce((n,f)=>n+f.size,0),optionalFiles:pack.optionalFiles,skippedServerFiles:pack.skippedServerFiles}
      this.pending.set(id,{directory,archive,file,pack,context:structuredClone(context),expires:Date.now()+15*60*1000,preview});retained=true;return structuredClone(preview)
    }finally{if(!retained)await rm(directory,{recursive:true,force:true})}
  }
  async install(id:string,context:PackContext,profiles:Pick<ProfileStore,'create'>,progress:(v:DownloadProgress)=>void):Promise<GameProfile>{
    const pending=this.pending.get(id);this.pending.delete(id)
    if(!pending)throw new Error('This modpack preview expired. Preview the pack again.')
    try{
      if(pending.expires<Date.now()||context.profileId!==pending.context.profileId||context.gameVersion!==pending.context.gameVersion||context.libraryRoot!==pending.context.libraryRoot)throw new Error('The profile changed or preview expired. Preview the modpack again.')
      if(!await validFile({path:pending.archive,urls:[],size:pending.file.size,checksum:{algorithm:'sha512',value:pending.file.sha512}}))throw new Error('Modpack archive integrity changed. Preview it again.')
      const pack=pending.pack;let completedBytes=0
      return await profiles.create({name:pack.name.slice(0,64),minecraftVersion:pack.minecraftVersion,loader:pack.loader.kind},context.libraryRoot,pack.loader,async profile=>{
        for(const file of pack.files)await downloadFile({path:join(profile.gameDirectory,file.path),urls:[file.url],size:file.size,checksum:{algorithm:'sha512',value:file.sha512}},profile.gameDirectory,this.fetcher,n=>{completedBytes+=n;progress({completedBytes,totalBytes:pending.preview.downloadBytes,message:'Installing '+file.path})},assertModrinthUrl)
        progress({completedBytes,totalBytes:pending.preview.downloadBytes,message:'Applying client configuration'})
        await extractOverrides(pending.archive,profile.gameDirectory,pack.overrides)
        // Register top-level pack content so the existing Library can safely
        // enable, disable and remove it, including actual Fabric dependencies.
        const entries:ManagedAddon[]=[]
        for(const path of new Set([...pack.files.map(f=>f.path),...pack.overrides.map(f=>f.path)])){
          const match=/^(mods|resourcepacks|shaderpacks)\/[^/]+\.(jar|zip)$/i.exec(path)
          if(!match)continue
          const folder=match[1].toLowerCase(),extension=match[2].toLowerCase()
          if(folder==='mods'&&extension!=='jar'||folder!=='mods'&&extension!=='zip')continue
          const kind=folder==='mods'?'mod':folder==='resourcepacks'?'resourcepack':'shader'
          entries.push({id:randomUUID(),kind,name:basename(path),source:'modpack',projectId:null,versionId:null,relativePath:path,sha512:await fileHash(join(profile.gameDirectory,path)),providerSize:null,providerSha512:null,enabled:true,worldId:null,dependencies:[],compatibility:'unverified',gameVersion:profile.minecraftVersion,loader:profile.loader.kind})
        }
        await ensureAddonDirectory(profile);await writeManifest(profile,{schema:1,profileId:profile.id,entries})
      })
    }finally{await rm(pending.directory,{recursive:true,force:true})}
  }
}
