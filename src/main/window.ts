import type { BrowserWindowConstructorOptions } from 'electron'

export function createWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1280, height: 820, minWidth: 900, minHeight: 650,
    backgroundColor: '#101512', title: 'Orbit Launcher', autoHideMenuBar: true,
    webPreferences: { preload: preloadPath, nodeIntegration: false, contextIsolation: true, sandbox: true }
  }
}
export function allowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      ['www.microsoft.com', 'microsoft.com'].includes(url.hostname) &&
      ['/link', '/devicelogin'].includes(url.pathname.replace(/\/$/, ''))
  } catch { return false }
}
