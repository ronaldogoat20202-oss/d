import { test, expect, type Page } from '@playwright/test'
import type { Snapshot, NewProfile } from '../../src/shared/contracts'
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
    window.orbit={
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
test('desktop appearance without injected account or versions',async({page})=>{
  await page.goto('/');await expect(page.getByText(/open the desktop app/i)).toBeVisible()
  await page.screenshot({path:'test-results/orbit-launcher.png',fullPage:true})
})
