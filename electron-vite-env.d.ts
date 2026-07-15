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

interface CotfClientConfig {
  activity: string
  project: string
  filehostip: string
  projects: string[]
  filehostips: string[]
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

interface AdvancedLaunchRow {
  id: string
  enabled: boolean
  value: string
}

interface AdvancedLaunchConfig {
  activity: string
  direct: AdvancedLaunchRow[]
  execCmds: AdvancedLaunchRow[]
  dpcvars: AdvancedLaunchRow[]
}
interface AutoTestRow {
  id: number
  command: string
  waitSeconds: number
}

interface AutoTestOpenCsvResult {
  canceled?: boolean
  path?: string
  rows?: AutoTestRow[]
  error?: string
}

interface AutoTestRunResult {
  success: boolean
  error?: string
  stdout: string
  stderr: string
}

interface TextureMemoryRow {
  id: number
  cookedDimensions: string
  cookedKB: number
  authoredBias: string
  currentDimensions: string
  currentKB: number
  format: string
  lodGroup: string
  name: string
  streaming: string
  unknownRef: string
  virtualTexture: string
  usageCount: number
  numMips: number
  uncompressed: string
}

interface TextureMemoryReport {
  rows: TextureMemoryRow[]
  summaryLines: string[]
  totals: {
    textureCount: number
    currentKB: number
    cookedKB: number
    streamingCount: number
    virtualTextureCount: number
  }
}

interface TextureMemoryResult {
  canceled?: boolean
  success?: boolean
  path?: string
  remotePath?: string
  report?: TextureMemoryReport
  error?: string
}

type ObjectMemoryKind = 'static-mesh' | 'skeletal-mesh' | 'static-mesh-component'

interface ObjectMemoryRow {
  id: number
  className: string
  objectPath: string
  numKB: number
  maxKB: number
  resExcKB: number
  resExcDedSysKB: number
  resExcDedVidKB: number
  resExcUnkKB: number
}

interface ObjectMemoryReport {
  kind: ObjectMemoryKind
  rows: ObjectMemoryRow[]
  summaryLines: string[]
  totals: {
    objectCount: number
    numKB: number
    maxKB: number
    resExcKB: number
    resExcDedSysKB: number
    resExcDedVidKB: number
    resExcUnkKB: number
  }
}

interface ObjectMemoryResult {
  canceled?: boolean
  success?: boolean
  path?: string
  remotePath?: string
  report?: ObjectMemoryReport
  error?: string
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
  openCotfClientWindow: () => Promise<void>
  openPullLogsWindow: () => Promise<void>
  openAutoTestWindow: () => Promise<void>
  openTextureMemoryWindow: () => Promise<void>
  openStaticMeshMemoryWindow: () => Promise<void>
  openSkeletalMeshMemoryWindow: () => Promise<void>
  openStaticMeshComponentMemoryWindow: () => Promise<void>
  launchCotfServer: (config: CotfServerConfig) => Promise<CotfLaunchResult>
  pullLogs: (config: PullLogsConfig) => Promise<PullLogsResult>
  openAutoTestCsv: () => Promise<AutoTestOpenCsvResult>
  runAutoTestCommand: (command: string) => Promise<AutoTestRunResult>
  openTextureMemreport: () => Promise<TextureMemoryResult>
  captureTextureMemreport: () => Promise<TextureMemoryResult>
  openObjectMemreport: (kind: ObjectMemoryKind) => Promise<ObjectMemoryResult>
  captureObjectMemreport: (kind: ObjectMemoryKind) => Promise<ObjectMemoryResult>

  onLogcatBatch: (callback: (lines: string[]) => void) => () => void
  onLogcatStatus: (callback: (status: 'started' | 'stopped' | 'error', message?: string) => void) => () => void
  onLogcatError: (callback: (message: string) => void) => () => void

  startLogcat: () => Promise<void>
  stopLogcat: () => Promise<void>
  clearLogcat: () => Promise<AdbResult>
}

interface Window {
  electronAPI: ElectronAPI
}
