import type { IpcMain } from 'electron'
import type { LauncherApi } from '../shared/contracts'

export const PUBLIC_METHODS = ['getServers','saveServer','removeServer','joinServer','modpackVersions','previewModpack','installModpack','addonDetails','openProjectLink','getLibrary','searchAddons','addonVersions','previewAddon','installAddon','previewImport','installImport','setAddonEnabled','removeAddon','updateAddon','repairAddons','createOfflineAccount', 'selectAccount', 'removeAccount', 'getSnapshot', 'refreshVersions', 'saveSettings', 'createProfile', 'selectProfile', 'renameProfile', 'removeProfile', 'signIn', 'cancelSignIn',
  'signOut', 'chooseJava', 'chooseGameDirectory', 'install', 'launch', 'copyLogs'] as const

export function assertTrustedSender(
  event: { senderFrame: { url: string } | null },
  window: { webContents: { mainFrame: unknown } }, expectedUrl: string
): void {
  if (!event.senderFrame || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== expectedUrl)
    throw new Error('Untrusted launcher request')
}

export function registerIpc(
  ipc: Pick<IpcMain, 'handle' | 'removeHandler'>,
  window: { webContents: { mainFrame: unknown } }, expectedUrl: string,
  api: Omit<LauncherApi, 'subscribe'>
): void {
  for (const method of PUBLIC_METHODS) {
    ipc.removeHandler(`orbit:${method}`)
    ipc.handle(`orbit:${method}`, async (event, ...args: unknown[]) => {
      assertTrustedSender(event, window, expectedUrl)
      const arity:Partial<Record<typeof method,[number,number]>>={saveServer:[1,1],removeServer:[1,1],joinServer:[1,1],modpackVersions:[1,1],previewModpack:[1,1],installModpack:[1,1],addonDetails:[2,2],openProjectLink:[1,1],searchAddons:[1,1],addonVersions:[2,2],previewAddon:[1,1],installAddon:[1,1],previewImport:[1,2],installImport:[2,2],setAddonEnabled:[2,2],removeAddon:[1,1],updateAddon:[1,1],createOfflineAccount:[1,1],selectAccount:[2,2],removeAccount:[2,2],saveSettings:[1,1],createProfile:[1,1],selectProfile:[1,1],renameProfile:[2,2],removeProfile:[1,1]}
      const [min,max]=arity[method]||[0,0];if(args.length<min||args.length>max)throw new Error('Invalid launcher arguments.')
      return (api[method] as (...args: unknown[]) => Promise<unknown>)(...args)
    })
  }
}
