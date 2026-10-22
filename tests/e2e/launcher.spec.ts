import { test, expect, type Page } from '@playwright/test'
import type { Snapshot, NewProfile } from '../../src/shared/contracts'
import type { AddonKind,ManagedAddon } from '../../src/shared/addons'
async function injectBridge(page: Page, offline = false) {
  await page.addInitScript(({offline})=> {
    const initial = {id:'fixture-profile',name:'Existing Vanilla',minecraftVersion:'fixture-release',loader:{kind:'vanilla' as const},libraryRoot:'C:\\Orbit\\Minecraft',gameDirectory:'C:\\Orbit\\Minecraft',legacy:true}
    const state: Snapshot = {
      settings:{clientId:'',javaPath:'',gameDirectory:initial.libraryRoot,maxMemoryMiB:2048},accounts:[],microsoftConfigured:false,account:{status:'signedOut'},
      releases:offline?[]:[{id:'fixture-release',url:'https://piston-meta.mojang.com/fixture.json',sha1:'a'.repeat(40),releasedAt:'2026-01-01'}],
      profiles:offline?[]:[initial],selectedProfileId:offline?null:initial.id,profileInstallation:'missing',operation:{phase:'idle'},logs:[],error:null,offline
    }
    const listeners=new Set<(s:Snapshot)=>void>(),emit=()=>{for(const fn of listeners)fn(structuredClone(state))}
    const snapshot=()=>structuredClone(state)
    const content:Record<string,ManagedAddon[]>={}
    let request:{kind:AddonKind;projectId?:string;versionId?:string;worldId?:string}={kind:'mod'}
    window.orbit={
      getLibrary:async()=>({profileId:state.selectedProfileId!,worlds:[{id:state.selectedProfileId+':world',name:'Test World'}],installed:content[state.selectedProfileId!]||[],needsRecovery:false}),
      searchAddons:async q=>({projects:[{id:'fixture-'+q.kind,name:'Fixture '+q.kind,description:'Renderer test content',kind:q.kind}],offset:q.offset,limit:q.limit,total:1,cached:false}),
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
  },{offline})
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
  await page.getByRole('button',{name:/Fixture mod Renderer test content/}).click()
  await page.getByRole('button',{name:'Check installation'}).click();await page.getByRole('button',{name:'Install 1 file',exact:true}).click()
  await expect(page.getByRole('button',{name:'Disable Fixture mod',exact:true})).toBeVisible()
  await page.getByRole('tab',{name:'Data packs',exact:true}).click();await page.getByLabel('Target world').selectOption({label:'Test World'})
  await page.getByRole('button',{name:/Fixture datapack Renderer test content/}).click();await page.getByRole('button',{name:'Check installation'}).click();await page.getByRole('button',{name:'Install 1 file',exact:true}).click()
  await expect(page.getByText(/Enabled.*Test World/)).toBeVisible()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  await page.screenshot({path:'test-results/orbit-library-900.png',fullPage:true})
})
test('desktop appearance without injected account or versions',async({page})=>{
  await page.goto('/');await expect(page.getByText(/open the desktop app/i)).toBeVisible()
  await page.screenshot({path:'test-results/orbit-launcher.png',fullPage:true})
})
