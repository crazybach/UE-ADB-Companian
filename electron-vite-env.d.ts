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

type SettingsFileKind = 'editor-exe' | 'editor-command-line-exe' | 'project'
type PsoDumpPickerKind = 'pipeline-cache' | 'stable-key-file'

interface SettingsFileResult {
  canceled: boolean
  path?: string
}

interface PsoDumpPathResult {
  canceled: boolean
  path?: string
}

interface PsoDumpRunResult {
  success: boolean
  logPath?: string
  csvPath?: string
  report?: import('./src/services/pso-dump').PsoDumpReport
  error?: string
}

interface PsoCsvResult {
  canceled?: boolean
  success?: boolean
  path?: string
  stableCsvPath?: string
  report?: import('./src/services/pso-dump').PsoDumpReport
  resolvedReferences?: number
  totalReferences?: number
  error?: string
}

interface RemoteCommandResult {
  success: boolean
  url?: string
  curlCommand?: string
  statusCode?: number
  response?: string
  error?: string
}

interface NiagaraAssetResult {
  canceled: boolean
  path?: string
  systemPath?: string
  error?: string
}

type CommandShortcut = import('./src/types/command-shortcut').CommandShortcut
type CommandShortcutSaveInput = import('./src/types/command-shortcut').CommandShortcutSaveInput
type CommandShortcutListResult = import('./src/types/command-shortcut').CommandShortcutListResult
type CommandShortcutSaveResult = import('./src/types/command-shortcut').CommandShortcutSaveResult

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
  openRemoteAutoTestWindow: () => Promise<void>
  openTextureMemoryWindow: () => Promise<void>
  openStaticMeshMemoryWindow: () => Promise<void>
  openSkeletalMeshMemoryWindow: () => Promise<void>
  openStaticMeshComponentMemoryWindow: () => Promise<void>
  openSettingsWindow: () => Promise<void>
  openPsoDumpWindow: () => Promise<void>
  openRemoteCommandWindow: () => Promise<void>
  openNiagaraDebuggerWindow: () => Promise<void>
  openCommandPalette2Window: () => Promise<void>
  launchCotfServer: (config: CotfServerConfig) => Promise<CotfLaunchResult>
  pullLogs: (config: PullLogsConfig) => Promise<PullLogsResult>
  openAutoTestCsv: () => Promise<AutoTestOpenCsvResult>
  openRemoteAutoTestCsv: () => Promise<AutoTestOpenCsvResult>
  runAutoTestCommand: (command: string) => Promise<AutoTestRunResult>
  openTextureMemreport: () => Promise<TextureMemoryResult>
  captureTextureMemreport: () => Promise<TextureMemoryResult>
  openObjectMemreport: (kind: ObjectMemoryKind) => Promise<ObjectMemoryResult>
  captureObjectMemreport: (kind: ObjectMemoryKind) => Promise<ObjectMemoryResult>
  selectSettingsFile: (kind: SettingsFileKind) => Promise<SettingsFileResult>
  selectPsoDumpPath: (kind: PsoDumpPickerKind) => Promise<PsoDumpPathResult>
  runPsoDump: (config: import('./src/types/config').PsoDumpConfig) => Promise<PsoDumpRunResult>
  loadPsoDumpCsv: () => Promise<PsoCsvResult>
  translatePsoDump: (pipelineCsvPath: string) => Promise<PsoCsvResult>
  openPsoAsset: (assetPath: string) => Promise<{ success: boolean; error?: string }>
  openPsoOutput: (outputPath: string) => Promise<{ success: boolean; error?: string }>
  sendRemoteCommand: (host: string, port: string, command: string) => Promise<RemoteCommandResult>
  selectNiagaraAsset: () => Promise<NiagaraAssetResult>
  listCommandShortcuts: () => Promise<CommandShortcutListResult>
  saveCommandShortcut: (shortcut: CommandShortcutSaveInput) => Promise<CommandShortcutSaveResult>
  deleteCommandShortcut: (id: string) => Promise<{ success: boolean; error?: string }>

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
