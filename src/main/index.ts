import { app, BrowserWindow, dialog, ipcMain, net, shell, type OpenDialogOptions } from 'electron'
import { execFile } from 'child_process'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs'
import { AdbManager } from './services/adb-manager'
import { DeviceMonitor, type DeviceInfo } from './services/device-monitor'
import { parseAutoTestCsv, type AutoTestRow } from '../services/auto-test'
import { parsePsoDumpCsv, parsePsoDumpLog, serializePsoDumpCsv, translatePipelineCsv, type PsoDumpMode, type PsoDumpReport } from '../services/pso-dump'
import { DEFAULT_GLOBAL_SETTINGS } from '../types/config'
import { parseTextureMemoryReport, type TextureMemoryReport } from '../services/texture-memory'
import {
  OBJECT_MEMORY_DEFINITIONS,
  parseObjectMemoryReport,
  type ObjectMemoryKind,
  type ObjectMemoryReport,
} from '../services/object-memory'
import type {
  CommandShortcut,
  CommandShortcutSaveInput,
  CommandShortcutStep,
} from '../types/command-shortcut'

let mainWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null
let paletteWindow: BrowserWindow | null = null
let previewWindow: BrowserWindow | null = null
let cotfServerWindow: BrowserWindow | null = null
let cotfClientWindow: BrowserWindow | null = null
let pullLogsWindow: BrowserWindow | null = null
let autoTestWindow: BrowserWindow | null = null
let textureMemoryWindow: BrowserWindow | null = null
let staticMeshMemoryWindow: BrowserWindow | null = null
let skeletalMeshMemoryWindow: BrowserWindow | null = null
let staticMeshComponentMemoryWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let psoDumpWindow: BrowserWindow | null = null
let remoteCommandWindow: BrowserWindow | null = null
let niagaraDebuggerWindow: BrowserWindow | null = null
let commandPalette2Window: BrowserWindow | null = null

let adbManager: AdbManager
let deviceMonitor: DeviceMonitor

type ConnectionState = 'disconnected' | 'connecting' | 'connected'
let connectionStatus: ConnectionState = 'disconnected'
let connectedDevice: string | null = null
let availableDevices: DeviceInfo[] = []
let preferredDevice: string | null = null

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

interface AdvancedLaunchInjectResult {
  success: boolean
  error?: string
  data?: {
    localPath: string
    remotePath: string
    command: string
    stdout: string
    stderr: string
    openError?: string
  }
}

interface AutoTestOpenCsvResult {
  canceled?: boolean
  path?: string
  rows?: AutoTestRow[]
  error?: string
}

interface TextureMemoryResult {
  canceled?: boolean
  success?: boolean
  path?: string
  remotePath?: string
  report?: TextureMemoryReport
  error?: string
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

const isDev = process.env.NODE_ENV === 'development'

function getPreloadPath(): string {
  return path.join(__dirname, '..', 'preload', 'index.js')
}

function getRendererUrl(hash: string = ''): string {
  if (isDev) {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173'
    return `${rendererUrl}/#${hash}`
  }
  return `file://${path.join(__dirname, '..', 'renderer', 'index.html')}#${hash}`
}

function getDataPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'data')
  }
  return path.join(__dirname, '..', '..', 'src', 'data')
}

function getConfigPath(): string {
  const configDir = path.join(app.getPath('home'), '.ue_console_adb')
  return path.join(configDir, 'app_config.json')
}

function readPreferredDevice(): string | null {
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf8')) as { selectedDevice?: unknown }
    return typeof config.selectedDevice === 'string' && config.selectedDevice.trim()
      ? config.selectedDevice.trim()
      : null
  } catch {
    return null
  }
}

function savePreferredDevice(serial: string): void {
  const configPath = getConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  let existing: Record<string, unknown> = {}
  try {
    existing = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
  } catch {
    // Create a new config when no readable config exists.
  }
  fs.writeFileSync(configPath, JSON.stringify({ ...existing, selectedDevice: serial }, null, 2))
}

// Legacy per-user location, kept for migration and as a fallback when the
// app folder is read-only.
function getLegacyShortcutsPath(): string {
  return path.join(path.dirname(getConfigPath()), 'shortcuts')
}

function getShortcutsPath(): string {
  // Shortcuts live under the app root (`config/shortcuts`) so the Command
  // Palette 2 button configs travel with the app folder and can be shared
  // with others by copying the folder or committing it to git.
  const appRoot = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()
  const configDir = path.join(appRoot, 'config')
  try {
    fs.mkdirSync(configDir, { recursive: true })
    fs.accessSync(configDir, fs.constants.W_OK)
    return path.join(configDir, 'shortcuts')
  } catch {
    // Read-only app folder (e.g. installed under Program Files).
    return getLegacyShortcutsPath()
  }
}

function migrateLegacyShortcuts(shortcutsDir: string): void {
  const legacyDir = getLegacyShortcutsPath()
  if (shortcutsDir === legacyDir || !fs.existsSync(legacyDir)) return
  const hasShortcuts = fs.existsSync(shortcutsDir)
    && fs.readdirSync(shortcutsDir).some((name) => name.endsWith('.json'))
  if (hasShortcuts) return
  // First run with the shared location: carry over the user's existing
  // palette buttons (and seed markers) from the legacy home folder.
  fs.mkdirSync(shortcutsDir, { recursive: true })
  for (const entry of fs.readdirSync(legacyDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const destination = path.join(shortcutsDir, entry.name)
    if (!fs.existsSync(destination)) {
      fs.copyFileSync(path.join(legacyDir, entry.name), destination)
    }
  }
}

function seedBundledCommandShortcuts(shortcutsDir: string): void {
  const markerPath = path.join(shortcutsDir, '.palette-v1-imported')
  if (fs.existsSync(markerPath)) return

  const bundledDir = path.join(getDataPath(), 'shortcuts')
  if (!fs.existsSync(bundledDir)) return

  for (const entry of fs.readdirSync(bundledDir, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue
    const destination = path.join(shortcutsDir, entry.name)
    if (!fs.existsSync(destination)) {
      fs.copyFileSync(path.join(bundledDir, entry.name), destination)
    }
  }
  fs.writeFileSync(markerPath, new Date().toISOString(), 'utf-8')
}

function migratePaletteStateSwitches(shortcutsDir: string): void {
  const markerPath = path.join(shortcutsDir, '.palette-v2-state-switches')
  if (fs.existsSync(markerPath)) return

  const bundledDir = path.join(getDataPath(), 'shortcuts')
  if (!fs.existsSync(bundledDir)) return

  for (const entry of fs.readdirSync(bundledDir, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue
    const destination = path.join(shortcutsDir, entry.name)
    if (!fs.existsSync(destination)) continue
    try {
      const existing = JSON.parse(fs.readFileSync(destination, 'utf-8')) as Record<string, unknown>
      if (typeof existing.stateSwitch !== 'boolean') existing.stateSwitch = true
      if (typeof existing.defaultState !== 'boolean') existing.defaultState = true
      fs.writeFileSync(destination, JSON.stringify(existing, null, 2), 'utf-8')
    } catch {
      // Invalid files are handled by the normal shortcut loader.
    }
  }
  fs.writeFileSync(markerPath, new Date().toISOString(), 'utf-8')
}

function seedCurrentCommandShortcuts(shortcutsDir: string): void {
  const markerPath = path.join(shortcutsDir, '.palette-v3-current-defaults')
  if (fs.existsSync(markerPath)) return

  const bundledDir = path.join(getDataPath(), 'shortcuts')
  const currentDefaults = [
    '171322f0-1b76-4024-aa31-452f4907ff2b.json',
    '88dc847d-b3f7-4ab2-b879-1311fd4be405.json',
    '8c542ba1-a565-47a0-b1e2-4798c406dfff.json',
  ]
  if (!fs.existsSync(bundledDir)) return

  for (const filename of currentDefaults) {
    const source = path.join(bundledDir, filename)
    const destination = path.join(shortcutsDir, filename)
    if (fs.existsSync(source) && !fs.existsSync(destination)) {
      fs.copyFileSync(source, destination)
    }
  }
  fs.writeFileSync(markerPath, new Date().toISOString(), 'utf-8')
}

function normalizeShortcutStep(value: unknown): CommandShortcutStep | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const command = typeof candidate.command === 'string' ? candidate.command.trim() : ''
  if (!command) return null
  const waitSeconds = typeof candidate.waitSeconds === 'number' && Number.isFinite(candidate.waitSeconds)
    ? Math.max(0, candidate.waitSeconds)
    : 0
  return { command, waitSeconds }
}

function normalizeShortcut(value: unknown, expectedId?: string): CommandShortcut | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const id = expectedId ?? (typeof candidate.id === 'string' ? candidate.id : '')
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
  const section = typeof candidate.section === 'string' ? candidate.section.trim() : ''
  const description = typeof candidate.description === 'string' ? candidate.description.trim() : ''
  const stateSwitch = candidate.stateSwitch === true
  const defaultState = stateSwitch && candidate.defaultState === true
  const rawCommands = Array.isArray(candidate.commands) ? candidate.commands : []
  const commands = rawCommands.map(normalizeShortcutStep).filter((step): step is CommandShortcutStep => Boolean(step))
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || !name || !section || !commands.length) return null
  return { id, name, section, description, stateSwitch, defaultState, commands }
}

function listCommandShortcuts(): CommandShortcut[] {
  const shortcutsDir = getShortcutsPath()
  fs.mkdirSync(shortcutsDir, { recursive: true })
  migrateLegacyShortcuts(shortcutsDir)
  seedBundledCommandShortcuts(shortcutsDir)
  migratePaletteStateSwitches(shortcutsDir)
  seedCurrentCommandShortcuts(shortcutsDir)
  const shortcuts: CommandShortcut[] = []

  for (const entry of fs.readdirSync(shortcutsDir, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue
    const id = path.basename(entry.name, '.json')
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) continue
    try {
      const shortcut = normalizeShortcut(
        JSON.parse(fs.readFileSync(path.join(shortcutsDir, entry.name), 'utf-8')),
        id,
      )
      if (shortcut) shortcuts.push(shortcut)
    } catch {
      // Ignore malformed shortcut files and continue loading the remaining files.
    }
  }

  return shortcuts.sort((left, right) => (
    left.section.localeCompare(right.section) || left.name.localeCompare(right.name)
  ))
}

function saveCommandShortcut(input: CommandShortcutSaveInput): CommandShortcut {
  const id = input.id || randomUUID()
  const shortcut = normalizeShortcut({ ...input, id })
  if (!shortcut) throw new Error('Shortcut name, section, and at least one command are required.')
  const shortcutsDir = getShortcutsPath()
  fs.mkdirSync(shortcutsDir, { recursive: true })
  fs.writeFileSync(
    path.join(shortcutsDir, `${shortcut.id}.json`),
    JSON.stringify(shortcut, null, 2),
    'utf-8',
  )
  return shortcut
}

function deleteCommandShortcut(id: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Invalid shortcut ID.')
  const shortcutPath = path.join(getShortcutsPath(), `${id}.json`)
  if (fs.existsSync(shortcutPath)) fs.unlinkSync(shortcutPath)
}

async function loadWithRetry(win: BrowserWindow, url: string, retries = 10, delay = 500): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await win.loadURL(url)
      return
    } catch {
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  // Last attempt — let it throw if it fails
  await win.loadURL(url)
}

function broadcastStatus(): void {
  const payload = {
    status: connectionStatus,
    device: connectedDevice,
    devices: availableDevices.map((device) => ({ ...device })),
  }
  mainWindow?.webContents.send('adb:connection-status', payload)
  captureWindow?.webContents.send('adb:connection-status', payload)
  paletteWindow?.webContents.send('adb:connection-status', payload)
  previewWindow?.webContents.send('adb:connection-status', payload)
  cotfServerWindow?.webContents.send('adb:connection-status', payload)
  cotfClientWindow?.webContents.send('adb:connection-status', payload)
  pullLogsWindow?.webContents.send('adb:connection-status', payload)
  autoTestWindow?.webContents.send('adb:connection-status', payload)
  textureMemoryWindow?.webContents.send('adb:connection-status', payload)
  staticMeshMemoryWindow?.webContents.send('adb:connection-status', payload)
  skeletalMeshMemoryWindow?.webContents.send('adb:connection-status', payload)
  staticMeshComponentMemoryWindow?.webContents.send('adb:connection-status', payload)
  settingsWindow?.webContents.send('adb:connection-status', payload)
  commandPalette2Window?.webContents.send('adb:connection-status', payload)
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    minWidth: 800,
    minHeight: 600,
    title: 'UE Console ADB Tool',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.setMenuBarVisibility(false)
  loadWithRetry(mainWindow, getRendererUrl())

  if (process.platform === 'win32') {
    try {
      const { setWindowDarkMode } = require('./services/win32-utils')
      setWindowDarkMode(mainWindow.getNativeWindowHandle())
    } catch {
      // Non-critical
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createToolWindow(title: string, hash: string, width: number, height: number): BrowserWindow {
  const win = new BrowserWindow({
    width,
    height,
    title,
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  win.setMenuBarVisibility(false)
  loadWithRetry(win, getRendererUrl(hash))

  win.on('closed', () => {
    if (win === captureWindow) captureWindow = null
    else if (win === paletteWindow) paletteWindow = null
    else if (win === previewWindow) previewWindow = null
    else if (win === cotfServerWindow) cotfServerWindow = null
    else if (win === cotfClientWindow) cotfClientWindow = null
    else if (win === pullLogsWindow) pullLogsWindow = null
    else if (win === autoTestWindow) autoTestWindow = null
    else if (win === textureMemoryWindow) textureMemoryWindow = null
    else if (win === staticMeshMemoryWindow) staticMeshMemoryWindow = null
    else if (win === skeletalMeshMemoryWindow) skeletalMeshMemoryWindow = null
    else if (win === staticMeshComponentMemoryWindow) staticMeshComponentMemoryWindow = null
    else if (win === settingsWindow) settingsWindow = null
    else if (win === psoDumpWindow) psoDumpWindow = null
    else if (win === remoteCommandWindow) remoteCommandWindow = null
    else if (win === niagaraDebuggerWindow) niagaraDebuggerWindow = null
    else if (win === commandPalette2Window) commandPalette2Window = null
  })

  return win
}

function formatTimestampForFilename(date = new Date()): string {
  const pad = (value: number) => value.toString().padStart(2, '0')
  return [
    date.getFullYear().toString(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '_',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('')
}

function quoteCmdArg(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function execFileWithOutput(
  file: string,
  args: string[],
  options: { maxBuffer?: number } = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        const err = error as Error & { stdout?: string; stderr?: string }
        err.stdout = stdout
        err.stderr = stderr
        reject(err)
        return
      }

      resolve({ stdout, stderr })
    })
  })
}

function selectedAdbArgs(args: string[], deviceSerial = connectedDevice): string[] {
  return deviceSerial ? ['-s', deviceSerial, ...args] : args
}

function formatSelectedAdbCommand(args: string[], deviceSerial = connectedDevice): string {
  const target = deviceSerial ? ['-s', quoteCmdArg(deviceSerial)] : []
  return ['adb', ...target, ...args.map(quoteCmdArg)].join(' ')
}

async function pullLogs(config: PullLogsConfig): Promise<PullLogsResult> {
  const androidSavedPath = config.androidSavedPath.trim()
  const destinationDir = config.destinationDir.trim() || './'

  if (!androidSavedPath) {
    return { success: false, error: 'Android Saved path is required.' }
  }

  const baseDestination = path.resolve(destinationDir)
  const destinationPath = path.join(baseDestination, `Saved_${formatTimestampForFilename()}`)
  const command = formatSelectedAdbCommand(['pull', androidSavedPath, destinationPath])

  try {
    fs.mkdirSync(destinationPath, { recursive: true })
  } catch (error) {
    return {
      success: false,
      error: `Failed to create destination folder: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  try {
    const { stdout, stderr } = await execFileWithOutput(
      'adb',
      selectedAdbArgs(['pull', androidSavedPath, destinationPath]),
      { maxBuffer: 100 * 1024 * 1024 },
    )

    const explorerError = await shell.openPath(destinationPath)

    return {
      success: true,
      data: {
        destinationPath,
        command,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        explorerError: explorerError || undefined,
      },
    }
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string }
    return {
      success: false,
      error: err.stderr?.trim() || err.stdout?.trim() || err.message,
      data: {
        destinationPath,
        command,
        stdout: err.stdout?.trim() || '',
        stderr: err.stderr?.trim() || '',
      },
    }
  }
}

async function injectAdvancedLaunchCommandLine(
  content: string,
  injectPath: string,
): Promise<AdvancedLaunchInjectResult> {
  const deviceSerial = connectedDevice
  const trimmedContent = content.trim()
  const requestedPath = injectPath.trim().replace(/\\/g, '/')

  if (!trimmedContent) {
    return { success: false, error: 'UE command line content is empty.' }
  }
  if (!requestedPath.startsWith('/') || !/^\/[A-Za-z0-9._/+\-]+$/.test(requestedPath)) {
    return { success: false, error: 'Inject path must be an absolute Android path.' }
  }

  const normalizedPath = path.posix.normalize(requestedPath)
  const remoteDir = path.posix.basename(normalizedPath).toLowerCase() === 'uecommandline.txt'
    ? path.posix.dirname(normalizedPath)
    : normalizedPath
  const remotePath = path.posix.join(remoteDir, 'UECommandLine.txt')
  const generatedDir = path.join(path.dirname(getConfigPath()), 'generated')
  const localPath = path.join(generatedDir, 'UECommandLine.txt')
  const command = formatSelectedAdbCommand(['push', localPath, remotePath], deviceSerial)

  try {
    fs.mkdirSync(generatedDir, { recursive: true })
    fs.writeFileSync(localPath, `${trimmedContent}\n`, 'utf8')
  } catch (error) {
    return {
      success: false,
      error: `Failed to write UECommandLine.txt: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  let stdout = ''
  let stderr = ''
  let pushError = ''
  try {
    await execFileWithOutput(
      'adb',
      selectedAdbArgs(['shell', 'mkdir', '-p', remoteDir], deviceSerial),
    )
    const result = await execFileWithOutput(
      'adb',
      selectedAdbArgs(['push', localPath, remotePath], deviceSerial),
      { maxBuffer: 10 * 1024 * 1024 },
    )
    stdout = result.stdout.trim()
    stderr = result.stderr.trim()
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string }
    stdout = err.stdout?.trim() || ''
    stderr = err.stderr?.trim() || ''
    pushError = stderr || stdout || err.message
  }

  const openError = await shell.openPath(localPath)
  const data = {
    localPath,
    remotePath,
    command,
    stdout,
    stderr,
    openError: openError || undefined,
  }

  if (pushError) {
    return { success: false, error: pushError, data }
  }
  return { success: true, data }
}

async function selectSettingsFile(kind: SettingsFileKind): Promise<{ canceled: boolean; path?: string }> {
  const parent = settingsWindow && !settingsWindow.isDestroyed() ? settingsWindow : mainWindow
  const isProject = kind === 'project'
  const options: OpenDialogOptions = {
    title: isProject ? 'Choose Unreal Project' : 'Choose Unreal Editor Executable',
    filters: isProject
      ? [{ name: 'Unreal Project', extensions: ['uproject'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'Executables', extensions: ['exe'] }, { name: 'All Files', extensions: ['*'] }],
    properties: ['openFile'],
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  return { canceled: false, path: result.filePaths[0] }
}

type PsoDumpPickerKind = 'pipeline-cache' | 'stable-key-file'

interface PsoDumpConfig {
  mode: PsoDumpMode
  pipelineCacheFile: string
  stableKeyFile: string
}

interface PsoDumpResult {
  success: boolean
  logPath?: string
  csvPath?: string
  report?: PsoDumpReport
  error?: string
}

function readGlobalSettings(): { editorCommandLineExe: string; projectPath: string } {
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8')) as { globalSettings?: Record<string, unknown> }
    const settings = config.globalSettings || {}
    return {
      editorCommandLineExe: typeof settings.editorCommandLineExe === 'string'
        ? settings.editorCommandLineExe.trim()
        : DEFAULT_GLOBAL_SETTINGS.editorCommandLineExe,
      projectPath: typeof settings.projectPath === 'string'
        ? settings.projectPath.trim()
        : DEFAULT_GLOBAL_SETTINGS.projectPath,
    }
  } catch {
    return {
      editorCommandLineExe: DEFAULT_GLOBAL_SETTINGS.editorCommandLineExe,
      projectPath: DEFAULT_GLOBAL_SETTINGS.projectPath,
    }
  }
}

function normalizePsoDumpConfig(value: Record<string, unknown>): PsoDumpConfig {
  return {
    mode: value.mode === 'stable-key' || value.useStableKeyFile === true ? 'stable-key' : 'pipeline-cache',
    pipelineCacheFile: typeof value.pipelineCacheFile === 'string' ? value.pipelineCacheFile.trim() : '',
    stableKeyFile: typeof value.stableKeyFile === 'string' ? value.stableKeyFile.trim() : '',
  }
}

async function selectPsoDumpPath(kind: PsoDumpPickerKind): Promise<{ canceled: boolean; path?: string }> {
  const parent = psoDumpWindow && !psoDumpWindow.isDestroyed() ? psoDumpWindow : mainWindow
  const pipelineMode = kind === 'pipeline-cache'
  const options: OpenDialogOptions = {
    title: pipelineMode ? 'Choose Pipeline Cache File' : 'Choose Stable Key File',
    filters: pipelineMode
      ? [{ name: 'Pipeline Cache', extensions: ['upipelinecache'] }, { name: 'All Files', extensions: ['*'] }]
      : [{ name: 'Stable Shader Key', extensions: ['shk'] }, { name: 'All Files', extensions: ['*'] }],
    properties: ['openFile'],
  }
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  return result.canceled || result.filePaths.length === 0 ? { canceled: true } : { canceled: false, path: result.filePaths[0] }
}

function getPsoDumpOutputPaths(config: PsoDumpConfig): { logPath: string; csvPath: string } {
  const inputPath = config.mode === 'stable-key' ? config.stableKeyFile : config.pipelineCacheFile
  const parsed = path.parse(inputPath)
  const base = path.join(parsed.dir, `${parsed.name}_pso_dump_${formatTimestampForFilename()}`)
  return { logPath: `${base}.log`, csvPath: `${base}.csv` }
}

async function runPsoDump(rawConfig: Record<string, unknown>): Promise<PsoDumpResult> {
  const config = normalizePsoDumpConfig(rawConfig)
  const globalSettings = readGlobalSettings()
  if (!globalSettings.editorCommandLineExe || !fs.existsSync(globalSettings.editorCommandLineExe)) return { success: false, error: 'Set a valid Editor CommandLine EXE in File > Settings.' }
  if (!globalSettings.projectPath || !fs.existsSync(globalSettings.projectPath)) return { success: false, error: 'Set a valid Project in File > Settings.' }

  const stableMode = config.mode === 'stable-key'
  const inputPath = stableMode ? config.stableKeyFile : config.pipelineCacheFile
  if (!inputPath || !fs.existsSync(inputPath)) return { success: false, error: stableMode ? 'Choose a valid .shk stable key file.' : 'Choose a valid .upipelinecache file.' }
  const args = [globalSettings.projectPath, '-run=ShaderPipelineCacheTools', 'dump', inputPath]
  const { logPath, csvPath } = getPsoDumpOutputPaths(config)

  try {
    const { stdout, stderr } = await execFileWithOutput(globalSettings.editorCommandLineExe, args, { maxBuffer: 500 * 1024 * 1024 })
    const combined = [stdout, stderr].filter(Boolean).join('\r\n')
    const report = parsePsoDumpLog(combined, config.mode)
    fs.writeFileSync(logPath, combined, 'utf-8')
    fs.writeFileSync(csvPath, serializePsoDumpCsv(report), 'utf-8')
    return { success: true, logPath, csvPath, report }
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string }
    const combined = [err.stdout || '', err.stderr || '', err.message].filter(Boolean).join('\r\n')
    try { fs.writeFileSync(logPath, combined, 'utf-8') } catch { /* Preserve the execution error below. */ }
    return { success: false, logPath, error: err.stderr?.trim() || err.message }
  }
}

interface PsoCsvResult {
  canceled?: boolean
  success?: boolean
  path?: string
  stableCsvPath?: string
  report?: PsoDumpReport
  resolvedReferences?: number
  totalReferences?: number
  error?: string
}

async function choosePsoCsv(title: string): Promise<{ canceled: boolean; path?: string }> {
  const parent = psoDumpWindow && !psoDumpWindow.isDestroyed() ? psoDumpWindow : mainWindow
  const options: OpenDialogOptions = {
    title,
    filters: [{ name: 'PSO Dump CSV', extensions: ['csv'] }, { name: 'All Files', extensions: ['*'] }],
    properties: ['openFile'],
  }
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
  return result.canceled || result.filePaths.length === 0 ? { canceled: true } : { canceled: false, path: result.filePaths[0] }
}

async function loadPsoCsv(): Promise<PsoCsvResult> {
  const selection = await choosePsoCsv('Load PSO Dump CSV')
  if (selection.canceled || !selection.path) return { canceled: true }
  try {
    const report = parsePsoDumpCsv(fs.readFileSync(selection.path, 'utf-8'))
    return { success: true, path: selection.path, report }
  } catch (error) {
    return { success: false, path: selection.path, error: error instanceof Error ? error.message : 'Failed to load PSO CSV.' }
  }
}

async function translatePsoCsv(pipelineCsvPath: string): Promise<PsoCsvResult> {
  if (!pipelineCsvPath || !fs.existsSync(pipelineCsvPath)) return { success: false, error: 'Load or generate a pipeline-cache CSV first.' }
  const selection = await choosePsoCsv('Choose Stable Key Dump CSV')
  if (selection.canceled || !selection.path) return { canceled: true }
  try {
    const translation = translatePipelineCsv(
      fs.readFileSync(pipelineCsvPath, 'utf-8'),
      fs.readFileSync(selection.path, 'utf-8'),
    )
    const parsed = path.parse(pipelineCsvPath)
    const outputPath = path.join(parsed.dir, `${parsed.name}_translated_${formatTimestampForFilename()}.csv`)
    fs.writeFileSync(outputPath, serializePsoDumpCsv(translation.report), 'utf-8')
    return {
      success: true,
      path: outputPath,
      stableCsvPath: selection.path,
      report: translation.report,
      resolvedReferences: translation.resolvedReferences,
      totalReferences: translation.totalReferences,
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to translate pipeline shaders.' }
  }
}
async function openPsoAsset(assetPath: string): Promise<{ success: boolean; error?: string }> {
  if (!assetPath.startsWith('/Game/')) return { success: false, error: 'Only /Game asset paths can be opened in the first iteration.' }
  const { projectPath } = readGlobalSettings()
  if (!projectPath) return { success: false, error: 'Project path is not configured.' }
  const lastSlash = assetPath.lastIndexOf('/')
  const objectSeparator = assetPath.indexOf('.', lastSlash)
  const relativeAsset = assetPath.slice('/Game/'.length, objectSeparator >= 0 ? objectSeparator : undefined)
  const contentPath = path.join(path.dirname(projectPath), 'Content', ...relativeAsset.split('/'))
  const assetFile = ['.uasset', '.umap'].map((extension) => `${contentPath}${extension}`).find((candidate) => fs.existsSync(candidate))
  if (!assetFile) return { success: false, error: `Asset file was not found for ${assetPath}.` }
  const openError = await shell.openPath(assetFile)
  return openError ? { success: false, error: openError } : { success: true }
}

interface RemoteCommandResult {
  success: boolean
  url?: string
  curlCommand?: string
  statusCode?: number
  response?: string
  error?: string
}

async function sendRemoteCommand(
  rawHost: string,
  rawPort: string,
  rawCommand: string,
): Promise<RemoteCommandResult> {
  const host = rawHost.trim().replace(/^\[|\]$/g, '')
  const port = rawPort.trim()
  const command = rawCommand.trim()

  if (!host || /[\s/?#@\\]/.test(host)) {
    return { success: false, error: 'Enter a valid device IP address or host name.' }
  }
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    return { success: false, error: 'Port must be a number from 1 to 65535.' }
  }
  if (!command) return { success: false, error: 'Enter a command.' }

  const urlHost = host.includes(':') ? `[${host}]` : host
  const url = `http://${urlHost}:${port}/exec?c=${encodeURIComponent(command)}`
  const curlCommand = `curl "${url}"`

  try {
    const response = await net.fetch(url, { signal: AbortSignal.timeout(15_000) })
    const responseBody = await response.text()
    return {
      success: response.ok,
      url,
      curlCommand,
      statusCode: response.status,
      response: responseBody,
      error: response.ok ? undefined : `HTTP ${response.status} ${response.statusText}`.trim(),
    }
  } catch (error) {
    return {
      success: false,
      url,
      curlCommand,
      error: error instanceof Error ? error.message : 'Failed to send the remote command.',
    }
  }
}

interface NiagaraAssetResult {
  canceled: boolean
  path?: string
  systemPath?: string
  error?: string
}

function readNiagaraLastAssetDirectory(): string {
  try {
    const config = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8')) as {
      niagaraDebugger?: { lastAssetDirectory?: unknown }
    }
    const directory = config.niagaraDebugger?.lastAssetDirectory
    return typeof directory === 'string' && fs.existsSync(directory) ? directory : ''
  } catch {
    return ''
  }
}

function saveNiagaraLastAssetDirectory(directory: string): void {
  const configPath = getConfigPath()
  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  let config: Record<string, unknown> = {}
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>
  } catch {
    // Create a new config when the existing file is missing or invalid.
  }
  const currentNiagara = config.niagaraDebugger && typeof config.niagaraDebugger === 'object'
    ? config.niagaraDebugger as Record<string, unknown>
    : {}
  config.niagaraDebugger = { ...currentNiagara, lastAssetDirectory: directory }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
}

async function selectNiagaraAsset(): Promise<NiagaraAssetResult> {
  const parent = niagaraDebuggerWindow && !niagaraDebuggerWindow.isDestroyed()
    ? niagaraDebuggerWindow
    : mainWindow
  const { projectPath } = readGlobalSettings()
  if (!projectPath || !fs.existsSync(projectPath)) {
    return {
      canceled: false,
      error: 'Set a valid Unreal Project path in File > Settings before choosing an asset.',
    }
  }
  const contentRoot = path.join(path.dirname(projectPath), 'Content')
  if (!fs.existsSync(contentRoot)) {
    return { canceled: false, error: `Project Content directory was not found: ${contentRoot}` }
  }
  const lastAssetDirectory = readNiagaraLastAssetDirectory()
  const lastDirectoryRelative = lastAssetDirectory ? path.relative(contentRoot, lastAssetDirectory) : ''
  const lastDirectoryInProject = lastAssetDirectory
    && !path.isAbsolute(lastDirectoryRelative)
    && lastDirectoryRelative !== '..'
    && !lastDirectoryRelative.startsWith(`..${path.sep}`)
  const options: OpenDialogOptions = {
    title: 'Choose Niagara System Asset',
    defaultPath: lastDirectoryInProject ? lastAssetDirectory : contentRoot,
    filters: [
      { name: 'Unreal Assets', extensions: ['uasset'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }

  const assetPath = result.filePaths[0]
  if (path.extname(assetPath).toLowerCase() !== '.uasset') {
    return { canceled: false, path: assetPath, error: 'Choose a .uasset file.' }
  }
  const relativePath = path.relative(contentRoot, assetPath)
  if (path.isAbsolute(relativePath) || relativePath === '..' || relativePath.startsWith(`..${path.sep}`)) {
    return {
      canceled: false,
      path: assetPath,
      error: `The selected asset must be inside ${contentRoot}.`,
    }
  }
  saveNiagaraLastAssetDirectory(path.dirname(assetPath))

  const relativeWithoutExtension = relativePath.slice(0, -path.extname(relativePath).length)
  const packagePath = relativeWithoutExtension.split(path.sep).join('/')
  const assetName = path.basename(relativeWithoutExtension)
  return {
    canceled: false,
    path: assetPath,
    systemPath: `/Game/${packagePath}.${assetName}`,
  }
}

async function openAutoTestCsv(parentWindow = autoTestWindow): Promise<AutoTestOpenCsvResult> {
  const parent = parentWindow && !parentWindow.isDestroyed() ? parentWindow : mainWindow
  const options: OpenDialogOptions = {
    title: 'Open Auto Test CSV',
    filters: [
      { name: 'CSV Files', extensions: ['csv'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  }

  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, rows: [] }
  }

  const filePath = result.filePaths[0]

  try {
    const csvText = fs.readFileSync(filePath, 'utf-8')
    return {
      canceled: false,
      path: filePath,
      rows: parseAutoTestCsv(csvText),
    }
  } catch (error) {
    return {
      canceled: false,
      path: filePath,
      rows: [],
      error: error instanceof Error ? error.message : 'Failed to read CSV file.',
    }
  }
}

function parseMemreportFile(filePath: string): TextureMemoryResult {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return {
      success: true,
      path: filePath,
      report: parseTextureMemoryReport(content),
    }
  } catch (error) {
    return {
      success: false,
      path: filePath,
      error: error instanceof Error ? error.message : 'Failed to read memreport file.',
    }
  }
}

async function openTextureMemreport(): Promise<TextureMemoryResult> {
  const parent = textureMemoryWindow && !textureMemoryWindow.isDestroyed()
    ? textureMemoryWindow
    : mainWindow
  const options: OpenDialogOptions = {
    title: 'Open Unreal Memory Report',
    filters: [
      { name: 'Unreal Memory Reports', extensions: ['memreport'] },
      { name: 'Text Files', extensions: ['txt', 'log'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  return parseMemreportFile(result.filePaths[0])
}

const MEMREPORT_REMOTE_ROOTS = [
  '/sdcard/Android/data',
  '/sdcard/UE4Game',
  '/sdcard/UnrealGame',
  '/sdcard/Download',
]

async function listRemoteMemreports(deviceSerial = connectedDevice): Promise<string[]> {
  const reports = new Set<string>()

  for (const root of MEMREPORT_REMOTE_ROOTS) {
    try {
      const { stdout } = await execFileWithOutput(
        'adb',
        selectedAdbArgs(
          ['shell', 'find', root, '-type', 'f', '-name', '*.memreport'],
          deviceSerial,
        ),
        { maxBuffer: 20 * 1024 * 1024 },
      )
      stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((file) => reports.add(file))
    } catch (error) {
      const stdout = (error as Error & { stdout?: string }).stdout || ''
      stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((file) => reports.add(file))
    }
  }

  return [...reports]
}

async function getRemoteFileSize(remotePath: string, deviceSerial = connectedDevice): Promise<number> {
  try {
    const { stdout } = await execFileWithOutput(
      'adb',
      selectedAdbArgs(['shell', 'stat', '-c', '%s', remotePath], deviceSerial),
    )
    return Number.parseInt(stdout.trim(), 10) || 0
  } catch {
    return 0
  }
}

async function captureTextureMemreport(): Promise<TextureMemoryResult> {
  const deviceSerial = connectedDevice
  const existingReports = new Set(await listRemoteMemreports(deviceSerial))
  const commandResult = await adbManager.sendCommand('memreport -full', deviceSerial)
  if (!commandResult.success) {
    return { success: false, error: commandResult.error || 'Failed to send memreport -full.' }
  }

  const observedSizes = new Map<string, number>()
  let remotePath = ''

  for (let attempt = 0; attempt < 60 && !remotePath; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const reports = await listRemoteMemreports(deviceSerial)
    const candidates = reports.filter((file) => !existingReports.has(file)).sort().reverse()

    for (const candidate of candidates) {
      const size = await getRemoteFileSize(candidate, deviceSerial)
      if (size > 0 && observedSizes.get(candidate) === size) {
        remotePath = candidate
        break
      }
      observedSizes.set(candidate, size)
    }
  }

  if (!remotePath) {
    return {
      success: false,
      error: 'Timed out waiting for a new memreport on the device. The report may be in an unsupported Android path.',
    }
  }

  const reportDir = path.join(app.getPath('userData'), 'MemReports')
  fs.mkdirSync(reportDir, { recursive: true })
  const remoteName = path.posix.basename(remotePath)
  const localPath = path.join(reportDir, `${formatTimestampForFilename()}_${remoteName}`)

  try {
    await execFileWithOutput(
      'adb',
      selectedAdbArgs(['pull', remotePath, localPath], deviceSerial),
      { maxBuffer: 100 * 1024 * 1024 },
    )
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string }
    return {
      success: false,
      remotePath,
      error: err.stderr?.trim() || err.stdout?.trim() || err.message,
    }
  }

  const parsed = parseMemreportFile(localPath)
  return { ...parsed, remotePath }
}

function isObjectMemoryKind(value: string): value is ObjectMemoryKind {
  return Object.prototype.hasOwnProperty.call(OBJECT_MEMORY_DEFINITIONS, value)
}

function getObjectMemoryWindow(kind: ObjectMemoryKind): BrowserWindow | null {
  if (kind === 'static-mesh') return staticMeshMemoryWindow
  if (kind === 'skeletal-mesh') return skeletalMeshMemoryWindow
  return staticMeshComponentMemoryWindow
}

function parseObjectMemreportFile(filePath: string, kind: ObjectMemoryKind): ObjectMemoryResult {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return {
      success: true,
      path: filePath,
      report: parseObjectMemoryReport(content, kind),
    }
  } catch (error) {
    return {
      success: false,
      path: filePath,
      error: error instanceof Error ? error.message : 'Failed to read memreport file.',
    }
  }
}

async function openObjectMemreport(kind: ObjectMemoryKind): Promise<ObjectMemoryResult> {
  const toolWindow = getObjectMemoryWindow(kind)
  const parent = toolWindow && !toolWindow.isDestroyed() ? toolWindow : mainWindow
  const options: OpenDialogOptions = {
    title: `Open ${OBJECT_MEMORY_DEFINITIONS[kind].label} Memory Report`,
    filters: [
      { name: 'Unreal Memory Reports', extensions: ['memreport'] },
      { name: 'Text Files', extensions: ['txt', 'log'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    properties: ['openFile'],
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options)

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  return parseObjectMemreportFile(result.filePaths[0], kind)
}

async function captureObjectMemreport(kind: ObjectMemoryKind): Promise<ObjectMemoryResult> {
  const deviceSerial = connectedDevice
  const existingReports = new Set(await listRemoteMemreports(deviceSerial))
  const commandResult = await adbManager.sendCommand('memreport -full', deviceSerial)
  if (!commandResult.success) {
    return { success: false, error: commandResult.error || 'Failed to send memreport -full.' }
  }

  const observedSizes = new Map<string, number>()
  let remotePath = ''

  for (let attempt = 0; attempt < 60 && !remotePath; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const reports = await listRemoteMemreports(deviceSerial)
    const candidates = reports.filter((file) => !existingReports.has(file)).sort().reverse()

    for (const candidate of candidates) {
      const size = await getRemoteFileSize(candidate, deviceSerial)
      if (size > 0 && observedSizes.get(candidate) === size) {
        remotePath = candidate
        break
      }
      observedSizes.set(candidate, size)
    }
  }

  if (!remotePath) {
    return {
      success: false,
      error: 'Timed out waiting for a new memreport on the device. The report may be in an unsupported Android path.',
    }
  }

  const reportDir = path.join(app.getPath('userData'), 'MemReports')
  fs.mkdirSync(reportDir, { recursive: true })
  const remoteName = path.posix.basename(remotePath)
  const localPath = path.join(reportDir, `${formatTimestampForFilename()}_${kind}_${remoteName}`)

  try {
    await execFileWithOutput(
      'adb',
      selectedAdbArgs(['pull', remotePath, localPath], deviceSerial),
      { maxBuffer: 100 * 1024 * 1024 },
    )
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string }
    return {
      success: false,
      remotePath,
      error: err.stderr?.trim() || err.stdout?.trim() || err.message,
    }
  }

  const parsed = parseObjectMemreportFile(localPath, kind)
  return { ...parsed, remotePath }
}

async function launchCotfServer(config: CotfServerConfig): Promise<CotfLaunchResult> {
  if (process.platform !== 'win32') {
    return { success: false, error: 'COTF server launch is only supported on Windows.' }
  }

  const ueCmdBinary = config.ueCmdBinary.trim()
  const projectPath = config.projectPath.trim()
  const abslogDir = config.abslogDir.trim()
  const fixedArgs = config.fixedArgs.trim()

  if (!ueCmdBinary) return { success: false, error: 'UE cmd binary is required.' }
  if (!projectPath) return { success: false, error: 'Project path is required.' }
  if (!abslogDir) return { success: false, error: 'Abslog directory is required.' }
  if (!fs.existsSync(ueCmdBinary)) {
    return { success: false, error: `UE cmd binary not found: ${ueCmdBinary}` }
  }
  if (!fs.existsSync(projectPath)) {
    return { success: false, error: `Project file not found: ${projectPath}` }
  }

  try {
    fs.mkdirSync(abslogDir, { recursive: true })
  } catch (error) {
    return {
      success: false,
      error: `Failed to create abslog directory: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  const timestamp = formatTimestampForFilename()
  const abslogPath = path.join(abslogDir, `CookServer_${timestamp}.log`)
  const launcherPath = path.join(abslogDir, `LaunchCOTF_${timestamp}.cmd`)
  const command = [
    quoteCmdArg(ueCmdBinary),
    quoteCmdArg(projectPath),
    fixedArgs,
    `-abslog=${quoteCmdArg(abslogPath)}`,
  ].filter(Boolean).join(' ')

  try {
    const launcher = [
      '@echo off',
      'title COTF Server',
      'echo Launching Unreal COTF server...',
      `echo Log: ${abslogPath}`,
      'echo.',
      command,
      'echo.',
      'echo COTF server exited with code %ERRORLEVEL%.',
      'pause',
      '',
    ].join('\r\n')

    fs.writeFileSync(launcherPath, launcher, 'utf-8')

    const openError = await shell.openPath(launcherPath)
    if (openError) {
      return { success: false, error: `Failed to open COTF launcher: ${openError}` }
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to launch COTF server: ${error instanceof Error ? error.message : String(error)}`,
    }
  }

  return { success: true, data: { abslogPath, command, launcherPath } }
}

// ── Connection Management ─────────────────────────────────

function activateDevice(deviceSerial: string, persistSelection: boolean): void {
  const device = availableDevices.find((candidate) => (
    candidate.serial === deviceSerial && candidate.state === 'device'
  ))
  if (!device) return
  if (connectedDevice === deviceSerial && connectionStatus === 'connected') {
    broadcastStatus()
    return
  }

  if (adbManager.isRunning()) adbManager.stopLogcat()
  connectionStatus = 'connecting'
  connectedDevice = deviceSerial
  adbManager.setDeviceSerial(deviceSerial)
  if (persistSelection) {
    preferredDevice = deviceSerial
    try {
      savePreferredDevice(deviceSerial)
    } catch {
      // Device switching remains usable if config persistence is unavailable.
    }
  }
  broadcastStatus()
  adbManager.startLogcat()
}

function handleDevicesChanged(devices: DeviceInfo[]): void {
  const devicesChanged = devices.length !== availableDevices.length
    || devices.some((device, index) => (
      device.serial !== availableDevices[index]?.serial
      || device.state !== availableDevices[index]?.state
    ))
  availableDevices = devices
  const selectedStillUsable = connectedDevice
    ? devices.some((device) => device.serial === connectedDevice && device.state === 'device')
    : false

  if (selectedStillUsable) {
    if (devicesChanged) broadcastStatus()
    return
  }

  const wasDisconnected = connectionStatus === 'disconnected' && connectedDevice === null
  if (adbManager.isRunning()) adbManager.stopLogcat()
  connectedDevice = null
  adbManager.setDeviceSerial(null)
  connectionStatus = 'disconnected'

  const usableDevices = devices.filter((device) => device.state === 'device')
  const preferred = preferredDevice
    ? usableDevices.find((device) => device.serial === preferredDevice)
    : undefined
  const nextDevice = preferred || usableDevices[0]
  if (nextDevice) activateDevice(nextDevice.serial, false)
  else if (devicesChanged || !wasDisconnected) broadcastStatus()
}

function doConnect(): { success: boolean; status: string; device?: string } {
  if (connectionStatus === 'connected') {
    return { success: true, status: 'connected', device: connectedDevice || undefined }
  }

  const usableDevices = availableDevices.filter((device) => device.state === 'device')
  if (usableDevices.length === 0) {
    return { success: false, status: 'disconnected' }
  }

  const preferred = preferredDevice
    ? usableDevices.find((device) => device.serial === preferredDevice)
    : undefined
  activateDevice((preferred || usableDevices[0]).serial, false)
  return { success: true, status: connectionStatus, device: connectedDevice || undefined }
}

// ── IPC Handlers ──────────────────────────────────────────

function setupIpcHandlers(): void {
  const screenshotDir = path.join(app.getPath('userData'), 'ScreenShots')
  fs.mkdirSync(screenshotDir, { recursive: true })
  adbManager = new AdbManager(screenshotDir)

  // ── Connection ──

  ipcMain.handle('adb:connect', async () => {
    return doConnect()
  })

  ipcMain.handle('adb:get-status', async () => {
    return { status: connectionStatus, device: connectedDevice, devices: availableDevices }
  })

  ipcMain.handle('adb:select-device', async (_event, serial: string) => {
    const selected = availableDevices.find((device) => device.serial === serial)
    if (!selected) {
      return { success: false, error: 'The selected device is no longer available.' }
    }
    if (selected.state !== 'device') {
      return { success: false, error: `Device is ${selected.state}.` }
    }
    activateDevice(serial, true)
    return { success: true, status: connectionStatus, device: connectedDevice }
  })

  // ── ADB Commands ──

  ipcMain.handle('adb:send-command', async (
    _event,
    cmd: string,
    deviceSerial?: string | null,
  ) => {
    return adbManager.sendCommand(
      cmd,
      deviceSerial === undefined ? connectedDevice : deviceSerial,
    )
  })

  ipcMain.handle('adb:list-packages', async () => {
    return adbManager.listThirdPartyPackages()
  })

  ipcMain.handle('adb:list-activities', async (_event, pkg: string) => {
    return adbManager.listPackageActivities(pkg)
  })

  ipcMain.handle('adb:launch-activity', async (_event, activity: string, params: string) => {
    return adbManager.launchActivity(activity, params)
  })

  ipcMain.handle('advanced-launch:inject-command-line', async (
    _event,
    content: string,
    injectPath: string,
  ) => {
    return injectAdvancedLaunchCommandLine(content, injectPath)
  })

  ipcMain.handle('adb:capture-screenshot', async () => {
    return adbManager.captureScreenshot()
  })

  ipcMain.handle('adb:list-screenshots', async () => {
    return adbManager.listScreenshots()
  })

  ipcMain.handle('adb:get-screenshot-data-url', async (_event, screenshotPath: string) => {
    return adbManager.getScreenshotDataUrl(screenshotPath)
  })

  ipcMain.handle('adb:get-screenshot-path', async () => {
    return adbManager.getScreenshotDir()
  })

  ipcMain.handle('adb:get-data-path', async () => {
    return getDataPath()
  })

  ipcMain.handle('cotf:launch-server', async (_event, config: CotfServerConfig) => {
    return launchCotfServer(config)
  })

  ipcMain.handle('logs:pull', async (_event, config: PullLogsConfig) => {
    return pullLogs(config)
  })

  ipcMain.handle('autotest:open-csv', async () => {
    return openAutoTestCsv()
  })

  ipcMain.handle('autotest:run-command', async (
    _event,
    command: string,
    deviceSerial?: string | null,
  ) => {
    if (!command.trim()) {
      return {
        success: false,
        error: 'Empty command',
        stdout: '',
        stderr: '',
      }
    }

    const result = await adbManager.sendCommand(
      command,
      deviceSerial === undefined ? connectedDevice : deviceSerial,
    )
    return {
      success: result.success,
      error: result.error || '',
      stdout: '',
      stderr: result.error || '',
    }
  })

  ipcMain.handle('texture-memory:open-report', async () => {
    return openTextureMemreport()
  })

  ipcMain.handle('texture-memory:capture', async () => {
    return captureTextureMemreport()
  })
  ipcMain.handle('object-memory:open-report', async (_event, kind: string) => {
    if (!isObjectMemoryKind(kind)) {
      return { success: false, error: 'Unsupported object memory analysis type.' }
    }
    return openObjectMemreport(kind)
  })

  ipcMain.handle('object-memory:capture', async (_event, kind: string) => {
    if (!isObjectMemoryKind(kind)) {
      return { success: false, error: 'Unsupported object memory analysis type.' }
    }
    return captureObjectMemreport(kind)
  })
  // ── Config ──

  ipcMain.handle('config:load', async () => {
    try {
      if (fs.existsSync(getConfigPath())) {
        const raw = fs.readFileSync(getConfigPath(), 'utf-8')
        return JSON.parse(raw)
      }
    } catch {
      // Return empty if corrupt
    }
    return {}
  })

  ipcMain.handle('config:save', async (_event, partialConfig: Record<string, unknown>) => {
    const configDir = path.dirname(getConfigPath())
    fs.mkdirSync(configDir, { recursive: true })

    let existing = {}
    if (fs.existsSync(getConfigPath())) {
      try {
        existing = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'))
      } catch { /* overwrite */ }
    }

    const merged = { ...existing, ...partialConfig }
    fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2))
  })

  ipcMain.handle('settings:select-file', async (_event, kind: SettingsFileKind) => {
    if (kind !== 'editor-exe' && kind !== 'editor-command-line-exe' && kind !== 'project') {
      return { canceled: true }
    }
    return selectSettingsFile(kind)
  })
  ipcMain.handle('pso-dump:select-path', async (_event, kind: PsoDumpPickerKind) => {
    if (kind !== 'pipeline-cache' && kind !== 'stable-key-file') return { canceled: true }
    return selectPsoDumpPath(kind)
  })

  ipcMain.handle('pso-dump:run', async (_event, config: Record<string, unknown>) => runPsoDump(config))
  ipcMain.handle('pso-dump:load-csv', async () => loadPsoCsv())
  ipcMain.handle('pso-dump:translate', async (_event, pipelineCsvPath: string) => translatePsoCsv(pipelineCsvPath))
  ipcMain.handle('pso-dump:open-asset', async (_event, assetPath: string) => openPsoAsset(assetPath))
  ipcMain.handle('pso-dump:open-output', async (_event, outputPath: string) => {
    if (!outputPath || !fs.existsSync(outputPath)) return { success: false, error: 'Output file was not found.' }
    const error = await shell.openPath(outputPath)
    return error ? { success: false, error } : { success: true }
  })
  ipcMain.handle(
    'remote-command:send',
    async (_event, host: string, port: string, command: string) => sendRemoteCommand(host, port, command),
  )
  ipcMain.handle('niagara-debugger:select-asset', async () => selectNiagaraAsset())
  ipcMain.handle('shortcuts:list', async () => {
    try {
      return { success: true, shortcuts: listCommandShortcuts() }
    } catch (error) {
      return {
        success: false,
        shortcuts: [],
        error: error instanceof Error ? error.message : 'Failed to load shortcuts.',
      }
    }
  })
  ipcMain.handle('shortcuts:save', async (_event, input: CommandShortcutSaveInput) => {
    try {
      return { success: true, shortcut: saveCommandShortcut(input) }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save shortcut.',
      }
    }
  })
  ipcMain.handle('shortcuts:delete', async (_event, id: string) => {
    try {
      deleteCommandShortcut(id)
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete shortcut.',
      }
    }
  })

  // ── Logcat ──

  ipcMain.handle('adb:start-logcat', async () => {
    adbManager.startLogcat()
  })

  ipcMain.handle('adb:stop-logcat', async () => {
    adbManager.stopLogcat()
  })

  ipcMain.handle('adb:clear-logcat', async () => {
    return adbManager.clearLogcat()
  })

  // Forward logcat events to all windows
  adbManager.on('batch', (lines: string[]) => {
    mainWindow?.webContents.send('logcat:batch', lines)
    captureWindow?.webContents.send('logcat:batch', lines)
    paletteWindow?.webContents.send('logcat:batch', lines)
    previewWindow?.webContents.send('logcat:batch', lines)
  })

  adbManager.on('status', (status: string) => {
    if (status === 'started') {
      connectionStatus = 'connected'
      broadcastStatus()
    } else if (status === 'stopped') {
      // Only set disconnected if logcat was intentionally stopped (not by device loss)
      // Device loss is handled by handleDeviceDisappeared
      if (!deviceMonitor.hasDevice()) {
        connectionStatus = 'disconnected'
        connectedDevice = null
        broadcastStatus()
      }
    }
    mainWindow?.webContents.send('logcat:status', { status })
  })

  adbManager.on('error', (message: string) => {
    mainWindow?.webContents.send('logcat:error', message)
  })

  // ── Device Monitor ──

  preferredDevice = readPreferredDevice()
  deviceMonitor = new DeviceMonitor(2000)
  deviceMonitor.on('devices', handleDevicesChanged)
  deviceMonitor.start()

  // ── Windows ──

  ipcMain.handle('window:open-capture', async () => {
    if (captureWindow && !captureWindow.isDestroyed()) {
      captureWindow.focus()
      return
    }
    captureWindow = createToolWindow('Screen Capture', '/capture', 800, 600)
  })

  ipcMain.handle('window:open-palette', async () => {
    if (paletteWindow && !paletteWindow.isDestroyed()) {
      paletteWindow.focus()
      return
    }
    paletteWindow = createToolWindow('Command Palette', '/palette', 600, 500)
  })

  ipcMain.handle('window:open-preview', async () => {
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.focus()
      return
    }
    previewWindow = createToolWindow('Local Preview', '/preview', 900, 600)
  })

  ipcMain.handle('window:open-cotf-server', async () => {
    if (cotfServerWindow && !cotfServerWindow.isDestroyed()) {
      cotfServerWindow.focus()
      return
    }
    cotfServerWindow = createToolWindow('COTF Server', '/cotf-server', 760, 460)
  })

  ipcMain.handle('window:open-cotf-client', async () => {
    if (cotfClientWindow && !cotfClientWindow.isDestroyed()) {
      cotfClientWindow.focus()
      return
    }
    cotfClientWindow = createToolWindow('COTF Client', '/cotf-client', 760, 620)
  })

  ipcMain.handle('window:open-pull-logs', async () => {
    if (pullLogsWindow && !pullLogsWindow.isDestroyed()) {
      pullLogsWindow.focus()
      return
    }
    pullLogsWindow = createToolWindow('Pull Logs', '/pull-logs', 760, 420)
  })
  ipcMain.handle('window:open-auto-test', async () => {
    if (autoTestWindow && !autoTestWindow.isDestroyed()) {
      autoTestWindow.focus()
      return
    }
    autoTestWindow = createToolWindow('Auto Test', '/auto-test', 940, 700)
  })
  ipcMain.handle('window:open-texture-memory', async () => {
    if (textureMemoryWindow && !textureMemoryWindow.isDestroyed()) {
      textureMemoryWindow.focus()
      return
    }
    textureMemoryWindow = createToolWindow('Texture Memory Usage', '/texture-memory', 1280, 760)
  })
  ipcMain.handle('window:open-static-mesh-memory', async () => {
    if (staticMeshMemoryWindow && !staticMeshMemoryWindow.isDestroyed()) {
      staticMeshMemoryWindow.focus()
      return
    }
    staticMeshMemoryWindow = createToolWindow('Static Mesh Memory Usage', '/static-mesh-memory', 1180, 720)
  })

  ipcMain.handle('window:open-skeletal-mesh-memory', async () => {
    if (skeletalMeshMemoryWindow && !skeletalMeshMemoryWindow.isDestroyed()) {
      skeletalMeshMemoryWindow.focus()
      return
    }
    skeletalMeshMemoryWindow = createToolWindow('Skeletal Mesh Memory Usage', '/skeletal-mesh-memory', 1180, 720)
  })

  ipcMain.handle('window:open-static-mesh-component-memory', async () => {
    if (staticMeshComponentMemoryWindow && !staticMeshComponentMemoryWindow.isDestroyed()) {
      staticMeshComponentMemoryWindow.focus()
      return
    }
    staticMeshComponentMemoryWindow = createToolWindow(
      'Static Mesh Component Memory Usage',
      '/static-mesh-component-memory',
      1280,
      760,
    )
  })

  ipcMain.handle('window:open-settings', async () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.focus()
      return
    }
    settingsWindow = createToolWindow('Settings', '/settings', 820, 420)
  })
  ipcMain.handle('window:open-pso-dump', async () => {
    if (psoDumpWindow && !psoDumpWindow.isDestroyed()) {
      psoDumpWindow.focus()
      return
    }
    psoDumpWindow = createToolWindow('PSO Dump', '/pso-dump', 1260, 800)
  })
  ipcMain.handle('window:open-remote-command', async () => {
    if (remoteCommandWindow && !remoteCommandWindow.isDestroyed()) {
      remoteCommandWindow.focus()
      return
    }
    remoteCommandWindow = createToolWindow('Remote Command Line', '/remote-command', 820, 520)
  })
  ipcMain.handle('window:open-niagara-debugger', async () => {
    if (niagaraDebuggerWindow && !niagaraDebuggerWindow.isDestroyed()) {
      niagaraDebuggerWindow.focus()
      return
    }
    niagaraDebuggerWindow = createToolWindow('Niagara Debugger', '/niagara-debugger', 920, 760)
  })
  ipcMain.handle('window:open-command-palette-2', async () => {
    if (commandPalette2Window && !commandPalette2Window.isDestroyed()) {
      commandPalette2Window.focus()
      return
    }
    commandPalette2Window = createToolWindow('Command Palette 2', '/palette-2', 1080, 760)
  })
}

// ── App Lifecycle ─────────────────────────────────────────

app.whenReady().then(() => {
  setupIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  adbManager?.stopLogcat()
  deviceMonitor?.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  adbManager?.stopLogcat()
  deviceMonitor?.stop()
})
