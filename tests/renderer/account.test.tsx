// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { AccountPanel } from '../../src/renderer/components/AccountPanel'
it('offers local accounts without publisher configuration', async () => {
  const create = vi.fn()
  render(<AccountPanel account={{ status: 'signedOut' }} accounts={[]} microsoftConfigured={false} onSignIn={vi.fn()} onSignOut={vi.fn()} onCancel={vi.fn()} onCreate={create} onSelect={vi.fn()} onRemove={vi.fn()}/>)
  expect(screen.getByRole('button', { name: /sign in with microsoft/i })).toBeDisabled()
  expect(screen.getByText(/publisher|registration/i)).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: /create offline profile/i }))
  await userEvent.type(screen.getByLabelText(/offline username/i), 'Local_Player')
  await userEvent.click(screen.getByRole('button', { name: /^create profile$/i }))
  expect(create).toHaveBeenCalledWith('Local_Player')
  expect(screen.getByText(/single.player/i)).toBeVisible()
})
it('shows browser waiting and cancellation', async () => {
  const cancel = vi.fn()
  render(<AccountPanel account={{ status: 'signingIn' }} accounts={[]} microsoftConfigured onSignIn={vi.fn()} onSignOut={vi.fn()} onCancel={cancel} onCreate={vi.fn()} onSelect={vi.fn()} onRemove={vi.fn()}/>)
  expect(screen.getByText('Finish signing in in your browser')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: /cancel/i }))
  expect(cancel).toHaveBeenCalled()
})
