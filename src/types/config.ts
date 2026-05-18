import type { ColumnDef } from './log'

export interface AppConfig {
  columns: ColumnDef[]
  logLevels: Record<string, boolean>
  launchActivity: string
  processFilter: boolean
  scrollLock: boolean
  launchParameters: string[]
}
