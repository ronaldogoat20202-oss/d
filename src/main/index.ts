import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { totalmem } from 'node:os'
import { createWindowOptions } from './window'
import { registerIpc } from './ipc'
import type { LauncherApi, Snapshot } from '../shared/contracts'
import { SettingsStore, pickSetting } from './services/settings'

async function openWindow(): Promise<void> {
  const window = new BrowserWindow(createWindowOptions(join(__dirname, '../preload/index.cjs')))
  const renderer = process.env.ELECTRON_RENDERER_URL || pathToFileURL(join(__dirname, '../renderer/index.html')).href
  const settings = new SettingsStore(app.getPath('userData'), { platform: process.platform, architecture: process.arch, totalMemoryBytes: totalmem() })
  const snapshot: Snapshot = {
    settings: await settings.read(),
    account: { status: 'signedOut' }, releases: [], selectedVersionId: null, installedVersionIds: [],
    operation: { phase: 'idle' }, logs: [], error: null, offline: false
  }
  const unavailable = async (): Promise<never> => { throw new Error('The launcher is still initializing.') }
  const api: Omit<LauncherApi, 'subscribe'> = {
    getSnapshot: async () => snapshot,
    saveSettings: async patch => { snapshot.settings = await settings.update(patch); window.webContents.send('orbit:state', snapshot); return snapshot },
    selectVersion: unavailable, signIn: unavailable, cancelSignIn: unavailable,
    signOut: unavailable,
    chooseJava: async () => { snapshot.settings = await pickSetting(settings, () => dialog.showOpenDialog(window, { properties: ['openFile'], title: 'Choose Java executable' }), 'javaPath'); window.webContents.send('orbit:state', snapshot); return snapshot },
    chooseGameDirectory: async () => { snapshot.settings = await pickSetting(settings, () => dialog.showOpenDialog(window, { properties: ['openDirectory', 'createDirectory'], title: 'Choose Minecraft game folder' }), 'gameDirectory'); window.webContents.send('orbit:state', snapshot); return snapshot },
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
