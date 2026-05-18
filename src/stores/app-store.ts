import { create } from 'zustand'
import type { AppConfig } from '../types/config'
import { DEFAULT_COLUMNS } from '../types/log'

interface AppStore {
  // Connection status
  adbConnected: boolean
  logcatRunning: boolean

  // Config
  config: AppConfig
  configLoaded: boolean

  // Command history
  commandHistory: string[]

  // Actions
  setAdbConnected: (v: boolean) => void
  setLogcatRunning: (v: boolean) => void
  setConfig: (config: Partial<AppConfig>) => void
  setConfigLoaded: (v: boolean) => void
  addCommandToHistory: (cmd: string) => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  adbConnected: false,
  logcatRunning: false,
  configLoaded: false,
  config: {
    columns: DEFAULT_COLUMNS,
    logLevels: {},
    launchActivity: '',
    processFilter: false,
    scrollLock: false,
    launchParameters: [],
  },
  commandHistory: [],

  setAdbConnected: (v) => set({ adbConnected: v }),
  setLogcatRunning: (v) => set({ logcatRunning: v }),

  setConfig: (partial) =>
    set((state) => ({
      config: { ...state.config, ...partial },
    })),

  setConfigLoaded: (v) => set({ configLoaded: v }),

  addCommandToHistory: (cmd) => {
    const history = get().commandHistory
    // Remove duplicate if exists
    const filtered = history.filter((h) => h !== cmd)
    // Add to front, cap at 30
    set({ commandHistory: [cmd, ...filtered].slice(0, 30) })
  },
}))
