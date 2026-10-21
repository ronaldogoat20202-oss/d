// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it } from 'vitest'
import App from '../../src/renderer/App'

it('shows real empty state and working Play Settings Logs navigation', async () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: /your next world/i })).toBeVisible()
  expect(screen.getByText(/open the desktop app/i)).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: /^settings$/i }))
  expect(screen.getByRole('heading', { name: /make it yours/i })).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: /^logs$/i }))
  expect(screen.getByRole('heading', { name: /behind the scenes/i })).toBeVisible()
  expect(screen.queryByText(/Steve|1\.21/)).not.toBeInTheDocument()
})
