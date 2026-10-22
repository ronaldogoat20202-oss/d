import { useEffect,useRef,useState } from 'react'
import type { ImportPreview } from '../../shared/addons'
export function ImportDialog({preview,busy,onConfirm,onClose}:{preview:ImportPreview;busy:boolean;onConfirm(allowUnverified:boolean):void;onClose():void}){
  const [confirmed,setConfirmed]=useState(false),close=useRef<HTMLButtonElement>(null)
  useEffect(()=>{setConfirmed(false);close.current?.focus()},[preview.id])
  const unknown=preview.compatibility==='unverified'
  return <section role="dialog" aria-modal="true" aria-labelledby="import-title" className="import-dialog" onKeyDown={e=>{if(e.key==='Escape'&&!busy)onClose();if(e.key==='Tab'){const controls=Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)'));if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus()}else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus()}}}}>
    <div className="panel-heading"><h2 id="import-title">Import {preview.name}</h2><button ref={close} className="text-button" disabled={busy} onClick={onClose}>Cancel import</button></div>
    <p>{unknown?'This archive has no verified compatibility declaration. Check that it supports your Minecraft version.':'The archive declares support for this Minecraft version.'}</p>
    {!!preview.requiredAddons.length&&<><p>Required compatible add-ons will also be installed:</p><ul>{preview.requiredAddons.map(e=><li key={e.versionId}>{e.name} · {(e.bytes/1048576).toFixed(1)} MiB</li>)}</ul></>}
    {unknown&&<label className="consent"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I understand compatibility is unverified.</label>}
    <button className="primary" disabled={busy||(unknown&&!confirmed)} onClick={()=>onConfirm(confirmed)}>Import files</button>
  </section>
}
