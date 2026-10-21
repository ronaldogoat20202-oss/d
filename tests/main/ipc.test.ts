import { expect, it } from 'vitest'
import { assertTrustedSender, PUBLIC_METHODS } from '../../src/main/ipc'

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
