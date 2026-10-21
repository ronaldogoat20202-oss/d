import { afterEach,beforeEach,expect,it } from 'vitest'
import { mkdtemp,mkdir,rm,symlink,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listWorlds,resolveWorld } from '../../src/main/services/worlds'
import type { GameProfile } from '../../src/shared/profiles'
let root:string,profile:GameProfile
beforeEach(async()=>{root=await mkdtemp(join(tmpdir(),'orbit-worlds-'));profile={id:'test-profile',name:'Test',minecraftVersion:'1.21.1',loader:{kind:'vanilla'},gameDirectory:join(root,'instance'),libraryRoot:root,legacy:false};await mkdir(profile.gameDirectory)})
afterEach(async()=>{await rm(root,{recursive:true,force:true})})
it('does not list a world symlink outside the profile',async()=>{
  await mkdir(join(profile.gameDirectory,'saves'));await mkdir(join(root,'outside'));await writeFile(join(root,'outside/level.dat'),'world')
  await symlink(join(root,'outside'),join(profile.gameDirectory,'saves/Escaped'),process.platform==='win32'?'junction':'dir')
  expect(await listWorlds(profile)).not.toContainEqual(expect.objectContaining({name:'Escaped'}))
})
it('lists only direct worlds with regular level.dat and resolves profile-scoped IDs afresh',async()=>{
  expect(await listWorlds(profile)).toEqual([])
  await mkdir(join(profile.gameDirectory,'saves/My World'),{recursive:true});await writeFile(join(profile.gameDirectory,'saves/My World/level.dat'),'world')
  await mkdir(join(profile.gameDirectory,'saves/Empty'))
  const worlds=await listWorlds(profile);expect(worlds.map(w=>w.name)).toEqual(['My World'])
  expect(await resolveWorld(profile,worlds[0].id)).toBe(join(profile.gameDirectory,'saves/My World'))
  await expect(resolveWorld({...profile,id:'another'},worlds[0].id)).rejects.toThrow(/world|profile/i)
  await expect(resolveWorld(profile,'../escape')).rejects.toThrow()
  await rm(join(profile.gameDirectory,'saves/My World/level.dat'))
  await expect(resolveWorld(profile,worlds[0].id)).rejects.toThrow()
})
