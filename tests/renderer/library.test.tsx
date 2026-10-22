// @vitest-environment jsdom
import { act,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { expect,it,vi } from 'vitest'
import { LibraryView } from '../../src/renderer/components/LibraryView'
import type { LauncherApi } from '../../src/shared/contracts'
import type { AddonPlan,CatalogVersion,ImportPreview,SearchPage } from '../../src/shared/addons'
const library={profileId:'one',installed:[],worlds:[],needsRecovery:false}
function api(){return{getLibrary:vi.fn(async()=>library),searchAddons:vi.fn(async()=>({projects:[],offset:0,limit:10,total:0,cached:false})),addonVersions:vi.fn(async()=>[])} as unknown as LauncherApi}
it('shows four content tabs, world requirement and in-game activation instructions',async()=>{
  render(<LibraryView profileId="one" api={api()} busy={false} />)
  for(const name of ['Mods','Resource packs','Data packs','Shaders'])expect(screen.getByRole('tab',{name})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab',{name:'Data packs'}));await screen.findByText(/create a world in Minecraft first/i)
  expect(screen.getByText(/world.*data packs|data packs.*world/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab',{name:'Shaders'}));expect(screen.getByText(/Iris.*Fabric/i)).toBeInTheDocument()
})
it('ignores a search from the previous profile',async()=>{
  const bridge=api();let resolve!:(result:SearchPage)=>void
  vi.mocked(bridge.searchAddons).mockImplementationOnce(()=>new Promise(r=>{resolve=r}))
  const view=render(<LibraryView profileId="one" api={bridge} busy={false}/>)
  await waitFor(()=>expect(resolve).toBeDefined())
  vi.mocked(bridge.getLibrary).mockResolvedValue({...library,profileId:'two'})
  view.rerender(<LibraryView profileId="two" api={bridge} busy={false}/>)
  await act(async()=>{resolve({projects:[{id:'old',name:'Old profile result',description:'Old',kind:'mod'}],offset:0,limit:10,total:1,cached:false})})
  expect(screen.queryByText('Old profile result')).not.toBeInTheDocument()
})
it('ignores an import confirmation from the previous profile',async()=>{
  const bridge=api();let resolve!:(value:ImportPreview|null)=>void
  bridge.previewImport=vi.fn(()=>new Promise<ImportPreview|null>(r=>{resolve=r}))
  const view=render(<LibraryView profileId="one" api={bridge} busy={false}/>)
  await screen.findByText('No mods installed in this profile.')
  fireEvent.click(screen.getByRole('button',{name:'Import JAR'}));await waitFor(()=>expect(resolve).toBeDefined())
  vi.mocked(bridge.getLibrary).mockResolvedValue({...library,profileId:'two'});view.rerender(<LibraryView profileId="two" api={bridge} busy={false}/>)
  await act(async()=>resolve({id:'old',profileId:'one',name:'Old import',kind:'mod',compatibility:'unverified',requiredAddons:[]}))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('requires the unverified import checkbox and passes explicit consent',async()=>{
  const bridge=api();bridge.previewImport=vi.fn(async():Promise<ImportPreview>=>({id:'preview',profileId:'one',name:'Local mod',kind:'mod',compatibility:'unverified',requiredAddons:[]}));bridge.installImport=vi.fn(async()=>{})
  render(<LibraryView profileId="one" api={bridge} busy={false}/>)
  fireEvent.click(await screen.findByRole('button',{name:'Import JAR'}));await screen.findByRole('dialog')
  expect(screen.getByRole('button',{name:'Import files'})).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Import files'}))
  await waitFor(()=>expect(bridge.installImport).toHaveBeenCalledWith('preview',true))
})
it('offers recovery and keyboard tab navigation',async()=>{
  const bridge=api();vi.mocked(bridge.getLibrary).mockResolvedValue({...library,needsRecovery:true});bridge.repairAddons=vi.fn(async()=>{vi.mocked(bridge.getLibrary).mockResolvedValue(library)})
  render(<LibraryView profileId="one" api={bridge} busy={false}/>)
  fireEvent.click(await screen.findByRole('button',{name:'Recover add-ons'}));await screen.findByText('Recovery completed.')
  fireEvent.keyDown(screen.getByRole('tab',{name:'Mods'}),{key:'ArrowRight'})
  expect(screen.getByRole('tab',{name:'Resource packs'})).toHaveAttribute('aria-selected','true')
})
it('rejects a late preview after the selected content version changes',async()=>{
  const bridge=api();let resolve!:(value:AddonPlan)=>void
  vi.mocked(bridge.searchAddons).mockResolvedValue({projects:[{id:'example',name:'Example',description:'Content',kind:'mod'}],offset:0,limit:10,total:1,cached:false})
  vi.mocked(bridge.addonVersions).mockResolvedValue(['v1','v2'].map(id=>({id,projectId:'example',name:id,kind:'mod',gameVersions:['1.21.1'],loaders:['fabric'],files:[],dependencies:[],publishedAt:'2026-01-01'})) as CatalogVersion[])
  bridge.previewAddon=vi.fn(()=>new Promise<AddonPlan>(r=>{resolve=r}));bridge.installAddon=vi.fn(async()=>{})
  render(<LibraryView profileId="one" api={bridge} busy={false}/>)
  fireEvent.click(await screen.findByRole('button',{name:/Example/}));fireEvent.click(await screen.findByRole('button',{name:'Check installation'}));await waitFor(()=>expect(resolve).toBeDefined())
  fireEvent.change(screen.getByRole('combobox'),{target:{value:'v2'}})
  await act(async()=>resolve({id:'old-v1-plan',profileId:'one',entries:[{name:'v1',kind:'mod',versionId:'v1',bytes:100}],optionalDependencies:[]}))
  expect(screen.queryByRole('button',{name:'Install 1 file'})).not.toBeInTheDocument();expect(bridge.installAddon).not.toHaveBeenCalled()
})
it('offers to forget an unavailable world entry while preserving its files',async()=>{
  const bridge=api();bridge.removeAddon=vi.fn(async()=>{})
  vi.mocked(bridge.getLibrary).mockResolvedValue({...library,installed:[{id:'orphan',kind:'datapack',name:'World pack',source:'local',projectId:null,versionId:null,relativePath:'saves/Deleted/datapacks/pack.zip',sha512:'a'.repeat(128),providerSize:null,providerSha512:null,enabled:true,worldId:'one:deleted',dependencies:[],compatibility:'unverified',gameVersion:'1.21.1',loader:'fabric'}]})
  render(<LibraryView profileId="one" api={bridge} busy={false}/>);fireEvent.click(screen.getByRole('tab',{name:'Data packs'}))
  fireEvent.click(await screen.findByRole('button',{name:'Forget World pack'}));await waitFor(()=>expect(bridge.removeAddon).toHaveBeenCalledWith('orphan'))
  expect(screen.queryByRole('button',{name:'Disable World pack'})).not.toBeInTheDocument()
  expect(screen.getByText(/forgetting this entry leaves any remaining files unchanged/i)).toBeInTheDocument()
})
