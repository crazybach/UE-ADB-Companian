import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import { execFile } from 'child_process'
import path from 'path'
import fs from 'fs'
import { AdbManager } from './services/adb-manager'
import { DeviceMonitor } from './services/device-monitor'
import { parseAutoTestCsv, type AutoTestRow } from '../services/auto-test'

let mainWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null
let paletteWindow: BrowserWindow | null = null
let previewWindow: BrowserWindow | null = null
let cotfServerWindow: BrowserWindow | null = null
let cotfClientWindow: BrowserWindow | null = null
let pullLogsWindow: BrowserWindow | null = null
let autoTestWindow: BrowserWindow | null = null

let adbManager: AdbManager
let deviceMonitor: DeviceMonitor

type ConnectionState = 'disconnected' | 'connecting' | 'connected'
let connectionStatus: ConnectionState = 'disconnected'
let connectedDevice: string | null = null

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

interface AutoTestOpenCsvResult {
  canceled?: boolean
  path?: string
  rows?: AutoTestRow[]
  error?: string
}

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
  const payload = { status: connectionStatus, device: connectedDevice }
  mainWindow?.webContents.send('adb:connection-status', payload)
  captureWindow?.webContents.send('adb:connection-status', payload)
  paletteWindow?.webContents.send('adb:connection-status', payload)
  previewWindow?.webContents.send('adb:connection-status', payload)
  cotfServerWindow?.webContents.send('adb:connection-status', payload)
  cotfClientWindow?.webContents.send('adb:connection-status', payload)
  pullLogsWindow?.webContents.send('adb:connection-status', payload)
  autoTestWindow?.webContents.send('adb:connection-status', payload)
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

async function pullLogs(config: PullLogsConfig): Promise<PullLogsResult> {
  const androidSavedPath = config.androidSavedPath.trim()
  const destinationDir = config.destinationDir.trim() || './'

  if (!androidSavedPath) {
    return { success: false, error: 'Android Saved path is required.' }
  }

  const baseDestination = path.resolve(destinationDir)
  const destinationPath = path.join(baseDestination, `Saved_${formatTimestampForFilename()}`)
  const command = ['adb', 'pull', quoteCmdArg(androidSavedPath), quoteCmdArg(destinationPath)].join(' ')

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
      ['pull', androidSavedPath, destinationPath],
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

async function openAutoTestCsv(): Promise<AutoTestOpenCsvResult> {
  const parent = autoTestWindow && !autoTestWindow.isDestroyed() ? autoTestWindow : mainWindow
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

function tryAutoConnect(deviceSerial?: string): void {
  if (connectionStatus === 'connected' || connectionStatus === 'connecting') return
  if (!deviceMonitor.hasDevice()) return

  connectionStatus = 'connecting'
  connectedDevice = deviceSerial || deviceMonitor.getDevices().find((d) => d.state === 'device')?.serial || null
  broadcastStatus()

  adbManager.startLogcat()
}

function handleDeviceAppeared(): void {
  tryAutoConnect()
}

function handleDeviceDisappeared(): void {
  if (connectionStatus === 'connected' || connectionStatus === 'connecting') {
    adbManager.stopLogcat()
    connectionStatus = 'disconnected'
    connectedDevice = null
    broadcastStatus()
  }
}

function doConnect(): { success: boolean; status: string; device?: string } {
  if (connectionStatus === 'connected') {
    return { success: true, status: 'connected', device: connectedDevice || undefined }
  }

  if (!deviceMonitor.hasDevice()) {
    return { success: false, status: 'disconnected' }
  }

  tryAutoConnect()
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
    return { status: connectionStatus, device: connectedDevice }
  })

  // ── ADB Commands ──

  ipcMain.handle('adb:send-command', async (_event, cmd: string) => {
    return adbManager.sendCommand(cmd)
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

  ipcMain.handle('autotest:run-command', async (_event, command: string) => {
    if (!command.trim()) {
      return {
        success: false,
        error: 'Empty command',
        stdout: '',
        stderr: '',
      }
    }

    const result = await adbManager.sendCommand(command)
    return {
      success: result.success,
      error: result.error || '',
      stdout: '',
      stderr: result.error || '',
    }
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

  deviceMonitor = new DeviceMonitor(2000)
  deviceMonitor.on('device-appeared', handleDeviceAppeared)
  deviceMonitor.on('device-disappeared', handleDeviceDisappeared)
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
    autoTestWindow = createToolWindow('Auto Test', '/auto-test', 900, 640)
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
