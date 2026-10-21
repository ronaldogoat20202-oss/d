import { expect, it, vi } from 'vitest'
import { JavaService } from '../../src/main/services/java'

const output = (major = 21, arch = 'amd64') => `java.version = ${major}.0.5\n sun.arch.data.model = 64\n os.arch = ${arch}`
it('preserves spaces and probes Java without invoking a shell', async () => {
  const probe = vi.fn(async () => output())
  const java = new JavaService(probe)
  expect(await java.verify('C:\\Program Files\\Java\\bin\\java.exe', 21)).toMatchObject({ major: 21, architecture: 'x64' })
  expect(probe).toHaveBeenCalledWith('C:\\Program Files\\Java\\bin\\java.exe', ['-XshowSettings:properties', '-version'])
})
it.each(['x86', 'aarch64'])('rejects incompatible architecture %s', async arch => {
  await expect(new JavaService(async () => output(21, arch)).verify('/java', 21)).rejects.toThrow(/64.bit x86/i)
})
it('reports the required major version', async () => {
  await expect(new JavaService(async () => output(17)).verify('/java', 21)).rejects.toThrow(/Java 21/)
})
it('recognizes legacy Java 8 version strings', async () => {
  const java = new JavaService(async () => 'java.version = 1.8.0_412\nos.arch = amd64')
  expect((await java.verify('/java', 8)).major).toBe(8)
})
it('reports missing or unusable executables without exposing raw execution errors', async () => {
  await expect(new JavaService(async () => { throw new Error('ENOENT') }).verify('/missing', 21)).rejects.toThrow(/executable/i)
})
