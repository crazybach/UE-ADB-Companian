import { exec } from 'child_process'
import { EventEmitter } from 'events'

export interface DeviceInfo {
  serial: string
  state: string // 'device' | 'offline' | 'unauthorized'
}

export class DeviceMonitor extends EventEmitter {
  private timer: ReturnType<typeof setInterval> | null = null
  private currentDevices: DeviceInfo[] = []
  private polling = false
  private pollInterval: number

  constructor(pollInterval = 2000) {
    super()
    this.pollInterval = pollInterval
  }

  start(): void {
    if (this.polling) return
    this.polling = true
    this.poll() // immediate first check
    this.timer = setInterval(() => this.poll(), this.pollInterval)
  }

  stop(): void {
    this.polling = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private poll(): void {
    exec('adb devices', (err, stdout) => {
      if (err) {
        this.emit('adb-error', err.message)
        return
      }

      const devices = this.parseDevices(stdout)
      const prev = this.currentDevices
      this.currentDevices = devices

      // Detect appeared devices
      for (const d of devices) {
        if (d.state === 'device' && !prev.find((p) => p.serial === d.serial)) {
          this.emit('device-appeared', d)
        }
      }

      // Detect disappeared devices
      for (const p of prev) {
        if (!devices.find((d) => d.serial === p.serial)) {
          this.emit('device-disappeared', p)
        }
      }

      this.emit('devices', devices)
    })
  }

  private parseDevices(output: string): DeviceInfo[] {
    const lines = output.split('\n').slice(1) // skip "List of devices attached"
    const devices: DeviceInfo[] = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const parts = trimmed.split(/\s+/)
      if (parts.length >= 2) {
        devices.push({ serial: parts[0], state: parts[1] })
      }
    }
    return devices
  }

  getDevices(): DeviceInfo[] {
    return this.currentDevices
  }

  hasDevice(): boolean {
    return this.currentDevices.some((d) => d.state === 'device')
  }
}
