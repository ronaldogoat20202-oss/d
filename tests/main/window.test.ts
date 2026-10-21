import { describe, expect, it } from 'vitest'
import { createWindowOptions, allowedExternalUrl } from '../../src/main/window'

describe('secure desktop window', () => {
  it('opens an isolated sandboxed renderer', () => {
    expect(createWindowOptions('/app/preload.cjs').webPreferences).toMatchObject({
      nodeIntegration: false, contextIsolation: true, sandbox: true
    })
  })
  it('only permits expected Microsoft verification URLs', () => {
    expect(allowedExternalUrl('https://www.microsoft.com/link')).toBe(true)
    expect(allowedExternalUrl('https://microsoft.com.evil.test/link')).toBe(false)
    expect(allowedExternalUrl('file:///etc/passwd')).toBe(false)
    expect(allowedExternalUrl('javascript:alert(1)')).toBe(false)
  })
})
