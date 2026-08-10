import { create } from 'zustand'
import {
  DEFAULT_ADVANCED_LAUNCH_CONFIG,
  DEFAULT_COTF_CLIENT_CONFIG,
  DEFAULT_COTF_SERVER_CONFIG,
  DEFAULT_PULL_LOGS_CONFIG,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_PSO_DUMP_CONFIG,
  type AppConfig,
} from '../types/config'
import { DEFAULT_COLUMNS } from '../types/log'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface AdbDeviceInfo {
  serial: string
  state: string
}

interface AppStore {
  // Connection status
  connectionStatus: ConnectionStatus
  connectedDevice: string | null
  availableDevices: AdbDeviceInfo[]
  logcatRunning: boolean

  // Config
  config: AppConfig
  configLoaded: boolean

  // Command history
  commandHistory: string[]

  // Actions
  setConnectionStatus: (
    status: ConnectionStatus,
    device?: string | null,
    devices?: AdbDeviceInfo[],
  ) => void
  setLogcatRunning: (v: boolean) => void
  setConfig: (config: Partial<AppConfig>) => void
  setConfigLoaded: (v: boolean) => void
  addCommandToHistory: (cmd: string) => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  connectionStatus: 'disconnected',
  connectedDevice: null,
  availableDevices: [],
  logcatRunning: false,
  configLoaded: false,
  config: {
    columns: DEFAULT_COLUMNS,
    logLevels: {},
    launchActivity: '',
    processFilter: false,
    scrollLock: false,
    launchParameters: [],
    advancedLaunch: DEFAULT_ADVANCED_LAUNCH_CONFIG,
    cotfServer: DEFAULT_COTF_SERVER_CONFIG,
    cotfClient: DEFAULT_COTF_CLIENT_CONFIG,
    pullLogs: DEFAULT_PULL_LOGS_CONFIG,
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
    psoDump: DEFAULT_PSO_DUMP_CONFIG,
  },
  commandHistory: [],

  setConnectionStatus: (status, device = null, devices) =>
    set((state) => ({
      connectionStatus: status,
      connectedDevice: device,
      availableDevices: devices ?? state.availableDevices,
    })),
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
