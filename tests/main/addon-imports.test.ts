import { afterEach,beforeEach,expect,it } from 'vitest'
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectAddon } from '../../src/main/services/addon-imports'
import { matchesFabricVersion } from '../../src/main/services/fabric-predicates'
import { zipFixture } from '../fixtures/archives'
let root:string
beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'orbit-import-'))})
afterEach(async()=>{await rm(root,{recursive:true,force:true})})
const target={kind:'mod' as const,gameVersion:'1.21.1',loader:'fabric' as const}
it('inspects actual Fabric metadata and leaves source bytes unchanged',async()=>{
  const file=join(root,'mod.jar'),bytes=zipFixture({'fabric.mod.json':JSON.stringify({schemaVersion:1,id:'testmod',name:'Test mod',version:'1.0.0',depends:{minecraft:'1.21.x'}})})
  await writeFile(file,bytes)
  expect(await inspectAddon(file,'mod',target)).toMatchObject({name:'Test mod',kind:'mod',compatibility:'declared',size:bytes.length})
  expect(await readFile(file)).toEqual(bytes)
  await expect(inspectAddon(file,'mod',{...target,loader:'vanilla'})).rejects.toThrow(/Fabric/i)
})
it.each(['resourcepack','datapack','shader'] as const)('recognizes %s structures without asserting unknown compatibility',async kind=>{
  const entries:Record<string,string>=kind==='shader'?{'shaders/main.fsh':'shader'}:{'pack.mcmeta':JSON.stringify({pack:{pack_format:34,description:'A pack'}}),[kind==='datapack'?'data/test/function/a.mcfunction':'assets/test/textures/a.png']:'content'}
  const path=join(root,'pack.zip');await writeFile(path,zipFixture(entries))
  expect((await inspectAddon(path,kind,{...target,kind})).compatibility).toBe('unverified')
  await expect(inspectAddon(path,'mod',target)).rejects.toThrow(/Fabric|kind|metadata/i)
})
it('enforces archive entry count limits before scanning ZIP64 entries',async()=>{
  const path=join(root,'many.jar'),entries:Record<string,string>={}
  for(let i=0;i<100001;i++)entries['entry'+i]=''
  await writeFile(path,zipFixture(entries));await expect(inspectAddon(path,'mod',target)).rejects.toThrow(/entry count.*limit/i)
})
it.each([
  ['0.6.13+mc1.21.1','0.6.x',true],['0.8.13+mc1.21.1','0.6.x',false],['1.21.1','1.21',false],['0.5.0','^0.2.3',true],['1.21.1','>=1.15-alpha.19.39.a',true]
] as const)('uses Fabric predicate semantics for %s vs %s',(v,p,result)=>{expect(matchesFabricVersion(v,p)).toBe(result)})
it('rejects malformed, wrong-kind, oversized and unsafe archive metadata',async()=>{
  const path=join(root,'bad.jar');await writeFile(path,'not zip')
  await expect(inspectAddon(path,'mod',target)).rejects.toThrow()
  await writeFile(path,zipFixture({'fabric.mod.json':' '.repeat(262145)}))
  await expect(inspectAddon(path,'mod',target)).rejects.toThrow(/limit|large/i)
  await writeFile(path,zipFixture({'../outside':'bad','fabric.mod.json':'{}'}))
  await expect(inspectAddon(path,'mod',target)).rejects.toThrow(/path|relative|invalid/i)
})
