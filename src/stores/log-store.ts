import { create } from 'zustand'
import type { LogLevel, ColumnDef } from '../types/log'
import { DEFAULT_COLUMNS } from '../types/log'
import { parseLogEntry, shouldDisplayLog, extractUeLevel } from '../services/log-processor'

const MAX_LOGS = 80000
const TRIM_AMOUNT = 20000

interface LogStore {
  // Buffer
  rawLines: string[]
  filteredLines: string[]

  // Filters
  filterText: string
  logLevels: Set<LogLevel>
  processFilter: boolean
  scrollLock: boolean
  launchedPid: string | null

  // Columns
  columns: ColumnDef[]

  // Actions
  appendBatch: (lines: string[]) => void
  clearLogs: () => void
  setFilterText: (text: string) => void
  toggleLevel: (level: LogLevel) => void
  setProcessFilter: (enabled: boolean) => void
  setScrollLock: (locked: boolean) => void
  setLaunchedPid: (pid: string | null) => void
  recomputeFiltered: () => void
  moveColumn: (fromIndex: number, toIndex: number) => void
  resizeColumn: (id: string, width: number) => void
  setColumns: (columns: ColumnDef[]) => void
  toggleColumnVisibility: (id: string) => void
}

export const useLogStore = create<LogStore>((set, get) => ({
  rawLines: [],
  filteredLines: [],
  filterText: '',
  logLevels: new Set<LogLevel>(),
  processFilter: false,
  scrollLock: false,
  launchedPid: null,
  columns: DEFAULT_COLUMNS,

  appendBatch: (lines: string[]) => {
    const state = get()
    let rawLines = [...state.rawLines, ...lines]

    // Trim if exceeding max
    if (rawLines.length > MAX_LOGS) {
      rawLines = rawLines.slice(TRIM_AMOUNT)
    }

    set({ rawLines })
  },

  clearLogs: () => set({ rawLines: [], filteredLines: [] }),

  setFilterText: (text: string) => {
    set({ filterText: text })
    get().recomputeFiltered()
  },

  toggleLevel: (level: LogLevel) => {
    const levels = new Set(get().logLevels)
    if (levels.has(level)) {
      levels.delete(level)
    } else {
      levels.add(level)
    }
    set({ logLevels: levels })
    get().recomputeFiltered()
  },

  setProcessFilter: (enabled: boolean) => {
    set({ processFilter: enabled })
    get().recomputeFiltered()
  },

  setScrollLock: (locked: boolean) => set({ scrollLock: locked }),

  setLaunchedPid: (pid: string | null) => set({ launchedPid: pid }),

  recomputeFiltered: () => {
    const { rawLines, filterText, logLevels, processFilter } = get()
    // Optimization: filter all lines in one pass
    const filtered = rawLines.filter((line) =>
      shouldDisplayLog(line, filterText, logLevels, processFilter),
    )
    set({ filteredLines: filtered })
  },

  moveColumn: (fromIndex: number, toIndex: number) => {
    const columns = [...get().columns]
    const nonMessage = columns.filter((c) => c.id !== 'message')
    const messageCol = columns.find((c) => c.id === 'message')!

    const [moved] = nonMessage.splice(fromIndex, 1)
    nonMessage.splice(toIndex, 0, moved)

    set({ columns: [...nonMessage, messageCol] })
  },

  resizeColumn: (id: string, width: number) => {
    set({
      columns: get().columns.map((c) => (c.id === id ? { ...c, width: Math.max(width, 4) } : c)),
    })
  },

  setColumns: (columns: ColumnDef[]) => set({ columns }),

  toggleColumnVisibility: (id: string) => {
    set({
      columns: get().columns.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)),
    })
  },
}))

// Helper exports for use in components
export { parseLogEntry, shouldDisplayLog, extractUeLevel, DEFAULT_COLUMNS }
