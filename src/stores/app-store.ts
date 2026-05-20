import { create } from 'zustand'
import { DEFAULT_COTF_SERVER_CONFIG, type AppConfig } from '../types/config'
import { DEFAULT_COLUMNS } from '../types/log'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

interface AppStore {
  // Connection status
  connectionStatus: ConnectionStatus
  connectedDevice: string | null
  logcatRunning: boolean

  // Config
  config: AppConfig
  configLoaded: boolean

  // Command history
  commandHistory: string[]

  // Actions
  setConnectionStatus: (status: ConnectionStatus, device?: string | null) => void
  setLogcatRunning: (v: boolean) => void
  setConfig: (config: Partial<AppConfig>) => void
  setConfigLoaded: (v: boolean) => void
  addCommandToHistory: (cmd: string) => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  connectionStatus: 'disconnected',
  connectedDevice: null,
  logcatRunning: false,
  configLoaded: false,
  config: {
    columns: DEFAULT_COLUMNS,
    logLevels: {},
    launchActivity: '',
    processFilter: false,
    scrollLock: false,
    launchParameters: [],
    cotfServer: DEFAULT_COTF_SERVER_CONFIG,
  },
  commandHistory: [],

  setConnectionStatus: (status, device = null) =>
    set({ connectionStatus: status, connectedDevice: device }),
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
