import { app, BrowserWindow, ipcMain, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { AdbManager } from './services/adb-manager'

let mainWindow: BrowserWindow | null = null
let captureWindow: BrowserWindow | null = null
let paletteWindow: BrowserWindow | null = null
let previewWindow: BrowserWindow | null = null

let adbManager: AdbManager

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

function getPreloadPath(): string {
  return path.join(__dirname, '..', 'preload', 'index.js')
}

function getRendererUrl(hash: string = ''): string {
  if (isDev) {
    return `http://localhost:5173/#${hash}`
  }
  return `file://${path.join(__dirname, '..', 'renderer', 'index.html')}#${hash}`
}

function getDataPath(): string {
  if (isDev) {
    return path.join(__dirname, '..', '..', 'src', 'data')
  }
  return path.join(process.resourcesPath, 'data')
}

function getConfigPath(): string {
  const configDir = path.join(app.getPath('home'), '.ue_console_adb')
  return path.join(configDir, 'app_config.json')
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

  mainWindow.loadURL(getRendererUrl())
  mainWindow.setMenuBarVisibility(false)

  // Apply dark title bar on Windows
  if (process.platform === 'win32') {
    try {
      const hwnd = mainWindow.getNativeWindowHandle()
      const DWMWA_USE_IMMERSIVE_DARK_MODE = 20
      // Dynamic import for Windows-specific API
      const { setWindowDarkMode } = require('./services/win32-utils')
      setWindowDarkMode(hwnd)
    } catch {
      // Non-Windows or optional feature
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

  win.loadURL(getRendererUrl(hash))
  win.setMenuBarVisibility(false)

  win.on('closed', () => {
    if (win === captureWindow) captureWindow = null
    else if (win === paletteWindow) paletteWindow = null
    else if (win === previewWindow) previewWindow = null
  })

  return win
}

// ── IPC Handlers ──────────────────────────────────────────

function setupIpcHandlers(): void {
  const screenshotDir = path.join(app.getPath('userData'), 'ScreenShots')
  fs.mkdirSync(screenshotDir, { recursive: true })
  adbManager = new AdbManager(screenshotDir)

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

  // Forward logcat events to the renderer
  adbManager.on('batch', (lines: string[]) => {
    mainWindow?.webContents.send('logcat:batch', lines)
    captureWindow?.webContents.send('logcat:batch', lines)
    paletteWindow?.webContents.send('logcat:batch', lines)
    previewWindow?.webContents.send('logcat:batch', lines)
  })

  adbManager.on('status', (status: string, code?: string) => {
    const payload = { status, code }
    mainWindow?.webContents.send('logcat:status', payload)
  })

  adbManager.on('error', (message: string) => {
    mainWindow?.webContents.send('logcat:error', message)
  })

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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  adbManager?.stopLogcat()
})
