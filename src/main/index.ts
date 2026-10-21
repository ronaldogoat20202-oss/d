import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { totalmem } from 'node:os'
import { createWindowOptions } from './window'
import { registerIpc } from './ipc'
import type { LauncherApi, Snapshot } from '../shared/contracts'

async function openWindow(): Promise<void> {
  const window = new BrowserWindow(createWindowOptions(join(__dirname, '../preload/index.cjs')))
  const renderer = process.env.ELECTRON_RENDERER_URL || pathToFileURL(join(__dirname, '../renderer/index.html')).href
  const snapshot: Snapshot = {
    settings: { clientId: '', javaPath: '', gameDirectory: join(app.getPath('userData'), 'minecraft'), maxMemoryMiB: Math.min(2048, Math.floor(totalmem() * .75 / 1048576)) },
    account: { status: 'signedOut' }, releases: [], selectedVersionId: null, installedVersionIds: [],
    operation: { phase: 'idle' }, logs: [], error: null, offline: false
  }
  const unavailable = async (): Promise<never> => { throw new Error('The launcher is still initializing.') }
  const api: Omit<LauncherApi, 'subscribe'> = {
    getSnapshot: async () => snapshot,
    saveSettings: unavailable, selectVersion: unavailable, signIn: unavailable, cancelSignIn: unavailable,
    signOut: unavailable, chooseJava: unavailable, chooseGameDirectory: unavailable,
    install: unavailable, launch: unavailable, copyLogs: unavailable
  }
  registerIpc(ipcMain, window, renderer, api)
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => { if (url !== renderer) event.preventDefault() })
  await window.loadURL(renderer)
}
app.whenReady().then(openWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) void openWindow() })
