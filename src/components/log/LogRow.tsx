import { memo } from 'react'
import type { ColumnDef } from '../../types/log'
import {
  parseLogEntry,
  formatLogEntry,
  extractLogLevel,
  extractUeLevel,
} from '../../services/log-processor'
import { LOG_LEVEL_COLORS } from '../../types/log'

interface LogRowProps {
  line: string
  columns: ColumnDef[]
}

const UE_LEVEL_COLORS: Record<string, string> = {
  Error: '#f44747',
  Warning: '#dcdcaa',
  Info: '#4ec9b0',
  Debug: '#569cd6',
  Verbose: '#b0b0b0',
  Fatal: '#ff6b6b',
}

export default memo(function LogRow({ line, columns }: LogRowProps) {
  const entry = parseLogEntry(line)
  const levelChar = extractLogLevel(line)
  const color = LOG_LEVEL_COLORS[levelChar] || '#d4d4d4'
  const ueLevel = extractUeLevel(entry)
  const formatted = formatLogEntry(entry, columns)

  // Apply color coding
  let style: React.CSSProperties = { color }

  // UE level coloring takes priority for the whole line
  if (ueLevel && UE_LEVEL_COLORS[ueLevel]) {
    style = { color: UE_LEVEL_COLORS[ueLevel] }
  }

  // App logs in gray
  if (line.startsWith('[APP]')) {
    style = { color: '#858585' }
  }

  return <span style={style}>{formatted}</span>
})
