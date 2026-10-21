import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat } from 'node:fs/promises'
import { basename,extname } from 'node:path'
import { crc32 } from 'node:zlib'
import { open,openEntryReadStream,walkEntriesGenerator } from '@xmcl/unzip'
import type { AddonKind,AddonTarget } from '../../shared/addons'
import { matchesFabricVersion } from './fabric-predicates'
export interface FabricMod { id:string; name:string; version:string; provides:string[]; depends:Record<string,string|string[]>; breaks:Record<string,string|string[]> }
export interface ArchiveInfo { names:Set<string>; mods:FabricMod[]; pack:unknown|null }
interface Budget { entries:number; metadata:number; nested:number }
const MAX_FILE=512*1024**2,MAX_METADATA=262144,MAX_TOTAL=1048576
async function archive(input:string|Buffer,budget:Budget,depth=0):Promise<ArchiveInfo> {
  if(depth>3)throw new Error('Nested mod archive depth exceeds the limit.')
  const zip=await open(input,{lazyEntries:true,autoClose:false,validateEntrySizes:true,strictFileNames:true})
  try {
    if(zip.entryCount>100000-budget.entries)throw new Error('Archive entry count exceeds the limit.')
    const entries=new Map<string,Parameters<typeof openEntryReadStream>[1]>(),names=new Set<string>(),caseNames=new Set<string>()
    for await(const entry of walkEntriesGenerator(zip)){
      if(++budget.entries>100000)throw new Error('Archive entry count exceeds the limit.')
      const name=entry.fileName
      if(name.length>1024||name.includes('\\')||name.startsWith('/')||name.includes('\0')||name.split('/').includes('..')||/^[a-z]:/i.test(name)||caseNames.has(name.toLowerCase()))throw new Error('Invalid or duplicate archive path.')
      if(entry.isEncrypted()||![0,8].includes(entry.compressionMethod)||![entry.compressedSize,entry.uncompressedSize].every(n=>Number.isSafeInteger(n)&&n>=0))throw new Error('Unsupported archive entry.')
      entries.set(name,entry);names.add(name);caseNames.add(name.toLowerCase())
    }
    const read=async(name:string,nested=false):Promise<Buffer>=>{
      const entry=entries.get(name);if(!entry)throw new Error('Missing declared mod metadata or nested JAR.')
      const limit=nested?64*1024**2:MAX_METADATA
      if(entry.uncompressedSize>limit)throw new Error('Archive metadata exceeds the size limit.')
      const stream=await openEntryReadStream(zip,entry),chunks:Buffer[]=[];let size=0
      try {await new Promise<void>((resolve,reject)=>{
        stream.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>limit){stream.destroy();reject(new Error('Archive metadata exceeds the size limit.'))}else chunks.push(Buffer.from(chunk))})
        stream.once('end',resolve);stream.once('error',reject)
      })}finally{stream.destroy()}
      if(size!==entry.uncompressedSize)throw new Error('Archive entry size mismatch.')
      if(nested){budget.nested+=size;if(budget.nested>128*1024**2)throw new Error('Nested archive byte limit exceeded.')}
      else{budget.metadata+=size;if(budget.metadata>MAX_TOTAL)throw new Error('Total archive metadata limit exceeded.')}
      const bytes=Buffer.concat(chunks);if(crc32(bytes)!==entry.crc32)throw new Error('Archive metadata checksum mismatch.');return bytes
    }
    const mods:FabricMod[]=[]
    if(entries.has('fabric.mod.json')){
      const raw=JSON.parse((await read('fabric.mod.json')).toString('utf8'))
      if(raw.schemaVersion!==1||typeof raw.id!=='string'||!/^[a-z][a-z0-9_-]{1,63}$/.test(raw.id)||typeof raw.version!=='string'||raw.version.length>256)throw new Error('Invalid Fabric mod metadata.')
      const constraints=(value:any):Record<string,string|string[]>=>{
        if(value===undefined)return {};if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length>500)throw new Error('Invalid Fabric dependency metadata.')
        for(const [key,p]of Object.entries(value))if(!/^[a-z][a-z0-9_-]{1,63}$/.test(key)||!(typeof p==='string'||Array.isArray(p)&&p.length<=50&&p.every(v=>typeof v==='string'))||JSON.stringify(p).length>4096)throw new Error('Invalid Fabric dependency predicate.')
        return value
      }
      const provides=raw.provides||[];if(!Array.isArray(provides)||provides.length>100||!provides.every(p=>typeof p==='string'&&/^[a-z][a-z0-9_-]{1,63}$/.test(p)))throw new Error('Invalid Fabric provided IDs.')
      mods.push({id:raw.id,name:typeof raw.name==='string'?raw.name.slice(0,256):raw.id,version:raw.version,provides,depends:constraints(raw.depends),breaks:constraints(raw.breaks)})
      if(raw.jars!==undefined){if(!Array.isArray(raw.jars)||raw.jars.length>100)throw new Error('Invalid nested mod declarations.');for(const nested of raw.jars){if(typeof nested.file!=='string'||!nested.file.endsWith('.jar'))throw new Error('Invalid nested mod path.');mods.push(...(await archive(await read(nested.file,true),budget,depth+1)).mods)}}
    }
    const pack=entries.has('pack.mcmeta')?JSON.parse((await read('pack.mcmeta')).toString('utf8')):null
    return {names,mods,pack}
  }finally{zip.close()}
}
export async function inspectArchive(path:string):Promise<ArchiveInfo> {
  const info=await lstat(path);if(!info.isFile()||info.size>MAX_FILE)throw new Error('Choose a regular add-on archive no larger than 512 MiB.')
  return archive(path,{entries:0,metadata:0,nested:0})
}
export async function fileHash(path:string):Promise<string>{const hash=createHash('sha512');for await(const bytes of createReadStream(path))hash.update(bytes);return hash.digest('hex')}
export async function inspectAddon(path:string,kind:AddonKind,target:AddonTarget):Promise<{name:string;kind:AddonKind;sha512:string;size:number;compatibility:'declared'|'unverified'}> {
  if(!['mod','resourcepack','datapack','shader'].includes(kind))throw new Error('Choose an add-on kind.')
  if(extname(path).toLowerCase()!==(kind==='mod'?'.jar':'.zip'))throw new Error('Choose the correct JAR or ZIP file for this content kind.')
  const info=await inspectArchive(path);let compatibility:'declared'|'unverified'='unverified',name=basename(path)
  if(kind==='mod'){
    if(target.loader!=='fabric')throw new Error('Fabric mods require a Fabric game profile.')
    const mod=info.mods[0];if(!mod)throw new Error('This JAR has no supported Fabric metadata.')
    name=mod.name;if(mod.depends.minecraft){if(!matchesFabricVersion(target.gameVersion,mod.depends.minecraft))throw new Error('This Fabric mod declares an incompatible Minecraft version.');compatibility='declared'}
  }else if(kind==='shader'){
    if(!Array.from(info.names).some(n=>n.startsWith('shaders/')&&!n.endsWith('/')))throw new Error('This ZIP has no shader pack structure.')
  }else{
    const pack=info.pack as any,prefix=kind==='resourcepack'?'assets/':'data/'
    if(!Number.isSafeInteger(pack?.pack?.pack_format)||!Array.from(info.names).some(n=>n.startsWith(prefix)&&!n.endsWith('/')))throw new Error('This ZIP has the wrong pack kind or missing pack metadata.')
  }
  return {name,kind,sha512:await fileHash(path),size:(await lstat(path)).size,compatibility}
}
