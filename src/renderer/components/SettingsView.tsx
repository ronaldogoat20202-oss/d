import { useEffect, useState } from 'react'
import { Check, FolderOpen, Save } from 'lucide-react'
import type { LauncherApi, Settings } from '../../shared/contracts'

type SettingsApi = Pick<LauncherApi, 'saveSettings' | 'chooseJava' | 'chooseGameDirectory'>
export function SettingsView({ settings, api }: { settings: Settings | null; api?: SettingsApi }) {
  const [form, setForm] = useState<Settings | null>(settings)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setForm(settings) }, [settings?.clientId, settings?.javaPath, settings?.gameDirectory, settings?.maxMemoryMiB])
  if (!form) return <section className="panel"><h2>Launcher preferences</h2><p>Open the desktop app to configure your launcher.</p></section>
  const edit = (patch: Partial<Settings>) => { setForm({ ...form, ...patch }); setSaved(false) }
  async function choose(method: 'chooseJava' | 'chooseGameDirectory') {
    try { if (api) setForm((await api[method]()).settings) } catch (e) { setError((e as Error).message) }
  }
  return <form className="panel settings-form" noValidate onSubmit={async e => {
    e.preventDefault(); if (!api) return; setError(''); setSaved(false); setBusy(true)
    try { await api.saveSettings(form); setSaved(true) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }}>
    <div className="panel-heading"><h2>Launcher preferences</h2><span className="pill">LOCAL TO YOUR DEVICE</span></div>
    <label>Microsoft application client ID<input value={form.clientId} placeholder="Your public application ID" onChange={e => edit({ clientId: e.target.value.trim() })}/></label><p className="field-help">Your own Microsoft public-client registration is needed for sign-in. This ID is public; no password or client secret is used.</p>
    <label>Java executable<div className="input-action"><input value={form.javaPath} placeholder="Select a compatible 64-bit Java installation" onChange={e => edit({ javaPath: e.target.value })}/><button type="button" className="secondary" aria-label="Browse Java executable" disabled={!api} onClick={() => void choose('chooseJava')}><FolderOpen size={16}/></button></div></label><p className="field-help">Use java.exe on Windows. The launcher checks the version required by your chosen Minecraft release.</p>
    <label>Game folder<div className="input-action"><input value={form.gameDirectory} onChange={e => edit({ gameDirectory: e.target.value })}/><button type="button" className="secondary" aria-label="Browse game folder" disabled={!api} onClick={() => void choose('chooseGameDirectory')}><FolderOpen size={16}/></button></div></label>
    <label>Memory allocation (MiB)<input type="number" value={form.maxMemoryMiB || ''} onChange={e => edit({ maxMemoryMiB: Number(e.target.value) })}/></label><p className="field-help">At least 1024 MiB, up to 75% of your system memory. 2048 MiB is a good starting point.</p>
    <div className="form-actions"><button className="primary" disabled={!api || busy}><Save size={15}/>{busy ? 'Saving…' : 'Save preferences'}</button>{saved && <span role="status" className="saved"><Check size={15}/> Preferences saved</span>}</div>
    {error && <div role="alert" className="error-banner">{error}</div>}
  </form>
}
