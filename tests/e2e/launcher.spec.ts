import { test, expect, type Page } from '@playwright/test'
import type { Snapshot, NewProfile } from '../../src/shared/contracts'
import type { SavedServer } from '../../src/shared/servers'
import type { AddonKind,ManagedAddon } from '../../src/shared/addons'
async function injectBridge(page: Page, offline = false,rich = false) {
  await page.addInitScript(({offline,rich})=> {
    const initial = {id:'fixture-profile',name:'Existing Vanilla',minecraftVersion:'fixture-release',loader:{kind:'vanilla' as const},libraryRoot:'C:\\Orbit\\Minecraft',gameDirectory:'C:\\Orbit\\Minecraft',legacy:true}
    const state: Snapshot = {
      settings:{clientId:'',javaPath:'',gameDirectory:initial.libraryRoot,maxMemoryMiB:2048},accounts:[],microsoftConfigured:false,account:{status:'signedOut'},
      releases:offline?[]:[{id:'fixture-release',url:'https://piston-meta.mojang.com/fixture.json',sha1:'a'.repeat(40),releasedAt:'2026-01-01'}],
      profiles:offline?[]:[initial],selectedProfileId:offline?null:initial.id,profileInstallation:'missing',operation:{phase:'idle'},logs:[],error:null,offline
    }
    const listeners=new Set<(s:Snapshot)=>void>(),emit=()=>{for(const fn of listeners)fn(structuredClone(state))}
    const snapshot=()=>structuredClone(state)
    const content:Record<string,ManagedAddon[]>={}
    let servers:SavedServer[]=[]
    let request:{kind:AddonKind;projectId?:string;versionId?:string;worldId?:string}={kind:'mod'}
    window.orbit={
      getLibrary:async()=>({profileId:state.selectedProfileId!,worlds:[{id:state.selectedProfileId+':world',name:'Test World'}],installed:content[state.selectedProfileId!]||[],needsRecovery:false}),
      searchAddons:async q=>({projects:rich&&q.kind==='mod'?['Fabric API','Sodium','Iris Shaders'].map((name,i)=>({id:['fabric-api','sodium','iris'][i],name,description:['Lightweight and modular API providing common hooks and intercompatibility measures utilized by mods using the Fabric toolchain.','A high-performance rendering engine replacement for Minecraft, which greatly improves frame rates and reduces micro-stutter.','A modern shader pack loader for Minecraft intended to be compatible with existing shader packs.'][i],kind:q.kind,author:['modmuss50','CaffeineMC','coderbot'][i],downloads:[286110000,251330000,194790000][i],followers:[37200,42000,30200][i],updatedAt:'2026-10-20T00:00:00Z',categories:i===0?['library','fabric']:['optimization','fabric','neoforge'],clientSide:'optional',serverSide:i===0?'optional':'unsupported'})):[{id:'fixture-'+q.kind,name:'Fixture '+q.kind,description:'Renderer test content',kind:q.kind}],offset:q.offset,limit:q.limit,total:rich?150:1,cached:false}),
      getServers:async()=>structuredClone(servers),saveServer:async input=>{const saved={id:input.id||'fixture-server',name:input.name,address:input.address};servers=servers.filter(s=>s.id!==saved.id);servers.push(saved);return saved},removeServer:async id=>{servers=servers.filter(s=>s.id!==id)},joinServer:async()=>{state.operation={phase:'running',versionId:'fixture-release'};emit()},
      modpackVersions:async projectId=>[{id:'fixture-pack-v1',projectId,name:'Fixture Pack 1.0',kind:'modpack',gameVersions:['fixture-release'],loaders:['fabric'],files:[],dependencies:[],publishedAt:'2026-01-01'}],
      previewModpack:async()=>({id:'fixture-pack-plan',name:'Fixture Pack',versionName:'1.0',minecraftVersion:'fixture-release',loader:{kind:'fabric',version:'0.16.0'},files:50,downloadBytes:1024,optionalFiles:2,skippedServerFiles:1}),
      installModpack:async()=>{const profile={...initial,id:'pack-profile',name:'Fixture Pack',loader:{kind:'fabric' as const,version:'0.16.0'},legacy:false};state.profiles.push(profile);state.selectedProfileId=profile.id;state.profileInstallation='missing';emit();return snapshot()},
      addonDetails:async(id,kind)=>({id,kind,name:rich&&kind==='mod'?'Fabric API':'Fixture '+kind,description:rich?'Lightweight and modular API providing common hooks and intercompatibility measures utilized by mods using the Fabric toolchain.':'Renderer test content',downloads:286400000,followers:37200,categories:['library','fabric'],body:rich?'# Fabric API\n\nEssential hooks for modding with Fabric.\n\nFabric API is the library for essential hooks and interoperability mechanisms for Fabric mods. Examples include:\n\n- Exposing functionality such as particles, biomes and dimensions\n- Adding events, hooks and APIs to improve interoperability between mods\n- Registry synchronization and information for crash reports\n\n## Using Fabric API to play with mods\n\nInstall the Fabric loader first, then add Fabric API to your selected profile.\n\n[Read the Fabric documentation](https://fabricmc.net/wiki/)':'# Fixture description\n\nSafe **Markdown** content.'}),openProjectLink:async()=>{},
      addonVersions:async(projectId,kind)=>[{id:projectId+'-v1',projectId,name:'Fixture '+kind+' version',kind,gameVersions:['fixture-release'],loaders:[kind==='mod'?'fabric':kind==='shader'?'iris':kind==='datapack'?'datapack':'minecraft'],files:[{filename:'fixture.zip',url:'https://cdn.modrinth.com/fixture',size:100,sha512:'a'.repeat(128),primary:true}],dependencies:[],publishedAt:'2026-01-01'}],
      previewAddon:async value=>{request=value;return{id:'fixture-plan',profileId:state.selectedProfileId!,entries:[{name:'Fixture '+value.kind,kind:value.kind,versionId:value.versionId!,bytes:100}],optionalDependencies:[]}},
      installAddon:async()=>{const id=state.selectedProfileId!,entries=content[id]||[];entries.push({id:'addon-'+entries.length,kind:request.kind,name:'Fixture '+request.kind,source:'modrinth',projectId:request.projectId!,versionId:request.versionId!,relativePath:'fixture.zip',sha512:'a'.repeat(128),providerSize:100,providerSha512:'a'.repeat(128),enabled:true,worldId:request.worldId||null,dependencies:[],compatibility:'declared',gameVersion:'fixture-release',loader:'fabric'});content[id]=entries;emit()},
      previewImport:async()=>null,installImport:async()=>{},setAddonEnabled:async(id,enabled)=>{content[state.selectedProfileId!].find(e=>e.id===id)!.enabled=enabled;emit()},removeAddon:async id=>{content[state.selectedProfileId!]=content[state.selectedProfileId!].filter(e=>e.id!==id);emit()},updateAddon:async()=>{},repairAddons:async()=>{},
      getSnapshot:async()=>snapshot(),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},
      saveSettings:async patch=>{state.settings={...state.settings,...patch};emit();return snapshot()},
      createOfflineAccount:async name=>{const profile={kind:'offline' as const,id:'b50ad385829d3141a2167e7d7539ba7f',name};state.accounts.push(profile);state.account={status:'signedIn',profile,persistent:true};emit();return snapshot()},
      selectAccount:async(kind,id)=>{const profile=state.accounts.find(a=>a.kind===kind&&a.id===id)!;state.account={status:'signedIn',profile};emit();return snapshot()},
      removeAccount:async(kind,id)=>{state.accounts=state.accounts.filter(a=>a.kind!==kind||a.id!==id);state.account={status:'signedOut'};emit();return snapshot()},
      signIn:async()=>{},cancelSignIn:async()=>{state.account={status:'signedOut'};emit()},signOut:async()=>{state.account={status:'signedOut'};emit()},
      chooseJava:async()=>snapshot(),chooseGameDirectory:async()=>snapshot(),refreshVersions:async()=>emit(),copyLogs:async()=>{},
      createProfile:async(input:NewProfile)=>{const profile={...initial,id:'profile-'+state.profiles.length,name:input.name,minecraftVersion:input.minecraftVersion,loader:input.loader==='fabric'?{kind:'fabric' as const,version:'0.16.0'}:{kind:'vanilla' as const},legacy:false};state.profiles.push(profile);state.selectedProfileId=profile.id;state.profileInstallation='missing';emit();return snapshot()},
      selectProfile:async id=>{state.selectedProfileId=id;emit();return snapshot()},renameProfile:async(id,name)=>{state.profiles.find(p=>p.id===id)!.name=name;emit();return snapshot()},removeProfile:async id=>{state.profiles=state.profiles.filter(p=>p.id!==id);state.selectedProfileId=null;emit();return snapshot()},
      install:async()=>{state.operation={phase:'installing',versionId:'fixture-release',progress:{completedBytes:50,totalBytes:100,message:'Downloading test fixture'}};emit();await new Promise(r=>setTimeout(r,100));state.profileInstallation='installed';state.operation={phase:'idle'};state.logs.push({time:Date.now(),level:'info',message:'Fixture installation completed (renderer test).'});emit()},
      launch:async()=>{state.operation={phase:'running',versionId:'fixture-release'};emit()}
    }
  },{offline,rich})
}
test('install, configure, create a local account, and launch through the public interface',async({page})=>{
  await injectBridge(page);await page.goto('/')
  await expect(page.getByRole('heading',{name:/your next world/i})).toBeVisible()
  await page.getByRole('button',{name:/install minecraft/i}).click();await expect(page.getByText('Installed & verified')).toBeVisible()
  await expect(page.getByRole('button',{name:/play minecraft/i})).toBeDisabled()
  await page.getByRole('button',{name:/^settings$/i}).click();await page.getByLabel('Java executable',{exact:true}).fill('C:\\Java 21\\bin\\java.exe')
  await page.getByRole('button',{name:/save preferences/i}).click();await expect(page.getByText('Preferences saved',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:/^play$/i}).click();await page.getByRole('button',{name:/create offline profile/i}).click()
  await page.getByLabel('Offline username').fill('RendererTest');await page.getByRole('button',{name:/^create profile$/i}).click()
  await expect(page.getByText('RendererTest',{exact:true})).toBeVisible();await page.getByRole('button',{name:/play minecraft/i}).click()
  await expect(page.getByRole('button',{name:/minecraft is running/i})).toBeDisabled()
  await page.getByRole('button',{name:/^logs$/i}).click();await expect(page.getByRole('log')).toContainText('renderer test')
})
test('offline empty state stays honest at the minimum window size',async({page})=>{
  await injectBridge(page,true);await page.setViewportSize({width:900,height:650});await page.goto('/')
  await expect(page.getByRole('combobox',{name:/game profile/i})).toContainText('No game profiles available')
  await expect(page.getByRole('button',{name:/install minecraft/i})).toBeDisabled()
  await page.screenshot({path:'test-results/orbit-offline-900.png',fullPage:true})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})
test('creates a Fabric profile and manages mods and per-world data packs at minimum size',async({page})=>{
  await injectBridge(page);await page.setViewportSize({width:900,height:650});await page.goto('/')
  await page.getByRole('button',{name:'New game profile'}).click();await page.getByLabel('New profile name').fill('Modded world')
  await page.getByRole('combobox',{name:'Loader',exact:true}).selectOption('fabric');await page.getByRole('button',{name:'Create game profile',exact:true}).click()
  await page.getByRole('button',{name:'Library',exact:true}).click()
  await page.getByRole('button',{name:'View Fixture mod'}).click()
  await page.getByRole('button',{name:'Check installation'}).click();await page.getByRole('button',{name:'Install 1 file',exact:true}).click()
  await expect(page.getByRole('button',{name:'Disable Fixture mod',exact:true})).toBeVisible()
  await page.getByRole('tab',{name:'Data packs',exact:true}).click();await page.getByLabel('Target world').selectOption({label:'Test World'})
  await page.getByRole('button',{name:'View Fixture datapack'}).click();await page.getByRole('button',{name:'Check installation'}).click();await page.getByRole('button',{name:'Install 1 file',exact:true}).click()
  await expect(page.getByText(/Enabled.*Test World/)).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  await page.evaluate(()=>window.scrollTo(0,0))
  await page.screenshot({path:'test-results/orbit-library-900.png',fullPage:true})
})
test('desktop appearance without injected account or versions',async({page})=>{
  await page.goto('/');await expect(page.getByText(/open the desktop app/i)).toBeVisible()
  await page.screenshot({path:'test-results/orbit-launcher.png',fullPage:true})
})

test('catalog rows open full descriptions and versions while preserving sorting and page size',async({page})=>{
  await injectBridge(page,false,true);await page.goto('/');await page.getByRole('button',{name:'Library',exact:true}).click()
  for(const name of ['Modpacks','Mods','Resource packs','Data packs','Shaders','Servers'])await expect(page.getByRole('tab',{name,exact:true})).toBeVisible()
  await page.getByRole('combobox',{name:'Sort by',exact:true}).selectOption('downloads')
  await expect(page.getByText('modmuss50',{exact:true})).toBeVisible();await expect(page.getByTitle('286,110,000 downloads',{exact:true})).toContainText('286.11M')
  await page.screenshot({path:'test-results/orbit-catalog-1280.png',fullPage:true})
  await page.getByRole('button',{name:'View Fabric API',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Using Fabric API to play with mods',exact:true})).toBeVisible()
  await expect(page.getByRole('combobox',{name:'Sort by',exact:true})).toHaveCount(0)
  await page.screenshot({path:'test-results/orbit-project-1280.png',fullPage:true})
  await page.getByRole('tab',{name:'Versions',exact:true}).click();await expect(page.getByRole('button',{name:'Selected',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Back to results',exact:true}).click();await expect(page.getByRole('combobox',{name:'Sort by',exact:true})).toHaveValue('downloads')
  await page.getByRole('combobox',{name:'View',exact:true}).selectOption('50');await page.getByRole('button',{name:'Next page',exact:true}).click();await expect(page.getByRole('button',{name:'Page 2',exact:true})).toHaveAttribute('aria-current','page')
  await page.setViewportSize({width:900,height:650});await page.screenshot({path:'test-results/orbit-catalog-900.png',fullPage:true})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
})
test('creates an isolated modpack profile from its reviewed package',async({page})=>{
  await injectBridge(page);await page.goto('/');await page.getByRole('button',{name:'Library',exact:true}).click();await page.getByRole('tab',{name:'Modpacks',exact:true}).click()
  await page.getByRole('button',{name:'View Fixture modpack',exact:true}).click();await page.getByRole('button',{name:'Install',exact:true}).click()
  await expect(page.getByText(/Fabric 0.16.0.*current profile stays intact/)).toBeVisible()
  await page.getByRole('button',{name:'Create modpack profile',exact:true}).click()
  await expect(page.getByRole('combobox',{name:'Game profile',exact:true})).toContainText('Fixture Pack')
  await expect(page.getByRole('combobox',{name:'Game profile',exact:true})).toHaveValue('pack-profile')
})
test('saves and edits a server, then joins through the selected installed profile',async({page})=>{
  await injectBridge(page);await page.goto('/');await page.getByRole('button',{name:'Install Minecraft',exact:true}).click();await page.getByRole('button',{name:'Create offline profile',exact:true}).click();await page.getByLabel('Offline username').fill('ServerTest');await page.getByRole('button',{name:'Create profile',exact:true}).click()
  await page.getByRole('button',{name:'Library',exact:true}).click();await page.getByRole('tab',{name:'Servers',exact:true}).click();await page.getByRole('button',{name:'Add server',exact:true}).click()
  await page.getByLabel('Server name',{exact:true}).fill('Friends');await page.getByLabel('Server address',{exact:true}).fill('mc.example.org:25566');await page.getByRole('button',{name:'Save server',exact:true}).click()
  await page.getByRole('button',{name:'Edit Friends',exact:true}).click();await page.getByLabel('Server name',{exact:true}).fill('Friends 2');await page.getByRole('button',{name:'Save server',exact:true}).click()
  await page.screenshot({path:'test-results/orbit-servers-1280.png',fullPage:true})
  await page.getByRole('button',{name:'Join Friends 2',exact:true}).click();await expect(page.getByText(/Minecraft started.*game will connect/)).toBeVisible()
})
