import { expect,it } from 'vitest'
import { ModrinthCatalog } from '../../src/main/adapters/modrinth'
import { resolveAddons } from '../../src/main/services/addon-dependencies'
import { modrinthFixture } from '../fixtures/modrinth'
import type { ManagedAddon } from '../../src/shared/addons'
const target={kind:'mod' as const,gameVersion:'1.21.1',loader:'fabric' as const}
it('resolves required dependencies once in deterministic dependency-first order',async()=>{
  const f=modrinthFixture(),catalog=new ModrinthCatalog(f.fetcher)
  const plan=await resolveAddons({projectId:'main'},target,[],catalog)
  expect(plan.versions.map(v=>v.id)).toEqual(['dep-v1','main-v1'])
})
it('detects cycles, incompatible declarations and conflicting pinned versions',async()=>{
  const f=modrinthFixture(),catalog=new ModrinthCatalog(f.fetcher)
  f.records.set('/project/dep/version',[f.version('dep-v1','dep',[{project_id:'main',version_id:null,dependency_type:'required'}])])
  await expect(resolveAddons({projectId:'main'},target,[],catalog)).rejects.toThrow(/cycle/i)
  f.records.set('/project/dep/version',[f.version('dep-v1','dep',[{project_id:'main',version_id:null,dependency_type:'incompatible'}])])
  await expect(resolveAddons({projectId:'main'},target,[],catalog)).rejects.toThrow(/incompatible/i)
})
it('does not automatically install optional or embedded dependencies',async()=>{
  const f=modrinthFixture(),catalog=new ModrinthCatalog(f.fetcher)
  f.records.set('/project/main/version',[f.version('main-v1','main',[{project_id:'dep',version_id:null,dependency_type:'optional'},{project_id:'nested',version_id:null,dependency_type:'embedded'}])])
  const plan=await resolveAddons({projectId:'main'},target,[],catalog)
  expect(plan.versions.map(v=>v.id)).toEqual(['main-v1']);expect(plan.optionalDependencies).toEqual(['dep'])
})
it('honors pinned dependencies and deterministic latest publication dates',async()=>{
  const f=modrinthFixture(),catalog=new ModrinthCatalog(f.fetcher)
  f.records.set('/project/main/version',[{...f.version('old'),date_published:'2025-01-01T00:00:00Z'},{...f.version('new'),date_published:'2026-01-01T00:00:00Z',dependencies:[{project_id:'dep',version_id:'dep-v1',dependency_type:'required'}]}])
  expect((await resolveAddons({projectId:'main'},target,[],catalog)).versions.map(v=>v.id)).toEqual(['dep-v1','new'])
  await expect(resolveAddons({projectId:'other',versionId:'main-v1'},target,[],catalog)).rejects.toThrow(/compatible/i)
})
it('protects pinned requirements of enabled installed dependents before shared replacement',async()=>{
  const f=modrinthFixture(),catalog=new ModrinthCatalog(f.fetcher)
  f.records.set('/version/existing',f.version('existing','existing',[{project_id:'dep',version_id:'dep-v1',dependency_type:'required'}]))
  f.records.set('/project/dep/version',[f.version('dep-v2','dep')])
  const installed=[{enabled:true,source:'modrinth',projectId:'existing',versionId:'existing'}] as ManagedAddon[]
  await expect(resolveAddons({projectId:'dep'},target,installed,catalog)).rejects.toThrow(/different dependency/i)
})
