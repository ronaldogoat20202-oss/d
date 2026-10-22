import type { AddonPlan,CatalogProject,CatalogVersion } from '../../shared/addons'
export function AddonDetails({project,versions,versionId,plan,busy,onVersion,onPreview,onInstall,onClose}:{project:CatalogProject;versions:CatalogVersion[];versionId:string;plan:AddonPlan|null;busy:boolean;onVersion(id:string):void;onPreview():void;onInstall():void;onClose():void}){
  const version=versions.find(v=>v.id===versionId)
  return <section className="panel addon-details" aria-label="Add-on details">
    <div className="panel-heading"><h2>{project.name}</h2><button className="text-button" onClick={onClose}>Close details</button></div>
    <p>{project.description}</p>
    {versions.length?<><label>Compatible version<select value={versionId} onChange={e=>onVersion(e.target.value)}>{versions.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <p>For Minecraft {version?.gameVersions.join(', ')} · {version?.loaders.join(', ')}</p>
      {!!version?.dependencies.length&&<p>{version.dependencies.filter(d=>d.type==='required').length} required dependencies. Optional dependencies are shown separately.</p>}
      <button className="secondary" disabled={busy||!version} onClick={onPreview}>Check installation</button>
    </>:<p>No compatible versions are available for this game profile.</p>}
    {plan&&<div className="install-preview" aria-label="Installation preview"><h3>Review installation</h3><p>All required files are included below. Existing managed versions may be replaced.</p><ul>{plan.entries.map(e=><li key={e.versionId}>{e.name} <small>{e.kind} · {(e.bytes/1048576).toFixed(1)} MiB</small></li>)}</ul>
      {!!plan.optionalDependencies.length&&<p>Optional, not installed: {plan.optionalDependencies.join(', ')}</p>}
      <button className="primary" disabled={busy} onClick={onInstall}>Install {plan.entries.length} {plan.entries.length===1?'file':'files'}</button>
    </div>}
  </section>
}
