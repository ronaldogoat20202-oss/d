import { afterEach,beforeEach,expect,it } from 'vitest'
import { mkdtemp,readFile,readdir,rm,writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { zipFixture } from '../fixtures/archives'
import { ModrinthCatalog } from '../../src/main/adapters/modrinth'
import { ProfileStore } from '../../src/main/services/profiles'
import { ModpackService,readMrpack } from '../../src/main/services/modpacks'
let dir:string
beforeEach(async()=>{dir=await mkdtemp(join(tmpdir(),'orbit-mrpack-'))})
afterEach(async()=>{await rm(dir,{recursive:true,force:true})})
const hash=(s:Uint8Array,algorithm='sha512')=>createHash(algorithm).update(s).digest('hex')
function fixture(edit?:(index:any,entries:Record<string,string|Uint8Array>)=>void){
  const bytes=Buffer.from('verified mod'),file=(path:string,env?:unknown)=>({path,hashes:{sha1:hash(bytes,'sha1'),sha512:hash(bytes)},env,downloads:['https://cdn.modrinth.com/data/mod.jar'],fileSize:bytes.length})
  const index={formatVersion:1,game:'minecraft',versionId:'1.0',name:'Example Pack',dependencies:{minecraft:'1.21.1','fabric-loader':'0.16.0'},files:[file('mods/example.jar'),file('mods/server.jar',{client:'unsupported',server:'required'}),file('mods/optional.jar',{client:'optional',server:'unsupported'})]}
  const entries:Record<string,string|Uint8Array>={'overrides/config/example.json':'old','client-overrides/config/example.json':'client','server-overrides/config/server.json':'server'}
  edit?.(index,entries);entries['modrinth.index.json']=JSON.stringify(index)
  const archive=zipFixture(entries),raw={id:'pack-v1',project_id:'pack',name:'Pack v1',date_published:'2026-01-01',game_versions:['1.21.1'],loaders:['fabric'],files:[{filename:'pack.mrpack',url:'https://cdn.modrinth.com/pack.mrpack',size:archive.length,hashes:{sha512:hash(archive)},primary:true}],dependencies:[]}
  const fetcher=async(url:string)=>url.includes('/v2/')?Response.json(raw):new Response(new Uint8Array(url.endsWith('.mrpack')?archive:bytes))
  return {archive,index,entries,bytes,fetcher}
}
it('installs verified client files and overrides to a separate exact-loader profile',async()=>{
  const f=fixture(),profiles=new ProfileStore(dir),root=join(dir,'game')
  const original=await profiles.create({name:'Original',minecraftVersion:'1.21.1',loader:'vanilla'},root,{kind:'vanilla'})
  await writeFile(join(original.gameDirectory,'keep.txt'),'keep')
  const context={profileId:original.id,libraryRoot:root,gameVersion:'1.21.1'},service=new ModpackService(new ModrinthCatalog(f.fetcher),join(dir,'scratch'),f.fetcher)
  const preview=await service.preview('pack-v1',context,()=>{})
  expect(preview).toMatchObject({name:'Example Pack',minecraftVersion:'1.21.1',loader:{kind:'fabric',version:'0.16.0'},files:2,optionalFiles:1,skippedServerFiles:1})
  expect((await profiles.selected())?.id).toBe(original.id)
  const result=await service.install(preview.id,context,profiles,()=>{})
  expect(result.gameDirectory).not.toBe(original.gameDirectory);expect(result.loader).toEqual({kind:'fabric',version:'0.16.0'})
  expect(await readFile(join(result.gameDirectory,'mods/example.jar'))).toEqual(f.bytes)
  const managed=JSON.parse(await readFile(join(result.gameDirectory,'.orbit/addons.json'),'utf8'))
  expect(managed.entries).toEqual([expect.objectContaining({kind:'mod',relativePath:'mods/example.jar',sha512:hash(f.bytes),source:'modpack',enabled:true})])
  expect(await readFile(join(result.gameDirectory,'config/example.json'),'utf8')).toBe('client')
  await expect(readFile(join(result.gameDirectory,'mods/server.jar'))).rejects.toThrow()
  await expect(readFile(join(result.gameDirectory,'mods/optional.jar'))).rejects.toThrow()
  await expect(readFile(join(result.gameDirectory,'config/server.json'))).rejects.toThrow()
  expect(await readFile(join(original.gameDirectory,'keep.txt'),'utf8')).toBe('keep')
  await expect(service.install(preview.id,context,profiles,()=>{})).rejects.toThrow(/preview|expired|again/i)
})
it.each([
  ['traversal',(i:any)=>{i.files[0].path='../escape.jar'}],
  ['launcher metadata',(i:any)=>{i.files[0].path='.orbit/addons.json'}],
  ['case collision',(i:any)=>{i.files.push({...i.files[0],path:'MODS/EXAMPLE.JAR'})}],
  ['prefix collision',(i:any)=>{i.files.push({...i.files[0],path:'mods/example.jar/child'})}],
  ['interleaved prefix collision',(i:any)=>{i.files.push({...i.files[0],path:'mods/example.jar-more'},{...i.files[0],path:'mods/example.jar/child'})}],
  ['unsupported loader',(i:any)=>{i.dependencies={'minecraft':'1.21.1',forge:'99'}}],
  ['unsafe host',(i:any)=>{i.files[0].downloads=['https://evil.invalid/file']}],
  ['size',(i:any)=>{i.files[0].fileSize=512*1024**2+1}],
  ['unsupported format',(i:any)=>{i.formatVersion=99}]
] as const)('rejects %s before installing',async(_name,edit)=>{
  const f=fixture(edit),path=join(dir,'pack.mrpack');await writeFile(path,f.archive)
  await expect(readMrpack(path)).rejects.toThrow()
})
it('rejects archive symlinks and corrupted override bytes',async()=>{
  const f=fixture(),linked=Buffer.from(f.archive)
  let offset=0;while((offset=linked.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]),offset))!==-1){linked.writeUInt16LE(0x0314,offset+4);linked.writeUInt32LE((0o120777<<16)>>>0,offset+38);break}
  const path=join(dir,'linked.mrpack');await writeFile(path,linked);await expect(readMrpack(path)).rejects.toThrow(/link|entry|regular/i)
  const corrupt=fixture(),at=corrupt.archive.indexOf(Buffer.from('client-overrides/config/example.json'))+'client-overrides/config/example.json'.length;corrupt.archive[at]=0
  await writeFile(path,corrupt.archive)
  // CRC is verified during extraction, not merely by reading the central directory.
  const catalog=new ModrinthCatalog(async()=>Response.json({id:'pack-v1',project_id:'pack',name:'Pack',date_published:'2026-01-01',game_versions:['1.21.1'],loaders:['fabric'],dependencies:[],files:[{filename:'pack.mrpack',url:'https://cdn.modrinth.com/pack.mrpack',size:corrupt.archive.length,hashes:{sha512:hash(corrupt.archive)},primary:true}]}))
  const fetcher=async(url:string)=>new Response(new Uint8Array(url.endsWith('.mrpack')?corrupt.archive:corrupt.bytes))
  const service=new ModpackService(catalog,join(dir,'scratch'),fetcher),profiles=new ProfileStore(dir),context={profileId:'one',gameVersion:'1.21.1',libraryRoot:join(dir,'game')}
  const p=await service.preview('pack-v1',context,()=>{})
  await expect(service.install(p.id,context,profiles,()=>{})).rejects.toThrow(/checksum|CRC/i)
  expect(await profiles.list()).toEqual([])
})
it('cleans failed downloads and rejects previews from another profile',async()=>{
  const f=fixture(),profiles=new ProfileStore(dir),context={profileId:'one',libraryRoot:join(dir,'game'),gameVersion:'1.21.1'}
  const fetcher=async(url:string)=>url.includes('/v2/')?f.fetcher(url):new Response(new Uint8Array(url.endsWith('.mrpack')?f.archive:Buffer.alloc(f.bytes.length)))
  const service=new ModpackService(new ModrinthCatalog(fetcher),join(dir,'scratch'),fetcher)
  const p=await service.preview('pack-v1',context,()=>{})
  await expect(service.install(p.id,{...context,profileId:'two'},profiles,()=>{})).rejects.toThrow(/profile|preview/i)
  const next=await service.preview('pack-v1',context,()=>{})
  await expect(service.install(next.id,context,profiles,()=>{})).rejects.toThrow(/checksum|integrity/i)
  expect(await profiles.list()).toEqual([]);expect(await readdir(join(context.libraryRoot,'instances'))).toEqual([])
  expect(await readdir(join(dir,'scratch'))).toEqual([])
})
