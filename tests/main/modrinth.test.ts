import { afterEach,expect,it } from 'vitest'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ModrinthCatalog } from '../../src/main/adapters/modrinth'
import { modrinthFixture } from '../fixtures/modrinth'
const roots:string[]=[]
afterEach(async()=>{for(const r of roots)await rm(r,{recursive:true,force:true})})
it('retains datapack kind from v2 search context',async()=>{
  const f=modrinthFixture(),catalog=new ModrinthCatalog(f.fetcher)
  const result=await catalog.search({kind:'datapack',query:'trees',gameVersion:'1.21.1',offset:10,limit:10})
  expect(result.projects[0].kind).toBe('datapack');expect(result.offset).toBe(10)
  const params=new URL(f.requested[0]).searchParams
  expect(JSON.parse(params.get('facets')!)).toEqual([['project_type:datapack'],['versions:1.21.1']])
})
it.each(['mod','shader','resourcepack','datapack'] as const)('filters %s versions and validates returned loader metadata',async kind=>{
  const f=modrinthFixture(), loader={mod:'fabric',shader:'iris',resourcepack:'minecraft',datapack:'datapack'}[kind]
  f.records.set('/project/main/version',[{...f.version('x'),loaders:[loader]}])
  const catalog=new ModrinthCatalog(f.fetcher)
  expect((await catalog.versions('main',{kind,gameVersion:'1.21.1',loader:'fabric'}))[0].kind).toBe(kind)
  expect(JSON.parse(new URL(f.requested[0]).searchParams.get('loaders')!)).toEqual([loader])
  expect(await catalog.versions('main',{kind,gameVersion:'other',loader:'fabric'})).toEqual([])
  await catalog.search({kind,query:'',gameVersion:'1.21.1',offset:0,limit:10})
  expect(JSON.parse(new URL(f.requested.at(-1)!).searchParams.get('facets')!)).toEqual([['project_type:'+kind],['versions:1.21.1'],...(kind==='mod'?[['categories:fabric']]:[])])
})
it('rejects unsafe file metadata and handles 429, malformed JSON and cached network failures honestly',async()=>{
  const f=modrinthFixture(), root=await mkdtemp(join(tmpdir(),'orbit-catalog-'));roots.push(root)
  const catalog=new ModrinthCatalog(f.fetcher,root)
  const query={kind:'mod' as const,query:'',gameVersion:'1.21.1',offset:0,limit:10}
  await catalog.search(query)
  const cached=await new ModrinthCatalog(async()=>{throw new Error('network')},root).search(query)
  expect(cached.cached).toBe(true);expect(cached.projects).toHaveLength(1)
  await expect(new ModrinthCatalog(async()=>new Response('',{status:429})).search(query)).rejects.toThrow(/rate|429|retry/i)
  await expect(new ModrinthCatalog(async()=>new Response('not json')).search(query)).rejects.toThrow()
  f.records.set('/version/unsafe',{...f.version('unsafe'),files:[{filename:'../evil.jar',url:'https://evil.invalid/a',size:1,hashes:{sha512:f.sha512},primary:true}]})
  await expect(catalog.version('unsafe')).rejects.toThrow(/file|path|host|name/i)
})
