// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { SettingsView } from '../../src/renderer/components/SettingsView'
import { useState } from 'react'
import type { Snapshot } from '../../src/shared/contracts'

it('shows saved values and reports validation errors accessibly', async () => {
  const api = { saveSettings: vi.fn(async () => { throw new Error('Memory must be at least 1024 MiB.') }), chooseJava: vi.fn(), chooseGameDirectory: vi.fn() }
  render(<SettingsView settings={{ clientId: '', javaPath: '', gameDirectory: 'C:\\Orbit', maxMemoryMiB: 2048 }} api={api} />)
  expect(screen.getByLabelText(/memory allocation/i)).toHaveValue(2048)
  await userEvent.clear(screen.getByLabelText(/memory allocation/i))
  await userEvent.type(screen.getByLabelText(/memory allocation/i), '900')
  await userEvent.click(screen.getByRole('button', { name: /save preferences/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/1024/)
})
it('preserves unsaved memory allocation when browsing persists a Java path', async () => {
  function Harness() {
    const [settings, setSettings] = useState({ clientId: '', javaPath: '', gameDirectory: 'C:\\Orbit', maxMemoryMiB: 2048 })
    const api = {
      saveSettings: async () => ({ settings }) as Snapshot,
      chooseJava: async () => { const next = { ...settings, javaPath: 'C:\\Java 21\\bin\\java.exe' }; setSettings(next); return { settings: next } as Snapshot },
      chooseGameDirectory: async () => ({ settings }) as Snapshot
    }
    return <SettingsView settings={settings} api={api}/>
  }
  render(<Harness/>)
  expect(screen.queryByLabelText('Microsoft application client ID')).not.toBeInTheDocument()
  await userEvent.clear(screen.getByLabelText(/memory allocation/i))
  await userEvent.type(screen.getByLabelText(/memory allocation/i), '4096')
  await userEvent.click(screen.getByRole('button', { name: 'Browse Java executable' }))
  expect(screen.getByLabelText('Java executable')).toHaveValue('C:\\Java 21\\bin\\java.exe')
  expect(screen.getByLabelText(/memory allocation/i)).toHaveValue(4096)
})
