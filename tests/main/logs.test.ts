import { expect, it } from 'vitest'
import { LogService } from '../../src/main/services/logs'
it('redacts credentials before truncating and bounds retained output', () => {
  const logs = new LogService()
  logs.registerSecret('real-private-session-token')
  logs.append('info', 'launch real-private-session-token Authorization: Bearer other-secret')
  expect(JSON.stringify(logs.entries())).not.toMatch(/real-private-session-token|other-secret/)
  for (let i = 0; i < 1002; i++) logs.append('info', `${i}:` + 'x'.repeat(5000))
  expect(logs.entries()).toHaveLength(1000)
  expect(logs.entries().every(line => line.message.length <= 4096)).toBe(true)
})
