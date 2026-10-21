// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { SettingsView } from '../../src/renderer/components/SettingsView'

it('shows saved values and reports validation errors accessibly', async () => {
  const api = { saveSettings: vi.fn(async () => { throw new Error('Memory must be at least 1024 MiB.') }), chooseJava: vi.fn(), chooseGameDirectory: vi.fn() }
  render(<SettingsView settings={{ clientId: '', javaPath: '', gameDirectory: 'C:\\Orbit', maxMemoryMiB: 2048 }} api={api} />)
  expect(screen.getByLabelText(/memory allocation/i)).toHaveValue(2048)
  await userEvent.clear(screen.getByLabelText(/memory allocation/i))
  await userEvent.type(screen.getByLabelText(/memory allocation/i), '900')
  await userEvent.click(screen.getByRole('button', { name: /save preferences/i }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/1024/)
})
