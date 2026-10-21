import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'
export default defineConfig({
  testDir: './tests/e2e', testMatch: '**/*.spec.ts', fullyParallel: false,
  timeout: 30000, reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173', viewport: { width: 1280, height: 920 },
    launchOptions: { executablePath: process.env.ORBIT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) }
  },
  webServer: { command: 'npm exec vite -- --config tests/e2e/vite.config.ts', url: 'http://127.0.0.1:4173', reuseExistingServer: false }
})
