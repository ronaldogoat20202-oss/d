// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { PlayView } from '../../src/renderer/components/PlayView'
import type { Snapshot } from '../../src/shared/contracts'
const state: Snapshot = { settings: { clientId: '', javaPath: '', gameDirectory: '/game', maxMemoryMiB: 2048 }, accounts: [], microsoftConfigured: true, account: { status: 'signedOut' }, releases: [{ id: 'fixture', url: 'https://piston-meta.mojang.com/x', sha1: 'a'.repeat(40), releasedAt: '2026-01-01' }], selectedVersionId: 'fixture', installedVersionIds: [], operation: { phase: 'idle' }, error: null, logs: [], offline: false }
it('permits installation before sign-in and explains missing launch prerequisites', async () => {
  const install = vi.fn(async () => {})
  const props = { api: { install, refreshVersions: vi.fn() } as never, onAction: (action: () => Promise<unknown>) => { void action() }, onSettings: vi.fn() }
  const { rerender } = render(<PlayView snapshot={state} {...props}/>)
  await userEvent.click(screen.getByRole('button', { name: /install minecraft/i }))
  expect(install).toHaveBeenCalledOnce()
  rerender(<PlayView snapshot={{ ...state, installedVersionIds: ['fixture'] }} {...props}/>)
  expect(screen.getByRole('button', { name: /play minecraft/i })).toBeDisabled()
  expect(screen.getByText(/choose an account and select Java/i)).toBeVisible()
})
it('renders offline/no-cache and download states without inventing success', () => {
  const { rerender } = render(<PlayView snapshot={{ ...state, releases: [], selectedVersionId: null, offline: true }} onAction={() => {}} onSettings={() => {}}/>)
  expect(screen.getByText(/no releases available/i)).toBeVisible()
  rerender(<PlayView snapshot={{ ...state, operation: { phase: 'installing', versionId: 'fixture', progress: { completedBytes: 50, totalBytes: 100, message: 'Downloading assets' } } }} onAction={() => {}} onSettings={() => {}}/>)
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '50')
  expect(screen.getByText('Downloading assets')).toBeVisible()
})
