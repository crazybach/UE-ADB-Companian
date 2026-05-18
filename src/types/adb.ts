export interface AdbResult<T = void> {
  success: boolean
  error?: string
  stdout?: string
  data?: T
}

export interface ScreenshotFile {
  name: string
  device: string
  date: string
  path: string
}
