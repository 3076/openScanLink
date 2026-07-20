import { contextBridge, ipcRenderer } from 'electron'
import { exposeElectronAPI, electronAPI } from '@electron-toolkit/preload'

// 渲染进程的自定义 API
const api = {
  openCacheFolder: () => ipcRenderer.invoke('open-cache-folder'),
  clearCache: () => ipcRenderer.invoke('clear-cache'),
  onTaskUpdate: (callback: (value: any) => void) => ipcRenderer.on('scan-task-update', (_event, value) => callback(value)),
  // 自动更新 API
  checkUpdate: () => ipcRenderer.invoke('check-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdaterMessage: (callback: (value: any) => void) => ipcRenderer.on('updater-message', (_event, value) => callback(value)),
  // 基础信息 API
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // 自启 API
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (enable: boolean) => ipcRenderer.invoke('set-autostart', enable)
}

// 仅当启用上下文隔离时，才使用 `contextBridge` API 将 Electron API 暴露给
// 渲染进程，否则只需添加到 DOM 全局变量中。
if (process.contextIsolated) {
  try {
    exposeElectronAPI()
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in d.ts)
  window.electron = electronAPI
  // @ts-ignore (define in d.ts)
  window.api = api
}
