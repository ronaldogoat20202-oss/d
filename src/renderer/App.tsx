import { useEffect, useState } from 'react'
import { ArrowUpRight, Box, Compass, FileText, Settings2, Sparkles } from 'lucide-react'
import type { Snapshot } from '../shared/contracts'
import { SettingsView } from './components/SettingsView'
import { PlayView } from './components/PlayView'
import { LogsView } from './components/LogsView'
import { LibraryView } from './components/LibraryView'
import { ProfilePicker } from './components/ProfilePicker'

export default function App() {
  const [page, setPage] = useState<'Play' | 'Library' | 'Settings' | 'Logs'>('Play')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState('')
  function action(operation: () => Promise<unknown>): void {
    setError('')
    void operation().catch(error => setError((error as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')))
  }
  useEffect(() => {
    if (!window.orbit) return
    window.orbit.getSnapshot().then(setSnapshot).catch(() => setError('Could not connect to the launcher.'))
    return window.orbit.subscribe(setSnapshot)
  }, [])
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" aria-label="Orbit home" onClick={e => { e.preventDefault(); setPage('Play') }}><span className="orbit-mark" /><span>orbit<span className="brand-dot">.</span></span></a>
      <span className="nav-label">YOUR LAUNCHPAD</span>
      <nav aria-label="Main navigation">{(['Play', 'Library', 'Settings', 'Logs'] as const).map((name, index) => {
        const Icon = [Compass, Box, Settings2, FileText][index]
        return <button key={name} className={`nav-item ${page === name ? 'active' : ''}`} onClick={() => setPage(name)}><Icon size={19}/>{name}{page === name && <span className="active-dot"/>}</button>
      })}</nav>
      <div className="sidebar-bottom"><span className="mini-cube"><Box size={21}/></span><div><strong>Minecraft Java</strong><small>Your worlds, your way.</small></div></div>
      <div className="sidebar-version">ORBIT LAUNCHER <span>v0.1.0</span></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <strong>{page}</strong></div><span className="edition-tag"><span className="status-dot"/> JAVA EDITION</span></header>
      <div className="page-content">
        <div className="eyebrow"><span className="short-line"/>{page === 'Play' ? 'LESS SETUP. MORE ADVENTURE.' : 'YOUR LAUNCHER, YOUR RULES.'}</div>
        <div className="page-heading"><div><h1>{page === 'Play' ? <>Your next world<br/>starts here<span className="accent">.</span></> : page === 'Library' ? <>Make your world yours<span className="accent">.</span></> : page === 'Settings' ? <>Make it yours<span className="accent">.</span></> : <>Behind the scenes<span className="accent">.</span></>}</h1><p>{page === 'Play' ? 'A familiar world. A fresh way to launch it.' : page === 'Library' ? 'Mods, packs, and shaders for each game profile.' : page === 'Settings' ? 'A few small details for a smoother adventure.' : 'Every download, launch, and little detail.'}</p></div><div className="heading-icon"><Sparkles size={25}/></div></div>
        {page === 'Play' ? <>
          <section className="hero-card" aria-label="Minecraft Java Edition">
            <div className="hero-copy"><span className="pill">THE ORIGINAL EXPERIENCE</span><h2>MINECRAFT<span>JAVA EDITION</span></h2><p>Build something out of nothing.<br/>Find your own kind of adventure.</p><span className="hero-caption">YOUR WORLD. IN YOUR ORBIT. <ArrowUpRight size={15}/></span></div>
            <div className="voxel-scene" aria-hidden="true"><div className="pixel-sun"/><div className="voxel-cloud cloud-one"/><div className="voxel-cloud cloud-two"/><div className="voxel-mountain back-mountain"/><div className="voxel-mountain front-mountain"/><div className="voxel-land land-back"/><div className="voxel-land land-front"/><div className="voxel-tree tree-one"><i/><b/></div><div className="voxel-tree tree-two"><i/><b/></div><div className="scene-grid"/></div>
            <div className="hero-bottom"><span><span className="status-dot"/> Official game files</span><span>ONE CLICK CLOSER TO YOUR WORLD</span></div>
          </section>
          <PlayView snapshot={snapshot} api={window.orbit} onAction={action} onSettings={() => setPage('Settings')}/>
          <div className="info-row"><span><Box size={17}/> Vanilla or Fabric. Your own space.</span><span>Built for the way you play <ArrowUpRight size={15}/></span></div>
        </> : page === 'Library' ? <>{snapshot && <ProfilePicker fabricAvailable profiles={snapshot.profiles} selectedId={snapshot.selectedProfileId} releases={snapshot.releases} busy={snapshot.operation.phase!=='idle'} onSelect={id=>action(()=>window.orbit!.selectProfile(id))} onCreate={input=>action(()=>window.orbit!.createProfile(input))} onRename={(id,name)=>action(()=>window.orbit!.renameProfile(id,name))} onRemove={id=>action(()=>window.orbit!.removeProfile(id))}/>}<LibraryView profileId={snapshot?.selectedProfileId||null} loader={snapshot?.profiles.find(p=>p.id===snapshot.selectedProfileId)?.loader.kind} api={window.orbit} busy={!!snapshot&&snapshot.operation.phase!=='idle'}/></> : page === 'Settings' ? <SettingsView settings={snapshot?.settings || null} api={window.orbit}/> : <LogsView logs={snapshot?.logs || []} onCopy={() => { if (window.orbit) action(() => window.orbit!.copyLogs()) }}/ >}
        {snapshot?.operation.phase==='content'&&<div className="download-panel" role="status"><strong>{snapshot.operation.progress?.message||snapshot.operation.message}</strong>{snapshot.operation.progress&&<progress value={snapshot.operation.progress.completedBytes} max={snapshot.operation.progress.totalBytes||undefined}/>}</div>}{(error || snapshot?.error) && <div role="alert" className="error-banner">{error || snapshot?.error?.message}</div>}
      </div>
      <footer className="app-footer"><span><span className="status-dot"/> A LITTLE SPACE FOR BIG IDEAS</span><span>Independent launcher · Not affiliated with Mojang or Microsoft</span></footer>
    </main>
  </div>
}
