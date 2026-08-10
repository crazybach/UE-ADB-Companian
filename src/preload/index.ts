import { contextBridge, ipcRenderer } from 'electron'

interface ConnectionStatusPayload {
  status: 'disconnected' | 'connecting' | 'connected'
  device: string | null
  devices: AdbDeviceInfo[]
}

interface AdbDeviceInfo {
  serial: string
  state: string
}

const electronAPI = {
  // ADB commands
  sendCommand: (cmd: string, deviceSerial?: string | null) =>
    ipcRenderer.invoke('adb:send-command', cmd, deviceSerial),
  listPackages: () => ipcRenderer.invoke('adb:list-packages'),
  listActivities: (pkg: string) => ipcRenderer.invoke('adb:list-activities', pkg),
  launchActivity: (activity: string, params: string) =>
    ipcRenderer.invoke('adb:launch-activity', activity, params),
  injectAdvancedLaunch: (content: string, injectPath: string) =>
    ipcRenderer.invoke('advanced-launch:inject-command-line', content, injectPath),
  captureScreenshot: () => ipcRenderer.invoke('adb:capture-screenshot'),
  listScreenshots: () => ipcRenderer.invoke('adb:list-screenshots'),
  getScreenshotDataUrl: (screenshotPath: string) =>
    ipcRenderer.invoke('adb:get-screenshot-data-url', screenshotPath),
  getScreenshotPath: () => ipcRenderer.invoke('adb:get-screenshot-path'),
  getDataPath: () => ipcRenderer.invoke('adb:get-data-path'),

  // Connection
  connect: () => ipcRenderer.invoke('adb:connect'),
  selectDevice: (serial: string) => ipcRenderer.invoke('adb:select-device', serial),
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
  openCotfServerWindow: () => ipcRenderer.invoke('window:open-cotf-server'),
  openCotfClientWindow: () => ipcRenderer.invoke('window:open-cotf-client'),
  openPullLogsWindow: () => ipcRenderer.invoke('window:open-pull-logs'),
  openAutoTestWindow: () => ipcRenderer.invoke('window:open-auto-test'),
  openTextureMemoryWindow: () => ipcRenderer.invoke('window:open-texture-memory'),
  openStaticMeshMemoryWindow: () => ipcRenderer.invoke('window:open-static-mesh-memory'),
  openSkeletalMeshMemoryWindow: () => ipcRenderer.invoke('window:open-skeletal-mesh-memory'),
  openStaticMeshComponentMemoryWindow: () => ipcRenderer.invoke('window:open-static-mesh-component-memory'),
  openSettingsWindow: () => ipcRenderer.invoke('window:open-settings'),
  openPsoDumpWindow: () => ipcRenderer.invoke('window:open-pso-dump'),
  openRemoteCommandWindow: () => ipcRenderer.invoke('window:open-remote-command'),
  openNiagaraDebuggerWindow: () => ipcRenderer.invoke('window:open-niagara-debugger'),
  openCommandPalette2Window: () => ipcRenderer.invoke('window:open-command-palette-2'),
  launchCotfServer: (config: Record<string, unknown>) =>
    ipcRenderer.invoke('cotf:launch-server', config),
  pullLogs: (config: Record<string, unknown>) => ipcRenderer.invoke('logs:pull', config),
  openAutoTestCsv: () => ipcRenderer.invoke('autotest:open-csv'),
  runAutoTestCommand: (command: string, deviceSerial?: string | null) =>
    ipcRenderer.invoke('autotest:run-command', command, deviceSerial),
  openTextureMemreport: () => ipcRenderer.invoke('texture-memory:open-report'),
  captureTextureMemreport: () => ipcRenderer.invoke('texture-memory:capture'),
  openObjectMemreport: (kind: string) => ipcRenderer.invoke('object-memory:open-report', kind),
  captureObjectMemreport: (kind: string) => ipcRenderer.invoke('object-memory:capture', kind),
  selectSettingsFile: (kind: string) => ipcRenderer.invoke('settings:select-file', kind),
  selectPsoDumpPath: (kind: string) => ipcRenderer.invoke('pso-dump:select-path', kind),
  runPsoDump: (config: Record<string, unknown>) => ipcRenderer.invoke('pso-dump:run', config),
  loadPsoDumpCsv: () => ipcRenderer.invoke('pso-dump:load-csv'),
  translatePsoDump: (pipelineCsvPath: string) => ipcRenderer.invoke('pso-dump:translate', pipelineCsvPath),
  openPsoAsset: (assetPath: string) => ipcRenderer.invoke('pso-dump:open-asset', assetPath),
  openPsoOutput: (outputPath: string) => ipcRenderer.invoke('pso-dump:open-output', outputPath),
  sendRemoteCommand: (host: string, port: string, command: string) =>
    ipcRenderer.invoke('remote-command:send', host, port, command),
  selectNiagaraAsset: () => ipcRenderer.invoke('niagara-debugger:select-asset'),
  listCommandShortcuts: () => ipcRenderer.invoke('shortcuts:list'),
  saveCommandShortcut: (shortcut: Record<string, unknown>) => ipcRenderer.invoke('shortcuts:save', shortcut),
  deleteCommandShortcut: (id: string) => ipcRenderer.invoke('shortcuts:delete', id),

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
  clearLogcat: () => ipcRenderer.invoke('adb:clear-logcat'),
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
