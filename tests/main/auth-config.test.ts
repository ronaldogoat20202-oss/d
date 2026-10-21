import { expect, it } from 'vitest'
import { resolveClientId } from '../../src/main/services/auth-config'
const id = '00000000-0000-4000-8000-000000000001'
it('prioritizes the configured publisher ID, accepts only valid legacy fallback and permits no ID', () => {
  expect(resolveClientId(id, 'bad')).toBe(id)
  expect(resolveClientId('', id)).toBe(id)
  expect(resolveClientId('', 'bad')).toBeNull()
  expect(resolveClientId('', '')).toBeNull()
  expect(() => resolveClientId('bad', id)).toThrow(/client ID|application/i)
})
