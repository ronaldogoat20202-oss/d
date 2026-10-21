import type { IpcMain } from 'electron'
import type { LauncherApi } from '../shared/contracts'

export const PUBLIC_METHODS = ['getSnapshot', 'saveSettings', 'selectVersion', 'signIn', 'cancelSignIn',
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
      return (api[method] as (...args: unknown[]) => Promise<unknown>)(...args)
    })
  }
}
