import { contextBridge, ipcRenderer } from 'electron'
import type { LauncherApi, Snapshot } from '../shared/contracts'

const invoke = <T>(method: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(`orbit:${method}`, ...args)
const api: LauncherApi = {
  createOfflineAccount: name => invoke('createOfflineAccount', name), selectAccount: (kind,id) => invoke('selectAccount', kind,id), removeAccount: (kind,id) => invoke('removeAccount', kind,id),
  getSnapshot: () => invoke('getSnapshot'),
  refreshVersions: () => invoke('refreshVersions'),
  saveSettings: patch => invoke('saveSettings', patch),
  createProfile: input => invoke('createProfile', input), selectProfile: id => invoke('selectProfile', id), renameProfile: (id,name) => invoke('renameProfile', id,name), removeProfile: id => invoke('removeProfile', id),
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
