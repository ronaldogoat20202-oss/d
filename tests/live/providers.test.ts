import { expect,it } from 'vitest'
import { mkdtemp,rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FabricService } from '../../src/main/services/fabric'
import { FabricMeta } from '../../src/main/adapters/fabric-meta'
import { ModrinthCatalog } from '../../src/main/adapters/modrinth'
import { AddonService } from '../../src/main/services/addons'
import { VersionService } from '../../src/main/services/versions'
it.skipIf(process.env.ORBIT_LIVE_CHECK!=='1')('verifies live providers and installs an actual compatible Iris dependency bundle',async()=>{
  const root=await mkdtemp(join(tmpdir(),'orbit-live-'))
  try{
    const releases=await new VersionService(join(root,'cache')).list();expect(releases.cached).toBe(false);expect(releases.releases.some(r=>r.id==='1.21.1')).toBe(true)
    const loader=(await new FabricService().listLoaders('1.21.1'))[0];expect(loader.stable).toBe(true)
    const metadata=await new FabricMeta().profile('1.21.1',loader.version);expect(metadata.inheritsFrom).toBe('1.21.1')
    const catalog=new ModrinthCatalog(),service=new AddonService(catalog),profile={id:'live-check',name:'Live check',minecraftVersion:'1.21.1',loader:{kind:'fabric' as const,version:loader.version},libraryRoot:root,gameDirectory:join(root,'instance'),legacy:false}
    for(const kind of ['datapack','shader'] as const)expect((await catalog.search({kind,query:'',gameVersion:'1.21.1',offset:0,limit:10})).projects.length).toBeGreaterThan(0)
    const plan=await service.plan(profile,{kind:'mod',projectId:'YL57xq9U'});await service.install(profile,plan.id,()=>{});await service.assertReady(profile)
    const entries=(await service.library(profile)).installed;expect(entries.some(e=>e.projectId==='YL57xq9U')).toBe(true)
    console.log('Live verified bundle:',entries.map(e=>({project:e.projectId,version:e.versionId})), 'Fabric loader:',loader.version)
  }finally{await rm(root,{recursive:true,force:true})}
},120000)
