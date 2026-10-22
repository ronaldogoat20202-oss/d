import { afterEach,beforeEach,expect,it } from 'vitest'
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter,join,normalize } from 'node:path'
import { generateArguments,Version } from '@xmcl/core'
import { FabricService } from '../../src/main/services/fabric'
import { makeLaunchOptions } from '../../src/main/adapters/minecraft-launcher'
import { assertOfficialUrl } from '../../src/main/services/network'
import { fabricFixture } from '../fixtures/fabric'
let dir:string
beforeEach(async()=>{dir=await mkdtemp(join(tmpdir(),'orbit-fabric-'))})
afterEach(async()=>{await rm(dir,{force:true,recursive:true})})
it('uses the base client JAR for an inherited Fabric launch and verifies extra libraries',async()=>{
  const f=fabricFixture(), service=new FabricService(f.fetcher)
  expect(await service.listLoaders(f.release.id)).toEqual([{version:f.loaderVersion,stable:true}])
  const progress:number[]=[]
  const installed=await service.ensure(f.release,f.loaderVersion,dir,p=>progress.push(p.completedBytes))
  expect(progress.some(n=>n>0)).toBe(true)
  const resolved=await Version.parse(dir,installed.id)
  expect(resolved.minecraftVersion).toBe(f.release.id)
  expect(resolved.mainClass).toBe('net.fabricmc.loader.impl.launch.knot.KnotClient')
  const options=await makeLaunchOptions({settings:{clientId:'',javaPath:'/java',gameDirectory:dir,maxMemoryMiB:2048},version:installed,session:{kind:'offline',profile:{kind:'offline',id:'b50ad385829d3141a2167e7d7539ba7f',name:'Notch'}}})
  const args=await generateArguments(options)
  const classpath=args[args.indexOf('-cp')+1].split(delimiter).map(path=>normalize(path))
  expect(classpath).toContain(join(dir,'versions/fixture/fixture.jar'))
  expect(args.join(' ')).toContain('fabric-loader-0.16.0.jar')
  expect(await service.inspect(f.release,f.loaderVersion,dir)).not.toBeNull()
  const libraryPath=join(dir,'libraries/net/fabricmc/fabric-loader/0.16.0/fabric-loader-0.16.0.jar')
  await writeFile(libraryPath,'corrupt')
  expect(await service.inspect(f.release,f.loaderVersion,dir)).toBeNull()
  await service.ensure(f.release,f.loaderVersion,dir,()=>{})
  expect(await readFile(libraryPath,'utf8')).toBe('fixture Fabric loader library')
  expect(()=>assertOfficialUrl(f.libraryUrl)).toThrow(/allowed|official/i)
})
it('rejects unexpected inheritance and leaves the installation incomplete',async()=>{
  const f=fabricFixture();f.files.set(f.profileUrl,Buffer.from(JSON.stringify({...f.profile,inheritsFrom:'other'})))
  const service=new FabricService(f.fetcher)
  await expect(service.ensure(f.release,f.loaderVersion,dir,()=>{})).rejects.toThrow(/inherit|metadata/i)
  expect(await service.inspect(f.release,f.loaderVersion,dir)).toBeNull()
})
it('requires a complete integrity receipt for every resolved dependency',async()=>{
  const f=fabricFixture(), service=new FabricService(f.fetcher)
  const installed=await service.ensure(f.release,f.loaderVersion,dir,()=>{})
  const receiptPath=join(dir,`versions/${installed.id}/${installed.id}.json.orbit.json`)
  const receipt=JSON.parse(await readFile(receiptPath,'utf8'))
  receipt.files=[]
  await writeFile(receiptPath,JSON.stringify(receipt))
  await rm(join(dir,'libraries/net/fabricmc/fabric-loader/0.16.0/fabric-loader-0.16.0.jar'))
  expect(await service.inspect(f.release,f.loaderVersion,dir)).toBeNull()
})
it('rejects an untrusted Fabric library host before fetching it',async()=>{
  const f=fabricFixture();f.files.set(f.profileUrl,Buffer.from(JSON.stringify({...f.profile,libraries:[{name:'net.fabricmc:evil:1',url:'https://evil.invalid/'}]})))
  await expect(new FabricService(f.fetcher).ensure(f.release,f.loaderVersion,dir,()=>{})).rejects.toThrow(/allowed|Fabric|host/i)
})
it.each([-1,-2,1.5])('rejects invalid declared Fabric artifact size %s',async size=>{
  const f=fabricFixture();f.files.set(f.profileUrl,Buffer.from(JSON.stringify({...f.profile,libraries:f.profile.libraries.map(l=>({...l,size}))})))
  await expect(new FabricService(f.fetcher).ensure(f.release,f.loaderVersion,dir,()=>{})).rejects.toThrow(/size/i)
})
