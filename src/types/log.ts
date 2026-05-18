export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F' | 'S'

export interface LogEntry {
  isAppLog: boolean
  raw?: string
  level: string
  levelChar: LogLevel
  time: string
  pid: string
  tid: string
  application: string
  tag: string
  message: string
  ueLevel?: string
}

export interface ColumnDef {
  id: string
  label: string
  width: number
  visible: boolean
  align: 'left' | 'right'
}

export const DEFAULT_COLUMNS: ColumnDef[] = [
  { id: 'time', label: 'Time', width: 18, visible: true, align: 'left' },
  { id: 'pid', label: 'PID', width: 6, visible: true, align: 'right' },
  { id: 'tid', label: 'TID', width: 6, visible: true, align: 'right' },
  { id: 'level', label: 'Level', width: 8, visible: true, align: 'left' },
  { id: 'application', label: 'Application', width: 20, visible: false, align: 'left' },
  { id: 'tag', label: 'Tag', width: 20, visible: true, align: 'left' },
  { id: 'message', label: 'Message', width: 0, visible: true, align: 'left' },
]

export const LOG_LEVELS: LogLevel[] = ['V', 'D', 'I', 'W', 'E', 'F', 'S']

export const LOG_LEVEL_NAMES: Record<LogLevel, string> = {
  V: 'Verbose',
  D: 'Debug',
  I: 'Info',
  W: 'Warning',
  E: 'Error',
  F: 'Fatal',
  S: 'Silent',
}

export const LOG_LEVEL_COLORS: Record<LogLevel, string> = {
  V: '#b0b0b0',
  D: '#569cd6',
  I: '#4ec9b0',
  W: '#dcdcaa',
  E: '#f44747',
  F: '#8b0000',
  S: '#d4d4d4',
}
