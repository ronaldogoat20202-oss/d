import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'

export interface EncryptionPort {
  isEncryptionAvailable(): boolean
  getSelectedStorageBackend?(): string
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}
export class CredentialStore {
  private queue: Promise<unknown> = Promise.resolve()
  private path: string
  constructor(private directory: string, private encryption: EncryptionPort) { this.path = join(directory, 'account-cache.bin') }
  private available(): boolean { return this.encryption.isEncryptionAvailable() && this.encryption.getSelectedStorageBackend?.() !== 'basic_text' }
  async load(): Promise<string | null> {
    await this.queue
    if (!this.available()) return null
    try { return this.encryption.decryptString(await readFile(this.path)) } catch { return null }
  }
  save(value: string): Promise<boolean> {
    const operation = this.queue.then(async () => {
      if (!this.available()) return false
      let temporary = ''
      try {
        const encrypted = this.encryption.encryptString(value)
        await mkdir(this.directory, { recursive: true })
        temporary = this.path + '.' + randomUUID() + '.tmp'
        await writeFile(temporary, encrypted, { mode: 0o600 }); await rename(temporary, this.path)
        return true
      } catch { if (temporary) await rm(temporary, { force: true }).catch(() => undefined); return false }
    })
    this.queue = operation.catch(() => undefined)
    return operation
  }
  clear(): Promise<void> {
    const operation = this.queue.then(() => rm(this.path, { force: true }))
    this.queue = operation.catch(() => undefined)
    return operation
  }
}
