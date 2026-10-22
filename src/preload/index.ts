import { contextBridge, ipcRenderer } from 'electron'
import type { LauncherApi, Snapshot } from '../shared/contracts'

const invoke = <T>(method: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(`orbit:${method}`, ...args)
const api: LauncherApi = {
  getServers:()=>invoke('getServers'),saveServer:input=>invoke('saveServer',input),removeServer:id=>invoke('removeServer',id),joinServer:id=>invoke('joinServer',id),
  modpackVersions:id=>invoke('modpackVersions',id),previewModpack:id=>invoke('previewModpack',id),installModpack:id=>invoke('installModpack',id),
  addonDetails:(id,kind)=>invoke('addonDetails',id,kind),openProjectLink:url=>invoke('openProjectLink',url),
  getLibrary:()=>invoke('getLibrary'),searchAddons:query=>invoke('searchAddons',query),addonVersions:(id,kind)=>invoke('addonVersions',id,kind),previewAddon:request=>invoke('previewAddon',request),installAddon:id=>invoke('installAddon',id),previewImport:(kind,world)=>invoke('previewImport',kind,world),installImport:(id,allow)=>invoke('installImport',id,allow),setAddonEnabled:(id,enabled)=>invoke('setAddonEnabled',id,enabled),removeAddon:id=>invoke('removeAddon',id),updateAddon:id=>invoke('updateAddon',id),repairAddons:()=>invoke('repairAddons'),
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
