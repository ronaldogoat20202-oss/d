import { useEffect,useRef,useState } from 'react'
import { ArrowDownToLine,Search,RefreshCw,ChevronLeft,ChevronRight } from 'lucide-react'
import type { LauncherApi } from '../../shared/contracts'
import type { AddonKind,AddonPlan,CatalogProject,CatalogSort,CatalogVersion,ImportPreview,LibraryState,SearchPage } from '../../shared/addons'
import { AddonDetails } from './AddonDetails'
import { CatalogRow } from './CatalogProject'
import { ImportDialog } from './ImportDialog'
const tabs:[AddonKind,string][]=[['mod','Mods'],['resourcepack','Resource packs'],['datapack','Data packs'],['shader','Shaders']]
const instructions:Record<AddonKind,string>={mod:'Enabled mods load the next time you launch this Fabric profile.',resourcepack:'Activate resource packs in Minecraft: Options → Resource Packs.',datapack:'Enable data packs inside the selected world with /datapack.',shader:'Shaders require compatible Iris in a Fabric profile. Activate them in Minecraft: Video Settings → Shader Packs.'}
export function LibraryView({profileId,api,busy,loader='fabric',profileName='selected profile'}:{profileId:string|null;api?:LauncherApi;busy:boolean;loader?:'fabric'|'vanilla';profileName?:string}){
  const [kind,setKind]=useState<AddonKind>('mod'),[library,setLibrary]=useState<LibraryState|null>(null),[search,setSearch]=useState<SearchPage|null>(null)
  const [sort,setSort]=useState<CatalogSort>('relevance'),[limit,setLimit]=useState(20),[body,setBody]=useState(''),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState('')
  const [input,setInput]=useState(''),[query,setQuery]=useState(''),[offset,setOffset]=useState(0),[retry,setRetry]=useState(0),[world,setWorld]=useState('')
  const [loading,setLoading]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const [project,setProject]=useState<CatalogProject|null>(null),[versions,setVersions]=useState<CatalogVersion[]>([]),[versionId,setVersionId]=useState(''),[plan,setPlan]=useState<AddonPlan|null>(null),[preview,setPreview]=useState<ImportPreview|null>(null)
  const active=useRef(''),contextKey=useRef(''),contextGeneration=useRef(0),searchGeneration=useRef(0),detailGeneration=useRef(0)
  const key=`${profileId}:${kind}:${world}`
  if(contextKey.current!==key){contextKey.current=key;active.current=`${++contextGeneration.current}:${key}`}
  const disabled=busy||working,needsWorld=kind==='datapack'&&!world,unsupported=(kind==='mod'||kind==='shader')&&loader!=='fabric',canInstall=!disabled&&!needsWorld&&!unsupported&&!library?.needsRecovery
  useEffect(()=>{setLibrary(null);setWorld('');setNotice('');if(!api||!profileId)return;const id=profileId;let stale=false;api.getLibrary().then(value=>{if(!stale&&value.profileId===id)setLibrary(value)}).catch(e=>{if(!stale)setError(e.message)});return()=>{stale=true}},[api,profileId])
  useEffect(()=>{setProject(null);setPlan(null);setPreview(null);setVersions([]);setError('');setWorking(false);detailGeneration.current++},[profileId,kind,world])
  useEffect(()=>{
    if(!api||!profileId)return
    const generation=++searchGeneration.current,token=active.current
    setLoading(true);setSearch(null);setError('')
    api.searchAddons({kind,query,offset,limit,sort}).then(value=>{if(generation===searchGeneration.current&&token===active.current)setSearch(value)}).catch(e=>{if(generation===searchGeneration.current&&token===active.current)setError(e.message)}).finally(()=>{if(generation===searchGeneration.current&&token===active.current)setLoading(false)})
    return()=>{searchGeneration.current++}
  },[api,profileId,kind,world,query,offset,limit,sort,retry])
  async function run(action:()=>Promise<unknown>,success?:()=>void){const token=active.current;setWorking(true);setError('');setNotice('');try{await action();if(token!==active.current)return;const value=await api!.getLibrary();if(token!==active.current||value.profileId!==profileId)return;setLibrary(value);success?.()}catch(e){if(token===active.current)setError((e as Error).message)}finally{if(token===active.current)setWorking(false)}}
  async function details(value:CatalogProject){
    if(!api)return
    const token=active.current,generation=++detailGeneration.current
    setProject(value);setBody('');setVersions([]);setPlan(null);setVersionId('');setError('');setDetailError('');setDetailLoading(true)
    const current=()=>token===active.current&&generation===detailGeneration.current
    await Promise.allSettled([
      api.addonDetails(value.id,kind).then(full=>{if(current()){setBody(full.body);setProject({...full,author:full.author||value.author})}}).catch(e=>{if(current())setDetailError(e.message)}),
      api.addonVersions(value.id,kind).then(available=>{if(current()){setVersions(available);setVersionId(available[0]?.id||'')}}).catch(e=>{if(current())setDetailError(e.message)})
    ])
    if(current())setDetailLoading(false)
  }
  async function prepare(){if(!api||!project)return;const token=active.current,generation=detailGeneration.current;setWorking(true);setError('');try{const value=await api.previewAddon({kind,projectId:project.id,versionId,worldId:kind==='datapack'?world:undefined});if(token===active.current&&generation===detailGeneration.current&&value.profileId===profileId)setPlan(value)}catch(e){if(token===active.current)setError((e as Error).message)}finally{if(token===active.current)setWorking(false)}}
  async function importFile(){if(!api)return;const token=active.current;setWorking(true);setError('');try{const value=await api.previewImport(kind,kind==='datapack'?world:undefined);if(token===active.current&&value?.profileId===profileId)setPreview(value)}catch(e){if(token===active.current)setError((e as Error).message)}finally{if(token===active.current)setWorking(false)}}
  if(!api)return <p className="connection-note">Open the desktop app to browse and install content.</p>
  if(!profileId)return <section className="panel"><h2>Choose a game profile</h2><p>Create or select a game profile on Play to manage its mods and packs.</p></section>
  return <div className="library-view">
    <div className="library-tabs" role="tablist" aria-label="Content kinds">{tabs.map(([value,label],index)=><button key={value} role="tab" aria-selected={kind===value} tabIndex={kind===value?0:-1} className={kind===value?'selected':''} onClick={()=>{setKind(value);setOffset(0)}} onKeyDown={event=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;setKind(tabs[next][0]);setOffset(0);(event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus()}}}>{label}</button>)}</div>
    {!project&&<>
    <p className="library-help">{instructions[kind]}</p>
    {disabled&&<p role="status" className="library-help">Minecraft is running or another operation is in progress. Wait before changing content.</p>}
    {unsupported&&<p className="connection-note">Create or select a Fabric game profile on Play to install mods and shaders.</p>}
    {library?.needsRecovery&&<section className="error-banner"><p>Interrupted changes need recovery before you can launch or install content.</p><button className="secondary" disabled={disabled} onClick={()=>void run(()=>api.repairAddons(),()=>setNotice('Recovery completed.'))}>Recover add-ons</button></section>}
    {kind==='datapack'&&<div className="world-picker"><label>Target world<select value={world} onChange={e=>setWorld(e.target.value)}><option value="">Choose an existing world</option>{library?.worlds.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>{library&&!library.worlds.length&&<p>Create a world in Minecraft first, then refresh the Library.</p>}<button className="text-button" disabled={disabled} onClick={()=>void run(async()=>{})}>Refresh worlds</button></div>}
    <section className="catalog-panel" aria-label="Modrinth catalog"><form className="catalog-search" onSubmit={e=>{e.preventDefault();setQuery(input);setOffset(0);setRetry(v=>v+1)}}><Search size={20}/><label className="sr-only" htmlFor="addon-search">Search content</label><input id="addon-search" value={input} onChange={e=>setInput(e.target.value)} maxLength={200} placeholder={`Search ${tabs.find(t=>t[0]===kind)![1].toLowerCase()}…`}/><button className="secondary" type="submit">Search</button></form>
      <div className="catalog-toolbar"><label>Sort by<select aria-label="Sort by" value={sort} onChange={e=>{setSort(e.target.value as CatalogSort);setOffset(0)}}><option value="relevance">Relevance</option><option value="downloads">Downloads</option><option value="follows">Followers</option><option value="newest">Newest</option><option value="updated">Recently updated</option></select></label><label>View<select aria-label="View" value={limit} onChange={e=>{setLimit(Number(e.target.value));setOffset(0)}}>{[10,20,50].map(n=><option key={n} value={n}>{n}</option>)}</select></label><span className="catalog-result-count">{search?`${search.total.toLocaleString()} results`:'Modrinth'}</span>
      {search&&search.total>limit&&<nav className="catalog-pagination" aria-label="Catalog pages"><button aria-label="Previous page" disabled={loading||offset===0} onClick={()=>setOffset(Math.max(0,offset-limit))}><ChevronLeft size={18}/></button>{[...new Set([1,Math.floor(offset/limit)+1,Math.min(Math.ceil(search.total/limit),Math.floor(10000/limit)+1)])].map((n,i,list)=><span key={n}>{i>0&&n>list[i-1]+1&&<span className="page-gap">…</span>}<button aria-label={`Page ${n}`} aria-current={n===Math.floor(offset/limit)+1?'page':undefined} disabled={loading} onClick={()=>setOffset((n-1)*limit)}>{n}</button></span>)}<button aria-label="Next page" disabled={loading||offset+limit>=search.total||offset+limit>10000} onClick={()=>setOffset(offset+limit)}><ChevronRight size={18}/></button></nav>}</div>
      {loading&&<p role="status" className="catalog-message">Searching compatible content…</p>}{search?.cached&&<p className="catalog-message">Offline · showing cached catalog results.</p>}{search&&!search.projects.length&&<p className="catalog-empty">No compatible results. Try another search or Minecraft version.</p>}
      <div className="catalog-results">{search?.projects.map(item=><CatalogRow key={item.id} project={item} onOpen={()=>void details(item)} onAdd={()=>void details(item)}/>)}</div>
    </section>
    <section className="panel installed-content"><div className="panel-heading"><h2>Installed {tabs.find(t=>t[0]===kind)![1].toLowerCase()}</h2><button className="secondary" disabled={!canInstall} onClick={()=>void importFile()}><ArrowDownToLine size={14}/>Import {kind==='mod'?'JAR':'ZIP'}</button></div>
      {!library&&<p>Loading installed content…</p>}
      {library&&!library.installed.some(e=>e.kind===kind)&&<p>No {tabs.find(t=>t[0]===kind)![1].toLowerCase()} installed in this profile.</p>}
      {library?.installed.filter(e=>e.kind===kind).map(e=>{const unavailable=e.kind==='datapack'&&!library.worlds.some(w=>w.id===e.worldId);return <article className="installed-addon" key={e.id}><div><strong>{e.name}</strong><small>{unavailable?'Inactive':e.enabled?'Enabled':'Disabled'} · {e.source==='local'?'Local import':e.versionId}{e.compatibility==='unverified'?' · Compatibility unverified':''}{e.worldId?` · ${library.worlds.find(w=>w.id===e.worldId)?.name||'World unavailable'}`:''}</small></div><div className="addon-actions">{!unavailable&&<button className="secondary" disabled={disabled||library.needsRecovery} onClick={()=>void run(()=>api.setAddonEnabled(e.id,!e.enabled))}>{e.enabled?'Disable':'Enable'} {e.name}</button>}{!unavailable&&e.source==='modrinth'&&<button className="text-button" disabled={disabled||library.needsRecovery} onClick={()=>void run(()=>api.updateAddon(e.id),()=>setNotice('Compatible update checked and installed.'))}>Update {e.name}</button>}<button className="text-button" disabled={disabled||library.needsRecovery} onClick={()=>void run(()=>api.removeAddon(e.id))}>{unavailable?'Forget':'Remove'} {e.name}</button></div>{unavailable&&<p className="field-help">World unavailable. Forgetting this entry leaves any remaining files unchanged.</p>}</article>})}
    </section>
    </>}
    {project&&<AddonDetails key={project.id} project={project} body={body} loading={detailLoading} detailError={detailError} targetName={profileName} onRetry={()=>void details(project)} onLink={url=>{void api.openProjectLink(url).catch(e=>setError(e.message))}} versions={versions} versionId={versionId} plan={plan} busy={!canInstall} onVersion={id=>{detailGeneration.current++;setVersionId(id);setPlan(null)}} onPreview={()=>void prepare()} onInstall={()=>{if(plan)void run(()=>api.installAddon(plan.id),()=>{setPlan(null);setProject(null);setNotice('Installed. '+instructions[kind])})}} onClose={()=>{detailGeneration.current++;setProject(null);setPlan(null)}}/>}
    {preview&&<div className="dialog-backdrop"><ImportDialog preview={preview} busy={disabled} onConfirm={allow=>void run(()=>api.installImport(preview.id,allow),()=>{setPreview(null);setNotice('Imported. '+instructions[kind])})} onClose={()=>setPreview(null)}/></div>}
    {notice&&<p role="status" className="saved">{notice}</p>}{error&&<div role="alert" className="error-banner">{error} <button className="text-button" onClick={()=>setRetry(v=>v+1)}><RefreshCw size={12}/>Retry</button></div>}
  </div>
}
