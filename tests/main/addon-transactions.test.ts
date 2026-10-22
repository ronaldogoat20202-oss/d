import { afterEach,beforeEach,expect,it } from 'vitest'
import { mkdtemp,mkdir,readFile,rm,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AddonService } from '../../src/main/services/addons'
import { AddonTransactions } from '../../src/main/services/addon-transactions'
import { ModrinthCatalog } from '../../src/main/adapters/modrinth'
import { addonFixture,gameProfile } from '../fixtures/addons'
import { zipFixture } from '../fixtures/archives'
let root:string
beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'orbit-tx-'))})
afterEach(async()=>{await rm(root,{recursive:true,force:true})})
it('blocks launch until an interrupted transaction is recovered',async()=>{
  const f=addonFixture(),p=gameProfile(root);f.add('main','main-v1',f.mod('mainmod'))
  let interrupted=false
  const transactions=new AddonTransactions(stage=>{if(stage==='moved'&&!interrupted){interrupted=true;throw new Error('power interruption')}})
  const s=new AddonService(new ModrinthCatalog(f.fetcher),undefined,undefined,undefined,f.fetcher,transactions)
  const plan=await s.plan(p,{kind:'mod',projectId:'main'})
  await expect(s.install(p,plan.id,()=>{})).rejects.toThrow(/interruption/)
  await expect(s.assertReady(p)).rejects.toThrow(/repair|recover/i)
  await s.recover(p);await expect(s.assertReady(p)).resolves.toBeUndefined()
  const entry=(await s.library(p)).installed[0];expect(await readFile(join(p.gameDirectory,entry.relativePath))).toEqual(f.contents.get('https://cdn.modrinth.com/data/main/main-v1'))
})
it('preserves unrelated destination files and reports case-insensitive collisions',async()=>{
  const f=addonFixture(),p=gameProfile(root);f.add('main','main-v1',f.mod('mainmod'))
  const s=new AddonService(new ModrinthCatalog(f.fetcher),undefined,undefined,undefined,f.fetcher)
  const unrelated=zipFixture(f.mod('unrelated'))
  await mkdir(join(p.gameDirectory,'mods'),{recursive:true});await writeFile(join(p.gameDirectory,'mods/MAIN-V1.JAR'),unrelated)
  const plan=await s.plan(p,{kind:'mod',projectId:'main'})
  await expect(s.install(p,plan.id,()=>{})).rejects.toThrow(/conflict|exists|collision/i)
  expect(await readFile(join(p.gameDirectory,'mods/MAIN-V1.JAR'))).toEqual(unrelated)
})
it('preserves a modified destination during recovery and can retry after its bytes are restored',async()=>{
  const f=addonFixture(),p=gameProfile(root),raw=f.add('main','main-v1',f.mod('mainmod'));let failed=false
  const tx=new AddonTransactions(stage=>{if(stage==='moved'&&!failed){failed=true;throw new Error('interrupted')}})
  const s=new AddonService(new ModrinthCatalog(f.fetcher),undefined,undefined,undefined,f.fetcher,tx),plan=await s.plan(p,{kind:'mod',projectId:'main'})
  await expect(s.install(p,plan.id,()=>{})).rejects.toThrow(/interrupted/)
  const path=join(p.gameDirectory,'mods/main-v1.jar');await writeFile(path,'my changes')
  await expect(s.recover(p)).rejects.toThrow(/changed|conflict/i);expect(await readFile(path,'utf8')).toBe('my changes')
  await writeFile(path,f.contents.get(raw.files[0].url)!);await s.recover(p);await s.assertReady(p)
})
it('recovers an interruption after staging before any active file was moved',async()=>{
  const f=addonFixture(),p=gameProfile(root);f.add('main','main-v1',f.mod('mainmod'));let failed=false
  const tx=new AddonTransactions(stage=>{if(stage==='staged'&&!failed){failed=true;throw new Error('staging interruption')}})
  const s=new AddonService(new ModrinthCatalog(f.fetcher),undefined,undefined,undefined,f.fetcher,tx),plan=await s.plan(p,{kind:'mod',projectId:'main'})
  await expect(s.install(p,plan.id,()=>{})).rejects.toThrow(/interruption/);await expect(s.assertReady(p)).rejects.toThrow(/recover/i)
  await s.recover(p);await s.assertReady(p)
})
