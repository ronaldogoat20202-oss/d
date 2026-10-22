import { afterEach,beforeEach,expect,it } from 'vitest'
import { mkdtemp,readFile,readdir,rm,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ServerStore,parseServerAddress } from '../../src/main/services/servers'
let dir:string
beforeEach(async()=>{dir=await mkdtemp(join(tmpdir(),'orbit-servers-'))})
afterEach(async()=>{await rm(dir,{recursive:true,force:true})})
it('persists, edits and removes servers atomically with detached results',async()=>{
  const store=new ServerStore(dir)
  const [a,b]=await Promise.all([store.save({name:'Friends',address:' Example.ORG:25566 '}),store.save({name:'LAN',address:'192.168.1.20'})])
  expect(a.address).toBe('example.org:25566');a.name='Changed outside'
  expect(await new ServerStore(dir).list()).toHaveLength(2)
  const updated=await store.save({id:a.id,name:'Friends 2',address:'mc.example.org'})
  expect(updated.id).toBe(a.id);expect((await store.list()).find(s=>s.id===a.id)?.name).toBe('Friends 2')
  await store.remove(b.id);expect(await new ServerStore(dir).list()).toEqual([updated])
  await expect(store.save({name:'Duplicate',address:'mc.example.org'})).rejects.toThrow(/already|duplicate/i)
  await expect(store.save({id:'missing',name:'Missing',address:'localhost'})).rejects.toThrow(/server/i)
})
it.each(['https://example.org','--jvm-arg','example.org;rm','host/path','a@host','1.2.3.999','127.1','host:0','host:65536','host:','[::1','::1','[bad]:25565','a..b','-a.b','host name','host\n--flag'])('rejects invalid address %j',value=>{expect(()=>parseServerAddress(value)).toThrow(/address|host|port/i)})
it.each([
  ['localhost',{host:'localhost',address:'localhost'}],['play.example.org',{host:'play.example.org',address:'play.example.org'}],['127.0.0.1:25566',{host:'127.0.0.1',port:25566,address:'127.0.0.1:25566'}],['[2001:db8::1]:25565',{host:'2001:db8::1',port:25565,address:'[2001:db8::1]:25565'}]
])('normalizes %s without inventing a port',(value,expected)=>{expect(parseServerAddress(value as string)).toEqual(expected)})
it('backs up malformed state and validates names without losing a valid list',async()=>{
  await writeFile(join(dir,'servers.json'),'broken')
  const store=new ServerStore(dir);expect(await store.list()).toEqual([])
  expect((await readdir(dir)).some(n=>n.startsWith('servers.corrupt-'))).toBe(true)
  const saved=await store.save({name:'Friends',address:'localhost'})
  await expect(store.save({name:'',address:'localhost'})).rejects.toThrow(/name/i)
  expect(JSON.parse(await readFile(join(dir,'servers.json'),'utf8')).servers).toEqual([saved])
})
