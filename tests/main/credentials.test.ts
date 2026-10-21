import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CredentialStore } from '../../src/main/services/credentials'
let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'orbit-credentials-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })
const secure = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from('cipher:' + Buffer.from(s).toString('base64')), decryptString: (b: Buffer) => Buffer.from(b.toString().slice(7), 'base64').toString() }
it('writes only encrypted cache and removes it on sign-out', async () => {
  const store = new CredentialStore(dir, secure)
  expect(await store.save('sensitive-cache')).toBe(true)
  expect((await readFile(join(dir, 'account-cache.bin'))).toString()).not.toContain('sensitive-cache')
  expect(await store.load()).toBe('sensitive-cache')
  await store.clear()
  expect(await store.load()).toBeNull()
})
it('never writes plaintext with basic_text or unavailable encryption', async () => {
  for (const port of [{ ...secure, getSelectedStorageBackend: () => 'basic_text' }, { ...secure, isEncryptionAvailable: () => false }]) {
    const store = new CredentialStore(dir, port)
    expect(await store.save('sensitive-cache')).toBe(false)
    await expect(readFile(join(dir, 'account-cache.bin'))).rejects.toThrow()
  }
})
it('clears a write that was already in flight', async () => {
  const store = new CredentialStore(dir, secure)
  await Promise.all([store.save('secret'), store.clear()])
  expect(await store.load()).toBeNull()
})
it('treats an undecryptable cache as signed out', async () => {
  await new CredentialStore(dir, secure).save('data')
  expect(await new CredentialStore(dir, { ...secure, decryptString: () => { throw new Error('decrypt') } }).load()).toBeNull()
})
