import { afterEach,beforeEach,expect,it } from 'vitest'
import { mkdtemp,mkdir,readFile,rm,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AddonService } from '../../src/main/services/addons'
import { ModrinthCatalog } from '../../src/main/adapters/modrinth'
import { addonFixture,gameProfile } from '../fixtures/addons'
import { zipFixture } from '../fixtures/archives'
let root:string
beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'orbit-addons-'))})
afterEach(async()=>{await rm(root,{recursive:true,force:true})})
function setup(){const fixture=addonFixture(),profile=gameProfile(root),service=new AddonService(new ModrinthCatalog(fixture.fetcher),undefined,undefined,undefined,fixture.fetcher);return{fixture,profile,service}}
it('installs actual verified files, moves them outside active folders, and protects required dependencies',async()=>{
  const {fixture:f,profile:p,service:s}=setup()
  f.add('dep','dep-v1',f.mod('dependency'));f.add('main','main-v1',f.mod('mainmod','1.0.0',{minecraft:'1.21.x',dependency:'>=1'}),'mod',[{project_id:'dep',version_id:null,dependency_type:'required'}])
  const plan=await s.plan(p,{kind:'mod',projectId:'main'});expect(plan.entries).toHaveLength(2)
  await s.install(p,plan.id,()=>{});const library=await s.library(p),dep=library.installed.find(e=>e.projectId==='dep')!,main=library.installed.find(e=>e.projectId==='main')!
  expect(await readFile(join(p.gameDirectory,main.relativePath))).toEqual(f.contents.get('https://cdn.modrinth.com/data/main/main-v1'))
  await expect(s.setEnabled(p,dep.id,false)).rejects.toThrow(/depend|required/i)
  await s.setEnabled(p,main.id,false);await s.setEnabled(p,dep.id,false)
  await expect(s.setEnabled(p,main.id,true)).rejects.toThrow(/depend|required/i)
  await s.setEnabled(p,dep.id,true);await s.setEnabled(p,main.id,true)
})
it('preserves a modified managed file on remove',async()=>{
  const {fixture:f,profile:p,service:s}=setup();f.add('main','main-v1',f.mod('mainmod'))
  const plan=await s.plan(p,{kind:'mod',projectId:'main'});await s.install(p,plan.id,()=>{})
  const entry=(await s.library(p)).installed[0],path=join(p.gameDirectory,entry.relativePath);await writeFile(path,'user modification')
  await expect(s.remove(p,entry.id)).rejects.toThrow(/changed|conflict/i);expect(await readFile(path,'utf8')).toBe('user modification')
  await expect(s.update(p,entry.id,()=>{})).rejects.toThrow(/changed|conflict/i)
})
it('replaces an older managed version without treating its old filename as an unmanaged duplicate',async()=>{
  const {fixture:f,profile:p,service:s}=setup();f.add('main','main-v1',f.mod('mainmod'))
  const plan=await s.plan(p,{kind:'mod',projectId:'main'});await s.install(p,plan.id,()=>{})
  const entry=(await s.library(p)).installed[0]
  f.add('main','main-v2',f.mod('mainmod','2.0.0'))
  await s.update(p,entry.id,()=>{})
  expect((await s.library(p)).installed[0].versionId).toBe('main-v2')
  await expect(readFile(join(p.gameDirectory,'mods/main-v1.jar'))).rejects.toThrow()
})
it('keeps an explicitly disabled add-on disabled when updating it',async()=>{
  const {fixture:f,profile:p,service:s}=setup();f.add('main','main-v1',f.mod('mainmod'))
  const plan=await s.plan(p,{kind:'mod',projectId:'main'});await s.install(p,plan.id,()=>{})
  const entry=(await s.library(p)).installed[0];await s.setEnabled(p,entry.id,false)
  f.add('main','main-v2',f.mod('mainmod','2.0.0'));await s.update(p,entry.id,()=>{})
  expect((await s.library(p)).installed[0]).toMatchObject({enabled:false,versionId:'main-v2'})
})
it('rejects removing a dependency required by a local imported mod',async()=>{
  const {fixture:f,profile:p,service:s}=setup();f.add('dep','dep-v1',f.mod('dependency'))
  const plan=await s.plan(p,{kind:'mod',projectId:'dep'});await s.install(p,plan.id,()=>{})
  const path=join(root,'local.jar');await writeFile(path,zipFixture(f.mod('localmod','1.0.0',{minecraft:'1.21.x',dependency:'>=1'})))
  const preview=await s.prepareImport(p,path,'mod');await s.commitImport(p,preview.id,false,()=>{})
  const entry=(await s.library(p)).installed.find(e=>e.projectId==='dep')!
  await expect(s.remove(p,entry.id)).rejects.toThrow(/depend|required/i)
})
it('requires explicit unverified import consent and detects changed sources and profile context',async()=>{
  const {profile:p,service:s}=setup(),path=join(root,'pack.zip'),bytes=zipFixture({'pack.mcmeta':'{"pack":{"pack_format":34}}','assets/test/a':'x'})
  await writeFile(path,bytes);const preview=await s.prepareImport(p,path,'resourcepack')
  await expect(s.commitImport(p,preview.id,false,()=>{})).rejects.toThrow(/unverified|confirm/i)
  await expect(s.commitImport({...p,id:'different'},preview.id,true,()=>{})).rejects.toThrow(/profile|stale/i)
  await writeFile(path,'changed');await expect(s.commitImport(p,preview.id,true,()=>{})).rejects.toThrow(/changed/i)
})
it('rejects bad remote bytes before installing and supports a corrected retry',async()=>{
  const {fixture:f,profile:p,service:s}=setup(),raw=f.add('main','main-v1',f.mod('mainmod')),url=raw.files[0].url,good=f.contents.get(url)!
  f.contents.set(url,Buffer.from('bad download'))
  await expect(s.plan(p,{kind:'mod',projectId:'main'})).rejects.toThrow(/integrity|checksum/i)
  expect((await s.library(p)).installed).toEqual([])
  f.contents.set(url,good);const plan=await s.plan(p,{kind:'mod',projectId:'main'});await s.install(p,plan.id,()=>{})
  await s.assertReady(p)
})
it('previews Iris before importing an unverified local shader',async()=>{
  const {fixture:f,profile:p,service:s}=setup()
  f.add('YL57xq9U','iris-v1',f.mod('iris'))
  const path=join(root,'shader.zip');await writeFile(path,zipFixture({'shaders/test.fsh':'shader'}))
  const preview=await s.prepareImport(p,path,'shader');expect(preview.requiredAddons.map(v=>v.kind)).toEqual(['mod'])
  await expect(s.commitImport(p,preview.id,false,()=>{})).rejects.toThrow(/confirm|unverified/i)
  await s.commitImport(p,preview.id,true,()=>{});await s.assertReady(p)
})
it('resolves duplicate bundled Fabric modules while rejecting duplicate top-level mods',async()=>{
  const {fixture:f,profile:p,service:s}=setup()
  const nested=(id:string,version:string)=>zipFixture(f.mod(id,version))
  const withModule=(id:string,version:string)=>({'fabric.mod.json':JSON.stringify({schemaVersion:1,id,version:'1.0.0',depends:{minecraft:'1.21.x',shared_module:'>=1'},jars:[{file:'META-INF/jars/shared.jar'}]}),'META-INF/jars/shared.jar':nested('shared_module',version)})
  f.add('dep','dep-v1',withModule('dependency','1.0.0'))
  f.add('main','main-v1',withModule('mainmod','2.0.0'),'mod',[{project_id:'dep',version_id:null,dependency_type:'required'}])
  const plan=await s.plan(p,{kind:'mod',projectId:'main'});await s.install(p,plan.id,()=>{});await s.assertReady(p)
  f.add('duplicate','duplicate-v1',f.mod('mainmod'))
  await expect(s.plan(p,{kind:'mod',projectId:'duplicate'})).rejects.toThrow(/conflict/i)
})
it('uses official local Java metadata for modern Minecraft versions instead of guessing from the version name',async()=>{
  const {fixture:f,profile:p,service:s}=setup();p.minecraftVersion='26.1.1'
  const raw=f.add('modern','modern-v1',f.mod('modernmod','1.0.0',{minecraft:'26.1.x',java:'>=25'}));raw.game_versions=['26.1.1']
  await mkdir(join(p.libraryRoot,'versions/26.1.1'),{recursive:true});await writeFile(join(p.libraryRoot,'versions/26.1.1/26.1.1.json'),JSON.stringify({javaVersion:{majorVersion:25}}))
  const plan=await s.plan(p,{kind:'mod',projectId:'modern'});await s.install(p,plan.id,()=>{});await s.assertReady(p,25)
})
it('targets resource packs, per-world data packs and shaders, including compatible Iris dependencies',async()=>{
  const {fixture:f,profile:p,service:s}=setup()
  await mkdir(join(p.gameDirectory,'saves/World'),{recursive:true});await writeFile(join(p.gameDirectory,'saves/World/level.dat'),'world')
  f.add('resources','resources-v1',{'pack.mcmeta':'{"pack":{"pack_format":34}}','assets/test/a':'x'},'resourcepack')
  f.add('data','data-v1',{'pack.mcmeta':'{"pack":{"pack_format":48}}','data/test/a':'x'},'datapack')
  f.add('YL57xq9U','iris-v1',f.mod('iris','1.8.8',{minecraft:'1.21.x',sodium:'0.6.x'}),'mod',[{project_id:'sodium',version_id:null,dependency_type:'required'}])
  const sodium=f.add('sodium','sodium-old',f.mod('sodium','0.6.13'))
  const newer=f.add('sodium','sodium-new',f.mod('sodium','0.8.13'));f.records.set('/project/sodium/version',[newer,sodium])
  f.add('shader','shader-v1',{'shaders/main.fsh':'shader'},'shader')
  for(const [kind,projectId]of [['resourcepack','resources'],['datapack','data'],['shader','shader']] as const){
    const worldId=kind==='datapack'?(await s.library(p)).worlds[0].id:undefined
    const plan=await s.plan(p,{kind,projectId,worldId});await s.install(p,plan.id,()=>{})
  }
  const entries=(await s.library(p)).installed
  expect(entries.find(e=>e.kind==='resourcepack')?.relativePath).toMatch(/^resourcepacks\//)
  expect(entries.find(e=>e.kind==='datapack')?.relativePath).toMatch(/^saves\/World\/datapacks\//)
  expect(entries.find(e=>e.kind==='shader')?.relativePath).toMatch(/^shaderpacks\//)
  expect(entries.find(e=>e.projectId==='YL57xq9U')?.relativePath).toMatch(/^mods\//)
  expect(entries.find(e=>e.projectId==='sodium')?.versionId).toBe('sodium-old')
})
