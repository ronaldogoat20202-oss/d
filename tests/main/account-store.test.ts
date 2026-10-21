import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AccountStore, offlineUuid } from '../../src/main/services/account-store'
let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'orbit-accounts-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })
it('uses the Java offline identity', () => {
  expect(offlineUuid('Notch')).toBe('b50ad385829d3141a2167e7d7539ba7f')
})
it.each(['ab', 'a'.repeat(17), 'has space', 'éclair', '../name', 'name!', null as never, 123 as never])('rejects invalid local name %s', async name => {
  await expect(new AccountStore(dir).createOffline(name)).rejects.toThrow(/username/i)
})
it('persists spelling, UUID and selection, rejects duplicates and returns independent copies', async () => {
  const store = new AccountStore(dir)
  const account = await store.createOffline('Notch')
  expect(account).toMatchObject({ kind: 'offline', name: 'Notch' })
  await expect(store.createOffline('notch')).rejects.toThrow(/already|exists/i)
  const restored = new AccountStore(dir)
  expect((await restored.read()).selected).toEqual(account)
  const copy = await restored.read(); copy.accounts[0].name = 'Mutated'
  expect((await restored.read()).accounts[0].name).toBe('Notch')
  await restored.remove('offline', account.id)
  expect((await new AccountStore(dir).read()).selected).toBeNull()
})
it('accepts boundary names and serializes concurrent updates', async () => {
  const store = new AccountStore(dir)
  await Promise.all([store.createOffline('abc'), store.createOffline('a'.repeat(16))])
  expect((await new AccountStore(dir).read()).accounts).toHaveLength(2)
})
it('remembers one Microsoft summary without tokens and selects accounts explicitly', async () => {
  const store = new AccountStore(dir)
  const local = await store.createOffline('Local')
  await store.rememberMicrosoft({ kind: 'microsoft', id: 'a'.repeat(32), name: 'Online' })
  await store.select('offline', local.id)
  expect((await store.read()).accounts).toHaveLength(2)
  await store.rememberMicrosoft({ kind: 'microsoft', id: 'b'.repeat(32), name: 'Other' })
  expect((await store.read()).accounts).toHaveLength(2)
  await store.clearSelection()
  expect((await store.read()).selected).toBeNull()
  await expect(store.select('offline', '../unknown')).rejects.toThrow(/account/i)
  expect(await readFile(join(dir, 'accounts.json'), 'utf8')).not.toMatch(/accessToken|refreshToken/)
})
it('preserves corrupted storage and unrelated files while recovering empty state', async () => {
  await writeFile(join(dir, 'accounts.json'), '{broken')
  await writeFile(join(dir, 'keep.txt'), 'preserve')
  expect((await new AccountStore(dir).read()).accounts).toEqual([])
  const backup = (await readdir(dir)).find(name => name.startsWith('accounts.corrupt-'))!
  expect(await readFile(join(dir, backup), 'utf8')).toBe('{broken')
  expect(await readFile(join(dir, 'keep.txt'), 'utf8')).toBe('preserve')
})
