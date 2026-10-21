import { test, expect, type Page } from '@playwright/test'

async function injectBridge(page: Page, offline = false) {
  await page.addInitScript(({ offline }) => {
    let state = {
      settings: { clientId: '', javaPath: '', gameDirectory: 'C:\\Orbit\\Minecraft', maxMemoryMiB: 2048 },
      account: { status: 'signedOut' } as Record<string, unknown>,
      releases: offline ? [] : [{ id: 'fixture-release', url: 'https://piston-meta.mojang.com/fixture.json', sha1: 'a'.repeat(40), releasedAt: '2026-01-01' }],
      selectedVersionId: offline ? null : 'fixture-release', installedVersionIds: [] as string[],
      operation: { phase: 'idle' } as Record<string, unknown>, logs: [] as { time: number; level: string; message: string }[], error: null, offline
    }
    const listeners = new Set<(s: unknown) => void>()
    const emit = () => { const copy = structuredClone(state); for (const listener of listeners) listener(copy) }
    ;(window as unknown as { orbit: unknown }).orbit = {
      getSnapshot: async () => structuredClone(state),
      subscribe: (fn: (s: unknown) => void) => { listeners.add(fn); return () => listeners.delete(fn) },
      saveSettings: async (patch: typeof state.settings) => { state.settings = { ...state.settings, ...patch }; emit(); return structuredClone(state) },
      selectVersion: async (id: string) => { state.selectedVersionId = id; emit(); return structuredClone(state) },
      chooseJava: async () => structuredClone(state), chooseGameDirectory: async () => structuredClone(state),
      refreshVersions: async () => { emit() },
      signIn: async () => { state.account = { status: 'signedIn', persistent: false, profile: { id: 'a'.repeat(32), name: 'RendererTest' } }; emit() },
      cancelSignIn: async () => { state.account = { status: 'signedOut' }; emit() },
      signOut: async () => { state.account = { status: 'signedOut' }; emit() },
      install: async () => {
        state.operation = { phase: 'installing', versionId: 'fixture-release', progress: { completedBytes: 50, totalBytes: 100, message: 'Downloading test fixture' } }; emit()
        await new Promise(resolve => setTimeout(resolve, 100))
        state.installedVersionIds = ['fixture-release']; state.operation = { phase: 'idle' }
        state.logs.push({ time: Date.now(), level: 'info', message: 'Fixture installation completed (renderer test).' }); emit()
      },
      launch: async () => { state.operation = { phase: 'running', versionId: 'fixture-release' }; emit() },
      copyLogs: async () => {}
    }
  }, { offline })
}
test('install, configure, sign in, and launch through the public interface', async ({ page }) => {
  await injectBridge(page); await page.goto('/')
  await expect(page.getByRole('heading', { name: /your next world/i })).toBeVisible()
  await page.getByRole('button', { name: /install minecraft/i }).click()
  await expect(page.getByText('Installed & verified')).toBeVisible()
  await expect(page.getByRole('button', { name: /play minecraft/i })).toBeDisabled()
  await page.getByRole('button', { name: /^settings$/i }).click()
  await page.getByLabel('Microsoft application client ID').fill('00000000-0000-4000-8000-000000000001')
  await page.getByLabel('Java executable', { exact: true }).fill('C:\\Java 21\\bin\\java.exe')
  await page.getByRole('button', { name: /save preferences/i }).click()
  await expect(page.getByText('Preferences saved', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: /^play$/i }).click()
  await page.getByRole('button', { name: /sign in with Microsoft/i }).click()
  await expect(page.getByText('RendererTest')).toBeVisible()
  await page.getByRole('button', { name: /play minecraft/i }).click()
  await expect(page.getByRole('button', { name: /Minecraft is running/i })).toBeDisabled()
  await page.getByRole('button', { name: /^logs$/i }).click()
  await expect(page.getByRole('log')).toContainText('renderer test')
})
test('offline empty state stays honest and the layout works at the minimum window size', async ({ page }) => {
  await injectBridge(page, true); await page.setViewportSize({ width: 900, height: 650 }); await page.goto('/')
  await expect(page.getByRole('combobox', { name: /minecraft version/i })).toContainText('No releases available')
  await expect(page.getByRole('button', { name: /install minecraft/i })).toBeDisabled()
  await page.screenshot({ path: 'test-results/orbit-offline-900.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
test('desktop appearance without injected account or versions', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/open the desktop app/i)).toBeVisible()
  await page.screenshot({ path: 'test-results/orbit-launcher.png', fullPage: true })
})
