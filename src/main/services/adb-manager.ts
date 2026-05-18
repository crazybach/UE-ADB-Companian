import { spawn, exec, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import path from 'path'
import fs from 'fs'

export interface AdbResult<T = void> {
  success: boolean
  error?: string
  data?: T
}

export class AdbManager extends EventEmitter {
  private logcatProcess: ChildProcess | null = null
  private running = false
  private lineBuffer: string[] = []
  private batchTimer: ReturnType<typeof setInterval> | null = null
  private screenshotDir: string

  constructor(screenshotDir?: string) {
    super()
    this.screenshotDir = screenshotDir || path.join(process.cwd(), 'src', 'Save', 'ScreenShots')
    fs.mkdirSync(this.screenshotDir, { recursive: true })
  }

  private execCommand(cmd: string): Promise<AdbResult> {
    return new Promise((resolve) => {
      exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            error: stderr.trim() || stdout.trim() || error.message,
          })
        } else {
          resolve({
            success: true,
            data: undefined,
          })
        }
      })
    })
  }

  private execCommandWithOutput(cmd: string): Promise<AdbResult<string>> {
    return new Promise((resolve) => {
      exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          resolve({
            success: false,
            error: stderr.trim() || stdout.trim() || error.message,
          })
        } else {
          resolve({
            success: true,
            data: stdout.trim(),
          })
        }
      })
    })
  }

  sendCommand(cmd: string): Promise<AdbResult> {
    if (!cmd.trim()) {
      return Promise.resolve({ success: false, error: 'Empty command' })
    }
    const adbCmd = `adb shell "am broadcast -a android.intent.action.RUN -e cmd '${cmd}'"`
    return this.execCommandWithOutput(adbCmd).then((r) => ({
      success: r.success,
      error: r.error,
    }))
  }

  startLogcat(): void {
    if (this.running) return

    this.running = true
    this.lineBuffer = []

    this.logcatProcess = spawn('adb', ['logcat'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.logcatProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString('utf-8')
      const lines = text.split('\n')
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed) {
          this.lineBuffer.push(trimmed)
        }
      }
    })

    this.logcatProcess.stderr?.on('data', (data: Buffer) => {
      this.emit('error', `[APP] Logcat stderr: ${data.toString('utf-8').trim()}`)
    })

    this.logcatProcess.on('error', (err) => {
      this.emit('error', `[APP] Logcat process error: ${err.message}`)
      this.running = false
    })

    this.logcatProcess.on('close', (code) => {
      this.running = false
      this.emit('status', 'stopped', code?.toString())
    })

    // Batch send lines every 100ms (matching Python's 50 lines/100ms)
    this.batchTimer = setInterval(() => {
      if (this.lineBuffer.length > 0) {
        const batch = this.lineBuffer.splice(0)
        this.emit('batch', batch)
      }
    }, 100)

    this.emit('status', 'started')
  }

  stopLogcat(): void {
    this.running = false
    if (this.batchTimer) {
      clearInterval(this.batchTimer)
      this.batchTimer = null
    }
    if (this.logcatProcess) {
      this.logcatProcess.kill('SIGTERM')
      setTimeout(() => {
        if (this.logcatProcess && !this.logcatProcess.killed) {
          this.logcatProcess.kill('SIGKILL')
        }
      }, 2000)
      this.logcatProcess = null
    }
    this.emit('status', 'stopped')
  }

  async listThirdPartyPackages(): Promise<AdbResult<{ packages: string[] }>> {
    let result = await this.execCommandWithOutput('adb shell pm list packages -3')
    if (!result.success || !result.data) {
      result = await this.execCommandWithOutput('adb shell cmd package list packages -3')
    }

    if (result.success && result.data) {
      const packages = result.data
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('package:'))
        .map((l) => l.slice(8))
      return { success: true, data: { packages } }
    }
    return { success: false, error: result.error }
  }

  async listPackageActivities(packageName: string): Promise<AdbResult<{ activities: string[] }>> {
    const commands = [
      `adb shell cmd package query-activities -p ${packageName}`,
      `adb shell dumpsys package ${packageName}`,
      `adb shell pm dump ${packageName}`,
    ]

    for (const cmd of commands) {
      const result = await this.execCommandWithOutput(cmd)
      if (!result.success || !result.data) continue

      const activities: string[] = []
      const packagePrefix = `${packageName}/`

      for (const line of result.data.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue

        // Parse: name=com.epicgames.unreal.SplashActivity
        if (trimmed.includes('name=') && trimmed.includes('packageName=')) {
          try {
            const namePart = trimmed.split('name=')[1]?.split(/\s+/)[0]
            if (namePart) activities.push(packagePrefix + namePart)
          } catch { /* skip */ }
        } else if (trimmed.startsWith('name=')) {
          try {
            const namePart = trimmed.split('name=')[1]?.split(/\s+/)[0]
            if (namePart) activities.push(packagePrefix + namePart)
          } catch { /* skip */ }
        } else if (trimmed.includes(packagePrefix)) {
          const parts = trimmed.split(/\s+/)
          for (const part of parts) {
            if (part.startsWith(packagePrefix)) {
              activities.push(part)
              break
            }
          }
        } else if (trimmed.includes(packageName) && trimmed.includes('/')) {
          const match = trimmed.match(new RegExp(`\\b${packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[^\\s]+`))
          if (match) activities.push(match[0])
        }
      }

      const unique = [...new Set(activities)].filter(Boolean)
      if (unique.length > 0) {
        return { success: true, data: { activities: unique } }
      }
    }

    return { success: false, error: `Failed to list activities for ${packageName}` }
  }

  async launchActivity(activity: string, parameters: string): Promise<AdbResult<{ pid?: string }>> {
    const paramsArg = parameters ? ` --es cmdline "${parameters} "` : ''
    const cmd = `adb shell am start -n ${activity}${paramsArg}`
    const result = await this.execCommandWithOutput(cmd)

    if (!result.success) {
      return { success: false, error: result.error }
    }

    // Try to extract PID from output
    const pidMatch = result.data?.match(/pid=(\d+)/)
    if (pidMatch) {
      return { success: true, data: { pid: pidMatch[1] } }
    }

    // Fallback: try pidof with the package name
    const pkgName = activity.split('/')[0]
    const pidofResult = await this.execCommandWithOutput(`adb shell pidof ${pkgName}`)
    if (pidofResult.success && pidofResult.data) {
      return { success: true, data: { pid: pidofResult.data.trim() } }
    }

    return { success: true, data: {} }
  }

  async captureScreenshot(deviceSerial?: string): Promise<AdbResult<{ filename: string; localPath: string }>> {
    const now = new Date()
    const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 15).replace(/(\d{8})(\d{6})/, '$1_$2')
    const serial = deviceSerial || 'device'
    const filename = `${serial}_${dateStr}.png`
    const remotePath = `/sdcard/${filename}`
    const localPath = path.join(this.screenshotDir, filename)

    // screencap
    let result = await this.execCommand(`adb shell screencap -p ${remotePath}`)
    if (!result.success) return { success: false, error: result.error }

    // pull
    result = await this.execCommand(`adb pull ${remotePath} "${localPath}"`)
    if (!result.success) return { success: false, error: result.error }

    // cleanup remote
    await this.execCommand(`adb shell rm ${remotePath}`)

    return { success: true, data: { filename, localPath } }
  }

  async deleteRemoteFile(remotePath: string): Promise<AdbResult> {
    return this.execCommand(`adb shell rm ${remotePath}`)
  }

  listScreenshots(): { files: { name: string; device: string; date: string; path: string }[] } {
    const files: { name: string; device: string; date: string; path: string }[] = []
    if (!fs.existsSync(this.screenshotDir)) return { files }

    const entries = fs.readdirSync(this.screenshotDir)
    for (const entry of entries) {
      if (!entry.endsWith('.png')) continue
      const match = entry.match(/^(.+)_(\d{8})_(\d{6})\.png$/)
      if (match) {
        files.push({
          name: entry,
          device: match[1],
          date: `${match[2].slice(0, 4)}-${match[2].slice(4, 6)}-${match[2].slice(6, 8)} ${match[3].slice(0, 2)}:${match[3].slice(2, 4)}:${match[3].slice(4, 6)}`,
          path: path.join(this.screenshotDir, entry),
        })
      }
    }

    files.sort((a, b) => b.name.localeCompare(a.name))
    return { files }
  }

  getScreenshotDir(): string {
    return this.screenshotDir
  }

  isRunning(): boolean {
    return this.running
  }
}
