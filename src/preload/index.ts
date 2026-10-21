import { contextBridge, ipcRenderer } from 'electron'
import type { LauncherApi, Snapshot } from '../shared/contracts'

const invoke = <T>(method: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(`orbit:${method}`, ...args)
const api: LauncherApi = {
  getSnapshot: () => invoke('getSnapshot'),
  refreshVersions: () => invoke('refreshVersions'),
  saveSettings: patch => invoke('saveSettings', patch),
  selectVersion: id => invoke('selectVersion', id),
  signIn: () => invoke('signIn'), cancelSignIn: () => invoke('cancelSignIn'), signOut: () => invoke('signOut'),
  chooseJava: () => invoke('chooseJava'), chooseGameDirectory: () => invoke('chooseGameDirectory'),
  install: () => invoke('install'), launch: () => invoke('launch'), copyLogs: () => invoke('copyLogs'),
  subscribe(listener) {
    const handler = (_event: unknown, snapshot: Snapshot) => listener(snapshot)
    ipcRenderer.on('orbit:state', handler)
    return () => { ipcRenderer.removeListener('orbit:state', handler) }
  }
}
contextBridge.exposeInMainWorld('orbit', api)
