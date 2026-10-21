import { useEffect, useState } from 'react'
import { ArrowUpRight, LogOut, UserRound } from 'lucide-react'
import type { AccountState } from '../../shared/contracts'

export function AccountPanel({ account, hasClientId, onSignIn, onSignOut, onCancel, onSettings }: { account: AccountState; hasClientId: boolean; onSignIn(): void; onSignOut(): void; onCancel(): void; onSettings(): void }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { if (account.status !== 'signingIn') return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [account.status])
  return <section className="account-card"><span className="account-avatar"><UserRound size={20}/></span><div className="account-details">
    <strong>{account.status === 'signedIn' ? account.profile.name : account.status === 'signingIn' ? 'Connect your Microsoft account' : 'Your adventure, your account'}</strong>
    {account.status === 'signingIn' && account.device ? <><p>Enter this code in the Microsoft browser page:</p><code className="device-code">{account.device.userCode}</code><p>{account.device.expiresAt <= now ? 'Code expired. Cancel and try again.' : `Expires in ${Math.ceil((account.device.expiresAt - now) / 60000)} minutes · ${account.device.verificationUri}`}</p></> : <p>{account.status === 'signedIn' ? (account.persistent === false ? 'Temporary session. Sign in again after closing Orbit.' : 'Minecraft Java account connected') : hasClientId ? 'Sign in to play. You can install game files first.' : 'Add your Microsoft application ID in Settings to sign in.'}</p>}
  </div>{account.status === 'signedIn' ? <button className="secondary" onClick={onSignOut}><LogOut size={14}/> Sign out</button> : account.status === 'signingIn' ? <button className="secondary" onClick={onCancel}>Cancel</button> : <button className="secondary" onClick={hasClientId ? onSignIn : onSettings}>{hasClientId ? 'Sign in with Microsoft' : 'Configure sign-in'}<ArrowUpRight size={14}/></button>}</section>
}
