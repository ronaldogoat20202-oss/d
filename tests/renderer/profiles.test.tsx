// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { ProfilePicker } from '../../src/renderer/components/ProfilePicker'
it('creates a version-pinned profile and explains retention on removal', async () => {
  const create = vi.fn()
  render(<ProfilePicker profiles={[]} selectedId={null} releases={[{id:'1.21.1',url:'https://example.invalid',sha1:'a'.repeat(40),releasedAt:'2026-01-01'}]} busy={false} onSelect={vi.fn()} onCreate={create} onRename={vi.fn()} onRemove={vi.fn()}/>)
  await userEvent.click(screen.getByRole('button', {name:/new game profile/i}))
  await userEvent.type(screen.getByLabelText('New profile name'), 'Adventure')
  await userEvent.click(screen.getByRole('button', {name:/^create game profile$/i}))
  expect(create).toHaveBeenCalledWith({name:'Adventure',minecraftVersion:'1.21.1',loader:'vanilla'})
  expect(screen.getByText(/worlds.*retained|files.*retained/i)).toBeVisible()
})
it('does not offer a pretend installed profile without metadata', () => {
  render(<ProfilePicker profiles={[]} selectedId={null} releases={[]} busy={false} onSelect={vi.fn()} onCreate={vi.fn()} onRename={vi.fn()} onRemove={vi.fn()}/>)
  expect(screen.getByRole('button', {name:/new game profile/i})).toBeDisabled()
  expect(screen.getByText(/no game profiles/i)).toBeVisible()
})
