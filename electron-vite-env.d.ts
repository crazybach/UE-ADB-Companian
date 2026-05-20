/// <reference types="vite/client" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string }
  export default classes
}

interface ConnectionStatusPayload {
  status: 'disconnected' | 'connecting' | 'connected'
  device: string | null
}

interface CotfServerConfig {
  ueCmdBinary: string
  projectPath: string
  abslogDir: string
  fixedArgs: string
}

interface CotfLaunchResult {
  success: boolean
  error?: string
  data?: {
    abslogPath: string
    command: string
    launcherPath: string
  }
}

interface PullLogsConfig {
  androidSavedPath: string
  destinationDir: string
}

interface PullLogsResult {
  success: boolean
  error?: string
  data?: {
    destinationPath: string
    command: string
    stdout: string
    stderr: string
    explorerError?: string
  }
}

interface ElectronAPI {
  sendCommand: (cmd: string) => Promise<AdbResult>
  listPackages: () => Promise<AdbResult<{ packages: string[] }>>
  listActivities: (pkg: string) => Promise<AdbResult<{ activities: string[] }>>
  launchActivity: (activity: string, params: string) => Promise<AdbResult>
  captureScreenshot: () => Promise<AdbResult<{ filename: string; localPath: string }>>
  listScreenshots: () => Promise<AdbResult<{ files: ScreenshotFile[] }>>
  getScreenshotDataUrl: (screenshotPath: string) => Promise<AdbResult<{ dataUrl: string }>>
  getScreenshotPath: () => Promise<string>
  getDataPath: () => Promise<string>

  connect: () => Promise<{ success: boolean; status: string; device?: string }>
  getConnectionStatus: () => Promise<{ status: string; device: string | null }>
  onConnectionStatus: (callback: (payload: ConnectionStatusPayload) => void) => () => void

  configLoad: () => Promise<AppConfig>
  configSave: (config: Partial<AppConfig>) => Promise<void>

  openCaptureWindow: () => Promise<void>
  openPaletteWindow: () => Promise<void>
  openPreviewWindow: () => Promise<void>
  openCotfServerWindow: () => Promise<void>
  openPullLogsWindow: () => Promise<void>
  launchCotfServer: (config: CotfServerConfig) => Promise<CotfLaunchResult>
  pullLogs: (config: PullLogsConfig) => Promise<PullLogsResult>

  onLogcatBatch: (callback: (lines: string[]) => void) => () => void
  onLogcatStatus: (callback: (status: 'started' | 'stopped' | 'error', message?: string) => void) => () => void
  onLogcatError: (callback: (message: string) => void) => () => void

  startLogcat: () => Promise<void>
  stopLogcat: () => Promise<void>
}

interface Window {
  electronAPI: ElectronAPI
}
