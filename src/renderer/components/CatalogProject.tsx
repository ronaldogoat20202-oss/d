import { useState } from 'react'
import { Box,Clock3,Download,Heart,Monitor,Plus,Server } from 'lucide-react'
import type { CatalogProject } from '../../shared/addons'
import { projectImage } from '../../shared/project-links'
export const compactCount=(n:number)=>new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:2}).format(n)
export function updatedDate(value:string){return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',year:'numeric'}).format(new Date(value))}
export function ProjectIcon({project}:{project:CatalogProject}){
  const [failed,setFailed]=useState<string|null>(null),url=projectImage(project.iconUrl)
  return <div className="project-icon">{url&&failed!==url?<img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(url)}/>:<Box size={36} strokeWidth={1.5}/>}</div>
}
export function ProjectStats({project,updated=false}:{project:CatalogProject;updated?:boolean}){
  return <div className="project-stats">{project.downloads!==undefined&&<span title={`${project.downloads.toLocaleString()} downloads`}><Download size={16}/>{compactCount(project.downloads)}<span className="sr-only"> downloads</span></span>}{project.followers!==undefined&&<span title={`${project.followers.toLocaleString()} followers`}><Heart size={16}/>{compactCount(project.followers)}<span className="sr-only"> followers</span></span>}{updated&&project.updatedAt&&<time dateTime={project.updatedAt} title="Last updated"><Clock3 size={16}/>{updatedDate(project.updatedAt)}</time>}</div>
}
export function ProjectTags({project}:{project:CatalogProject}){
  const client=project.clientSide&&project.clientSide!=='unsupported',server=project.serverSide&&project.serverSide!=='unsupported'
  return <div className="project-tags">{(client||server)&&<span>{client?<Monitor size={12}/>:<Server size={12}/>} {client&&server?'Client or server':client?'Client':'Server'}</span>}{project.categories?.slice(0,5).map(tag=><span key={tag} className={['fabric','forge','neoforge','quilt'].includes(tag)?'loader-tag':''}>{tag}</span>)}{(project.categories?.length||0)>5&&<span>+{project.categories!.length-5}</span>}</div>
}
export function CatalogRow({project,onOpen,onAdd}:{project:CatalogProject;onOpen():void;onAdd():void}){
  return <article className="catalog-row"><button className="project-summary" id={`project-${project.id}`} aria-label={`View ${project.name}`} onClick={onOpen}><ProjectIcon project={project}/><div className="project-copy"><div className="project-title"><strong>{project.name}</strong>{project.author&&<span>by <span>{project.author}</span></span>}</div><p>{project.description}</p><ProjectTags project={project}/></div></button><div className="project-row-actions"><button className="catalog-add" onClick={onAdd}><Plus size={17}/>{project.kind==='modpack'?'Create a profile':'Add to profile'}</button><ProjectStats project={project} updated/></div></article>
}
