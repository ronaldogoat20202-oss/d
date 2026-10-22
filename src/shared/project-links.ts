/** Renderer images and main-process browser links share a deliberately small policy. */
export function projectImage(value:unknown):string|null {
  if(typeof value!=='string'||value.length>4096)return null
  try {const u=new URL(value);return u.protocol==='https:'&&u.hostname==='cdn.modrinth.com'&&!u.username&&!u.password&&!u.port?u.href:null}catch{return null}
}
export function publicProjectLink(value:unknown):string|null {
  if(typeof value!=='string'||value.length>4096||/[\x00-\x20\x7f]/.test(value))return null
  try {
    const u=new URL(value),host=u.hostname.toLowerCase()
    // Browser navigation only: never fetch project link destinations in main.
    if(u.protocol!=='https:'||u.username||u.password||u.port||host.length>253||!host.includes('.')||!host.split('.').every(p=>/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(p))||/^[\d.]+$/.test(host)||['localhost','local','internal','test','invalid','example'].some(s=>host.endsWith('.'+s)))return null
    return u.href
  }catch{return null}
}
