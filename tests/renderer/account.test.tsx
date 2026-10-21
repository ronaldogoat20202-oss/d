// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { AccountPanel } from '../../src/renderer/components/AccountPanel'
it('explains missing configuration and shows expiring browser instructions', async () => {
  const openSettings = vi.fn()
  const props = { onSignIn: vi.fn(), onSignOut: vi.fn(), onCancel: vi.fn(), onSettings: openSettings }
  const { rerender } = render(<AccountPanel account={{ status: 'signedOut' }} hasClientId={false} {...props}/>)
  await userEvent.click(screen.getByRole('button', { name: /configure sign-in/i }))
  expect(openSettings).toHaveBeenCalled()
  rerender(<AccountPanel account={{ status: 'signingIn', device: { userCode: 'TEST-CODE', verificationUri: 'https://microsoft.com/devicelogin', expiresAt: Date.now() - 1 } }} hasClientId {...props}/>)
  expect(screen.getByText('TEST-CODE')).toBeVisible()
  expect(screen.getByText(/expired/i)).toBeVisible()
})
