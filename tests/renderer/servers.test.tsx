// @vitest-environment jsdom
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { expect,it,vi } from 'vitest'
import type { LauncherApi } from '../../src/shared/contracts'
import type { SavedServer } from '../../src/shared/servers'
import { ServersView } from '../../src/renderer/components/ServersView'
it('saves, edits, joins and removes a named server',async()=>{
  let entries:SavedServer[]=[]
  const api={getServers:async()=>entries,saveServer:async(input:any)=>{const value={...input,id:input.id||'one'};entries=[value];return value},removeServer:async()=>{entries=[]},joinServer:vi.fn(async()=>{})} as unknown as LauncherApi
  render(<ServersView api={api} busy={false} canJoin profileName="Fabric world"/>)
  await screen.findByText(/no saved servers/i)
  fireEvent.click(screen.getByRole('button',{name:'Add server'}));fireEvent.change(screen.getByLabelText('Server name'),{target:{value:'Friends'}});fireEvent.change(screen.getByLabelText('Server address'),{target:{value:'mc.example.org:25566'}})
  fireEvent.click(screen.getByRole('button',{name:'Save server'}));await screen.findByText('mc.example.org:25566')
  fireEvent.click(screen.getByRole('button',{name:'Edit Friends'}));fireEvent.change(screen.getByLabelText('Server name'),{target:{value:'Friends 2'}});fireEvent.click(screen.getByRole('button',{name:'Save server'}))
  fireEvent.click(await screen.findByRole('button',{name:'Join Friends 2'}));await screen.findByText(/Minecraft started.*connect/i)
  fireEvent.click(screen.getByRole('button',{name:'Remove Friends 2'}));await screen.findByText(/no saved servers/i)
})
it('shows installation/account prerequisites and reports validation errors without closing the form',async()=>{
  const api={getServers:async()=>[{id:'one',name:'Friends',address:'localhost'}],saveServer:async()=>{throw new Error('Enter a valid server address.')}} as unknown as LauncherApi
  render(<ServersView api={api} busy={false} canJoin={false} profileName="Vanilla"/>)
  expect(await screen.findByRole('button',{name:'Join Friends'})).toBeDisabled()
  expect(screen.getByText(/install Minecraft.*account/i)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Add server'}));fireEvent.change(screen.getByLabelText('Server name'),{target:{value:'Bad'}});fireEvent.change(screen.getByLabelText('Server address'),{target:{value:'https://bad'}});fireEvent.click(screen.getByRole('button',{name:'Save server'}))
  await screen.findByRole('alert');expect(screen.getByLabelText('Server address')).toHaveValue('https://bad')
})
