import { contextBridge, ipcRenderer } from 'electron'

interface ConnectionStatusPayload {
  status: 'disconnected' | 'connecting' | 'connected'
  device: string | null
}

const electronAPI = {
  // ADB commands
  sendCommand: (cmd: string) => ipcRenderer.invoke('adb:send-command', cmd),
  listPackages: () => ipcRenderer.invoke('adb:list-packages'),
  listActivities: (pkg: string) => ipcRenderer.invoke('adb:list-activities', pkg),
  launchActivity: (activity: string, params: string) =>
    ipcRenderer.invoke('adb:launch-activity', activity, params),
  captureScreenshot: () => ipcRenderer.invoke('adb:capture-screenshot'),
  listScreenshots: () => ipcRenderer.invoke('adb:list-screenshots'),
  getScreenshotPath: () => ipcRenderer.invoke('adb:get-screenshot-path'),
  getDataPath: () => ipcRenderer.invoke('adb:get-data-path'),

  // Connection
  connect: () => ipcRenderer.invoke('adb:connect'),
  getConnectionStatus: () => ipcRenderer.invoke('adb:get-status'),

  onConnectionStatus: (callback: (payload: ConnectionStatusPayload) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: ConnectionStatusPayload) =>
      callback(payload)
    ipcRenderer.on('adb:connection-status', handler)
    return () => ipcRenderer.removeListener('adb:connection-status', handler)
  },

  // Config
  configLoad: () => ipcRenderer.invoke('config:load'),
  configSave: (config: Record<string, unknown>) => ipcRenderer.invoke('config:save', config),

  // Windows
  openCaptureWindow: () => ipcRenderer.invoke('window:open-capture'),
  openPaletteWindow: () => ipcRenderer.invoke('window:open-palette'),
  openPreviewWindow: () => ipcRenderer.invoke('window:open-preview'),

  // Logcat events (main → renderer)
  onLogcatBatch: (callback: (lines: string[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, lines: string[]) => callback(lines)
    ipcRenderer.on('logcat:batch', handler)
    return () => ipcRenderer.removeListener('logcat:batch', handler)
  },

  onLogcatStatus: (callback: (status: 'started' | 'stopped' | 'error', message?: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { status: string; code?: string }) => {
      const status = payload.status as 'started' | 'stopped' | 'error'
      callback(status, payload.code)
    }
    ipcRenderer.on('logcat:status', handler)
    return () => ipcRenderer.removeListener('logcat:status', handler)
  },

  onLogcatError: (callback: (message: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, message: string) => callback(message)
    ipcRenderer.on('logcat:error', handler)
    return () => ipcRenderer.removeListener('logcat:error', handler)
  },

  startLogcat: () => ipcRenderer.invoke('adb:start-logcat'),
  stopLogcat: () => ipcRenderer.invoke('adb:stop-logcat'),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
