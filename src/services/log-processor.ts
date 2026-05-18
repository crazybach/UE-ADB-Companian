import type { LogEntry, LogLevel, ColumnDef } from '../types/log'

const LOG_PATTERN = /^(\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VDIWEFS])\s+([^:]+):\s*(.*)$/

const LEVEL_NAMES: Record<string, string> = {
  V: 'Verbose',
  D: 'Debug',
  I: 'Info',
  W: 'Warning',
  E: 'Error',
  F: 'Fatal',
  S: 'Silent',
}

const UE_LEVEL_PATTERN = /:\s*(Error|Warning|Info|Debug|Verbose|Fatal)\s*:/i
const UE_LEVEL_START_PATTERN = /^\s*(Error|Warning|Info|Debug|Verbose|Fatal)\s*:/i

export function parseLogEntry(line: string): LogEntry {
  if (line.startsWith('[APP]')) {
    return {
      isAppLog: true,
      level: 'Info',
      levelChar: 'I',
      time: '',
      pid: '',
      tid: '',
      application: '',
      tag: '',
      message: line,
    }
  }

  const match = LOG_PATTERN.exec(line)
  if (match) {
    const [, time, pid, tid, levelChar, tag, message] = match
    const trimmedTag = tag.trim()
    const level = LEVEL_NAMES[levelChar] || levelChar

    let application = ''
    if (trimmedTag.includes('.')) {
      application = trimmedTag.split('.').slice(0, -1).join('.')
    }

    const entry: LogEntry = {
      isAppLog: false,
      level,
      levelChar: levelChar as LogLevel,
      time,
      pid,
      tid,
      application,
      tag: trimmedTag,
      message,
    }

    if (trimmedTag === 'UE') {
      const ueMatch = UE_LEVEL_PATTERN.exec(message) || UE_LEVEL_START_PATTERN.exec(message)
      if (ueMatch) {
        entry.ueLevel = ueMatch[1]
      }
    }

    return entry
  }

  return {
    isAppLog: false,
    raw: line,
    level: 'Info',
    levelChar: 'I',
    time: '',
    pid: '',
    tid: '',
    application: '',
    tag: '',
    message: line,
  }
}

export function formatLogEntry(entry: LogEntry, columns: ColumnDef[]): string {
  if (entry.isAppLog) return entry.message
  if (entry.raw) return entry.raw

  const entryMap: Record<string, string> = {
    time: entry.time,
    pid: entry.pid,
    tid: entry.tid,
    level: entry.level,
    application: entry.application,
    tag: entry.tag,
    message: entry.message,
  }
  const parts: string[] = []
  for (const col of columns) {
    if (col.visible && col.id !== 'message') {
      const value = entryMap[col.id] || ''
      parts.push(col.align === 'left' ? value.padEnd(col.width) : value.padStart(col.width))
    }
  }

  return `${parts.join(' ')} ${entry.message}`
}

export function extractLogLevel(line: string): LogLevel {
  if (line.startsWith('[APP]')) return 'I'
  const m = line.match(/\s([VDIWEFS])\s/)
  return (m?.[1] as LogLevel) || 'I'
}

export function shouldDisplayLog(
  line: string,
  filterText: string,
  selectedLevels: Set<LogLevel>,
  processFilter: boolean,
): boolean {
  if (filterText && !line.toLowerCase().includes(filterText.toLowerCase())) {
    return false
  }

  if (selectedLevels.size > 0) {
    const levelMatch = line.match(/\s([VDIWEFS])\s/)
    if (levelMatch && !selectedLevels.has(levelMatch[1] as LogLevel)) {
      return false
    }
  }

  if (processFilter) {
    if (line.startsWith('[APP]')) return true
    const parsed = parseLogEntry(line)
    if (!parsed.isAppLog && parsed.tag) {
      return parsed.tag.includes('UE')
    }
    return false
  }

  return true
}

export function extractUeLevel(entry: LogEntry): string | undefined {
  return entry.ueLevel
}

export function batchFilterLogs(
  lines: string[],
  filterText: string,
  selectedLevels: Set<LogLevel>,
  processFilter: boolean,
): string[] {
  return lines.filter((line) => shouldDisplayLog(line, filterText, selectedLevels, processFilter))
}
