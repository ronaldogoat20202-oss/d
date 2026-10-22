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
it('returns real row metadata, requested sorting and a full project description',async()=>{
  const query={kind:'mod' as const,query:'fabric',gameVersion:'1.21.1',offset:20,limit:20,sort:'downloads' as const}
  const raw={project_id:'main',id:'main',title:'Fabric API',description:'Hooks',project_type:'mod',author:'modmuss50',icon_url:'https://cdn.modrinth.com/data/main/icon.png',downloads:286110000,follows:37200,followers:37201,date_modified:'2026-10-20T00:00:00Z',updated:'2026-10-21T00:00:00Z',categories:['fabric','library'],client_side:'optional',server_side:'optional',body:'# Fabric API\n\n'+ 'Essential hooks. '.repeat(500)}
  const requested:string[]=[]
  const catalog=new ModrinthCatalog(async url=>{requested.push(url);return Response.json(new URL(url).pathname.endsWith('/search')?{hits:[raw],offset:20,limit:20,total_hits:100}:raw)})
  const page=await catalog.search(query)
  expect(new URL(requested[0]).searchParams.get('index')).toBe('downloads')
  expect(page.projects[0]).toMatchObject({author:'modmuss50',iconUrl:raw.icon_url,downloads:286110000,followers:37200,categories:['fabric','library'],updatedAt:raw.date_modified})
  const details=await catalog.project('main','mod')
  expect(details).toMatchObject({body:raw.body,followers:37201,updatedAt:raw.updated})
})
it('does not expose unsafe icons and rejects oversized project bodies and invalid sorts',async()=>{
  const raw={id:'main',project_id:'main',title:'Project',description:'Text',icon_url:'https://evil.invalid/icon.png',project_type:'mod',body:'Hello'}
  const catalog=new ModrinthCatalog(async()=>Response.json(raw))
  expect((await catalog.project('main','mod')).iconUrl).toBeNull()
  raw.body='a'.repeat(256*1024+1)
  await expect(catalog.project('main','mod')).rejects.toThrow(/text|description|body/i)
  await expect(catalog.search({kind:'mod',query:'',gameVersion:'1.21.1',offset:0,limit:20,sort:'bad' as never})).rejects.toThrow(/search|sort/i)
})
it('lists real mrpack versions without inventing a vanilla loader tag',async()=>{
  const f=modrinthFixture(),raw={...f.version('pack-v1','pack'),loaders:['fabric'],files:[{filename:'example.mrpack',url:'https://cdn.modrinth.com/data/pack/example.mrpack',size:10,hashes:{sha512:f.sha512},primary:true}]}
  raw.files.push({...raw.files[0],filename:'cosign-bundle.zip',primary:false})
  f.records.set('/project/pack/version',[raw]);f.records.set('/version/pack-v1',raw)
  const catalog=new ModrinthCatalog(f.fetcher)
  const versions=await catalog.modpackVersions('pack','1.21.1')
  expect(versions[0]).toMatchObject({kind:'modpack',id:'pack-v1',files:[{filename:'example.mrpack'}]})
  expect(new URL(f.requested[0]).searchParams.has('loaders')).toBe(false)
  expect((await catalog.modpackVersion('pack-v1')).kind).toBe('modpack')
})
