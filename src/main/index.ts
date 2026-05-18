import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { AdbManager } from './services/adb-manager'
import { DeviceMonitor } from './services/device-monitor'

let mainWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null
let paletteWindow: BrowserWindow | null = null
let previewWindow: BrowserWindow | null = null

let adbManager: AdbManager
let deviceMonitor: DeviceMonitor

type ConnectionState = 'disconnected' | 'connecting' | 'connected'
let connectionStatus: ConnectionState = 'disconnected'
let connectedDevice: string | null = null

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
  })

  return win
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

  ipcMain.handle('adb:get-screenshot-path', async () => {
    return adbManager.getScreenshotDir()
  })

  ipcMain.handle('adb:get-data-path', async () => {
    return getDataPath()
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
