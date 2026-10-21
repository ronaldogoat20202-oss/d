import { useState } from 'react'
import { LogOut, Plus, UserRound } from 'lucide-react'
import type { AccountIdentity, AccountKind, AccountState } from '../../shared/contracts'
interface Props {
  account: AccountState; accounts: AccountIdentity[]; microsoftConfigured: boolean
  onSignIn(): void; onSignOut(): void; onCancel(): void; onCreate(name: string): void
  onSelect(kind: AccountKind, id: string): void; onRemove(kind: AccountKind, id: string): void
}
export function AccountPanel({ account, accounts, microsoftConfigured, onSignIn, onSignOut, onCancel, onCreate, onSelect, onRemove }: Props) {
  const [creating, setCreating] = useState(false), [name, setName] = useState('')
  const selected = account.status === 'signedIn' ? account.profile : null
  return <section className="account-card">
    <span className="account-avatar"><UserRound size={20}/></span>
    <div className="account-details"><strong>{selected?.name || (account.status === 'signingIn' ? 'Finish signing in in your browser' : 'Choose how you play')}</strong>
      <p>{selected ? selected.kind === 'offline' ? 'Local offline profile · Single-player and offline servers' : account.status === 'signedIn' && account.persistent === false ? 'Microsoft account · Temporary session' : 'Microsoft account connected' : account.status === 'signingIn' ? 'The Microsoft page is open in your browser. Return here after signing in.' : 'Connect a Microsoft account or use a local username.'}</p>
      {!selected && <p className="field-help">Offline profiles work in single-player and offline servers. Authenticated servers and Realms require a Microsoft account.</p>}
      {!microsoftConfigured && <p className="field-help">Microsoft sign-in needs Orbit publisher registration. Offline profiles are available now.</p>}
    </div>
    <div className="account-actions">{account.status === 'signingIn' ? <button className="secondary" onClick={onCancel}>Cancel sign-in</button> : <button className="secondary" disabled={!microsoftConfigured} onClick={onSignIn}>Sign in with Microsoft</button>}
      <button className="secondary" onClick={() => setCreating(!creating)}><Plus size={14}/> Create offline profile</button>
      {selected && <button className="secondary" onClick={onSignOut}><LogOut size={14}/> Sign out</button>}
    </div>
    {!!accounts?.length && <div className="account-options"><label>Saved accounts<select aria-label="Saved accounts" value={selected ? `${selected.kind}:${selected.id}` : ''} onChange={e => { const [kind,id] = e.target.value.split(':'); if (id) onSelect(kind as AccountKind,id) }}><option value="">Choose an account</option>{accounts.map(a => <option key={`${a.kind}:${a.id}`} value={`${a.kind}:${a.id}`}>{a.name} · {a.kind === 'offline' ? 'Offline' : 'Microsoft'}</option>)}</select></label>{selected && <button className="text-button" onClick={() => onRemove(selected.kind, selected.id)}>Remove saved account</button>}</div>}
    {creating && <form className="account-options" onSubmit={e => { e.preventDefault(); if (/^[A-Za-z0-9_]{3,16}$/.test(name)) { onCreate(name); setName(''); setCreating(false) } }}><label>Offline username<input aria-label="Offline username" value={name} minLength={3} maxLength={16} pattern="[A-Za-z0-9_]{3,16}" required onChange={e => setName(e.target.value)} placeholder="Your in-game name"/></label><button className="primary" disabled={!/^[A-Za-z0-9_]{3,16}$/.test(name)}>Create profile</button><small>3–16 letters, digits or underscores. Offline profiles cannot join authenticated servers or Realms.</small></form>}
  </section>
}
