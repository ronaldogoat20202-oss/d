import { randomUUID } from 'node:crypto'
import { copyFile,mkdir,readFile,rename,rm,stat,writeFile } from 'node:fs/promises'
import { isIP } from 'node:net'
import { join } from 'node:path'
import type { SavedServer,ServerAddress,ServerInput } from '../../shared/servers'
const identifier=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v)
function serverName(value:unknown):string{if(typeof value!=='string'||!value.trim()||value.trim().length>64||/[\x00-\x1f\x7f]/.test(value))throw new Error('Server name must contain 1–64 readable characters.');return value.trim()}
export function parseServerAddress(value:unknown):ServerAddress {
  if(typeof value!=='string'||value.length>300)throw new Error('Enter a valid Java server address.')
  const input=value.trim();if(!input||/[\s\x00-\x1f\x7f]/.test(input))throw new Error('Server address cannot contain spaces or control characters.')
  let host:string,portText:string|undefined
  if(input.startsWith('[')){
    const match=/^\[([^\]]+)\](?::([0-9]{1,5}))?$/.exec(input)
    if(!match||isIP(match[1])!==6)throw new Error('Enter a valid bracketed IPv6 server address.')
    host=match[1].toLowerCase();portText=match[2]
  }else{
    const match=/^([^:]+)(?::([0-9]{1,5}))?$/.exec(input)
    if(!match)throw new Error('Enter a hostname or IP address and optional port.')
    host=match[1].toLowerCase();portText=match[2]
    if(host.length>253||host.split('.').some(p=>p.length>63||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(p))||(/^[\d.]+$/.test(host)&&isIP(host)!==4)||host.startsWith('-'))throw new Error('Enter a valid server hostname or IP address.')
  }
  const port=portText===undefined?undefined:Number(portText)
  if(port!==undefined&&(!Number.isInteger(port)||port<1||port>65535))throw new Error('Server port must be between 1 and 65535.')
  const address=(isIP(host)===6?'['+host+']':host)+(port===undefined?'':':'+port)
  return {host,...(port===undefined?{}:{port}),address}
}
export class ServerStore {
  private state:SavedServer[]|null=null
  private loading:Promise<SavedServer[]>|null=null
  private queue:Promise<unknown>=Promise.resolve()
  constructor(private directory:string){}
  private async load():Promise<SavedServer[]>{
    if(this.state)return this.state
    if(this.loading)return this.loading
    this.loading=(async()=>{
      const path=join(this.directory,'servers.json');let raw:unknown
      try{if((await stat(path)).size>1024**2)throw new Error('Server list is too large.');raw=JSON.parse(await readFile(path,'utf8'))}
      catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return this.state=[];if(e instanceof SyntaxError){await copyFile(path,join(this.directory,`servers.corrupt-${randomUUID()}.json`));return this.state=[]}throw e}
      try{
        const value=raw as {schema:number;servers:SavedServer[]};if(value.schema!==1||!Array.isArray(value.servers)||value.servers.length>200)throw new Error('Invalid server list.')
        const ids=new Set<string>(),addresses=new Set<string>()
        for(const s of value.servers){if(!s||!identifier(s.id)||ids.has(s.id)||serverName(s.name)!==s.name||parseServerAddress(s.address).address!==s.address||addresses.has(s.address))throw new Error('Invalid saved server.');ids.add(s.id);addresses.add(s.address)}
        return this.state=value.servers
      }catch{await copyFile(path,join(this.directory,`servers.corrupt-${randomUUID()}.json`));return this.state=[]}
    })()
    try{return await this.loading}finally{this.loading=null}
  }
  async list():Promise<SavedServer[]>{await this.queue;return structuredClone(await this.load())}
  private mutate<T>(action:(next:SavedServer[])=>T):Promise<T>{
    const task=this.queue.then(async()=>{
      const next=structuredClone(await this.load()),result=action(next)
      await mkdir(this.directory,{recursive:true});const temp=join(this.directory,`servers.${randomUUID()}.tmp`)
      try{await writeFile(temp,JSON.stringify({schema:1,servers:next},null,2),{mode:0o600});await rename(temp,join(this.directory,'servers.json'))}finally{await rm(temp,{force:true})}
      this.state=next;return structuredClone(result)
    });this.queue=task.catch(()=>{});return task
  }
  save(input:ServerInput):Promise<SavedServer>{return this.mutate(next=>{
    if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['id','name','address'].includes(k))||input.id!==undefined&&!identifier(input.id))throw new Error('Invalid server request.')
    const name=serverName(input.name),address=parseServerAddress(input.address).address
    if(next.some(s=>s.address===address&&s.id!==input.id))throw new Error('This server address is already saved.')
    const existing=input.id?next.find(s=>s.id===input.id):undefined
    if(input.id&&!existing)throw new Error('Choose a saved server to edit.')
    if(existing){existing.name=name;existing.address=address;return existing}
    if(next.length>=200)throw new Error('You can save up to 200 servers.')
    const value={id:randomUUID(),name,address};next.push(value);return value
  })}
  remove(id:string):Promise<void>{return this.mutate(next=>{if(!identifier(id))throw new Error('Invalid saved server.');const at=next.findIndex(s=>s.id===id);if(at<0)throw new Error('Choose a saved server.');next.splice(at,1)})}
}
