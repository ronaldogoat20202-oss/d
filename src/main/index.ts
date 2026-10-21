import { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { totalmem } from 'node:os'
import { allowedExternalUrl, createWindowOptions } from './window'
import { registerIpc } from './ipc'
import { SettingsStore } from './services/settings'
import { Controller } from './controller'
import { VersionService } from './services/versions'
import { InstallService } from './services/installer'
import { JavaService } from './services/java'
import { AccountStore } from './services/account-store'
import { AccountService } from './services/accounts'
import { CredentialStore } from './services/credentials'
import { MinecraftAuthAdapter } from './adapters/minecraft-auth'
import { launchGame } from './services/game'
import { LogService } from './services/logs'

declare const __ORBIT_MICROSOFT_CLIENT_ID__: string

async function openWindow(): Promise<void> {
  const window = new BrowserWindow(createWindowOptions(join(__dirname, '../preload/index.cjs')))
  const renderer = new URL(process.env.ELECTRON_RENDERER_URL || pathToFileURL(join(__dirname, '../renderer/index.html')).href).href
  const directory = app.getPath('userData')
  const runtime = { platform: process.platform, architecture: process.arch, totalMemoryBytes: totalmem() }
  const pick = async (properties: ('openFile' | 'openDirectory' | 'createDirectory')[], title: string) => {
    const result = await dialog.showOpenDialog(window, { properties, title })
    return result.canceled ? null : result.filePaths[0] || null
  }
  const controller = new Controller({
    configuredClientId: typeof __ORBIT_MICROSOFT_CLIENT_ID__ === 'string' ? __ORBIT_MICROSOFT_CLIENT_ID__ : '',
    settings: new SettingsStore(directory, runtime), versions: new VersionService(join(directory, 'cache')),
    installer: new InstallService(), java: new JavaService(), runtime, logs: new LogService(), launch: launchGame,
    accounts: new AccountService(new MinecraftAuthAdapter(), new CredentialStore(directory, safeStorage), new AccountStore(directory)),
    pickJava: () => pick(['openFile'], 'Choose the Java executable (java.exe)'),
    pickGameDirectory: () => pick(['openDirectory', 'createDirectory'], 'Choose Minecraft game folder'),
    openVerification: async url => { if (!allowedExternalUrl(url)) throw new Error('Unexpected verification page.'); await shell.openExternal(url) },
    writeClipboard: text => clipboard.writeText(text)
  })
  await controller.initialize()
  registerIpc(ipcMain, window, renderer, controller.api())
  const unsubscribe = controller.subscribe(state => { if (!window.isDestroyed()) window.webContents.send('orbit:state', state) })
  window.once('closed', () => { unsubscribe(); controller.shutdown() })
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event, url) => { if (url !== renderer) event.preventDefault() })
  await window.loadURL(renderer)
  void controller.refreshVersions().catch(() => undefined)
  void controller.restoreAccount()
}
app.whenReady().then(openWindow).catch(() => { dialog.showErrorBox('Orbit could not start', 'Check access to the application-data folder, then restart Orbit.'); app.quit() })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) void openWindow() })
