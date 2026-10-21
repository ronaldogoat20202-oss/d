import { ArrowDownToLine, Check, Compass, RefreshCw } from 'lucide-react'
import type { LauncherApi, Snapshot } from '../../shared/contracts'
import { AccountPanel } from './AccountPanel'

export function PlayView({ snapshot, api, onAction, onSettings }: { snapshot: Snapshot | null; api?: LauncherApi; onAction(action: () => Promise<unknown>): void; onSettings(): void }) {
  const installed = !!snapshot?.selectedVersionId && snapshot.installedVersionIds.includes(snapshot.selectedVersionId)
  const operation = snapshot?.operation || { phase: 'idle' as const }
  const busy = operation.phase !== 'idle'
  const ready = snapshot?.account.status === 'signedIn'
  const perform = (action: keyof Pick<LauncherApi, 'install' | 'launch' | 'signIn' | 'signOut' | 'cancelSignIn' | 'refreshVersions'>) => { if (api) onAction(() => api[action]()) }
  return <>
    <section className="launch-card launch-controls">
      <div className="version-control"><label className="field-label" htmlFor="minecraft-version">MINECRAFT VERSION</label><select id="minecraft-version" className="version-select" disabled={!api || busy || !snapshot?.releases.length} value={snapshot?.selectedVersionId || ''} onChange={e => { if (api) onAction(() => api.selectVersion(e.target.value)) }}>
        {!snapshot?.releases.length && <option value="">No releases available</option>}
        {snapshot?.releases.map(release => <option key={release.id} value={release.id}>{release.id} · Release</option>)}
      </select><span className="version-caption">{installed ? <><Check size={12}/> Installed & verified</> : snapshot?.offline ? 'Offline · showing cached releases' : 'Official vanilla releases'}</span></div>
      <div className="launch-action"><button className="primary play-button" disabled={!api || !snapshot?.selectedVersionId || busy || (installed && !ready)} onClick={() => perform(installed ? 'launch' : 'install')}>
        {installed ? <Compass size={19}/> : <ArrowDownToLine size={18}/>}{busy ? operation.phase === 'running' ? 'Minecraft is running' : operation.phase === 'installing' ? 'Installing…' : 'Launching…' : installed ? 'Play Minecraft' : 'Install Minecraft'}
      </button><span>{installed && !ready ? <button className="text-button" onClick={onSettings}>Choose an account and select Java to play.</button> : 'A new adventure is one click away.'}</span></div>
    </section>
    {!api && <p className="connection-note">Open the desktop app to connect to Minecraft.</p>}
    {api && !snapshot?.releases.length && <div className="connection-note">{snapshot?.offline ? 'Could not load official versions. Check your connection.' : 'Loading official Minecraft releases…'} <button className="text-button" onClick={() => perform('refreshVersions')}><RefreshCw size={12}/> Retry connection</button></div>}
    {operation.phase === 'installing' && <section className="download-panel" aria-live="polite"><div><strong>{operation.progress.message}</strong><span>{operation.progress.totalBytes ? `${Math.min(100, Math.floor(operation.progress.completedBytes / operation.progress.totalBytes * 100))}%` : 'Preparing…'}</span></div><progress max={100} value={operation.progress.totalBytes ? Math.min(100, operation.progress.completedBytes / operation.progress.totalBytes * 100) : undefined}/><small>{(operation.progress.completedBytes / 1048576).toFixed(1)} MiB downloaded{operation.progress.totalBytes ? ` of ${(operation.progress.totalBytes / 1048576).toFixed(1)} MiB` : ''}</small></section>}
    {snapshot && <AccountPanel account={snapshot.account} accounts={snapshot.accounts} microsoftConfigured={snapshot.microsoftConfigured} onSignIn={() => perform('signIn')} onSignOut={() => perform('signOut')} onCancel={() => perform('cancelSignIn')} onCreate={name => { if (api) onAction(() => api.createOfflineAccount(name)) }} onSelect={(kind,id) => { if (api) onAction(() => api.selectAccount(kind,id)) }} onRemove={(kind,id) => { if (api) onAction(() => api.removeAccount(kind,id)) }}/>}
  </>
}
