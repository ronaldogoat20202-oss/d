import { expect, it,vi } from 'vitest'
import { assertTrustedSender, PUBLIC_METHODS,registerIpc } from '../../src/main/ipc'

it('rejects unexpected IPC frames and origins', () => {
  const frame = { url: 'file:///app/index.html' }
  const win = { webContents: { mainFrame: frame } }
  expect(() => assertTrustedSender({ senderFrame: frame }, win, frame.url)).not.toThrow()
  expect(() => assertTrustedSender({ senderFrame: { ...frame } }, win, frame.url)).toThrow()
  expect(() => assertTrustedSender({ senderFrame: frame }, win, 'https://evil.test')).toThrow()
  expect(() => assertTrustedSender({ senderFrame: null }, win, frame.url)).toThrow()
})
it('exposes no generic invoke channel', () => {
  expect(PUBLIC_METHODS).toContain('getSnapshot')
  expect(PUBLIC_METHODS).not.toContain('invoke')
  expect(PUBLIC_METHODS).not.toContain('execute')
})
it('validates argument counts and the trusted frame for Library channels',async()=>{
  const handlers=new Map<string,(...args:any[])=>Promise<unknown>>(),frame={url:'file:///app/index.html'},getLibrary=vi.fn(async()=>({profileId:'one'}))
  const ipc={handle:(name:string,handler:(...args:any[])=>Promise<unknown>)=>handlers.set(name,handler),removeHandler:()=>{}}
  registerIpc(ipc as never,{webContents:{mainFrame:frame}},frame.url,{getLibrary} as never)
  await expect(handlers.get('orbit:getLibrary')!({senderFrame:frame},'/arbitrary/path')).rejects.toThrow(/argument/i)
  await expect(handlers.get('orbit:getLibrary')!({senderFrame:{...frame}})).rejects.toThrow(/untrusted/i)
  expect(getLibrary).not.toHaveBeenCalled()
  await expect(handlers.get('orbit:getLibrary')!({senderFrame:frame})).resolves.toEqual({profileId:'one'})
})
