import type { ColumnDef } from './log'

export interface CotfServerConfig {
  ueCmdBinary: string
  projectPath: string
  abslogDir: string
  fixedArgs: string
}

export const DEFAULT_COTF_SERVER_CONFIG: CotfServerConfig = {
  ueCmdBinary: 'D:\\workspace\\client_dev\\UnrealEngine\\Engine\\Binaries\\Win64\\UnrealEditor-Cmd.exe',
  projectPath: 'D:\\workspace\\client_dev\\boom\\client5\\tankshooter.uproject',
  abslogDir: 'C:\\Users\\j_ma2\\AppData\\Local\\Temp\\D+workspace+client_dev+UnrealEngine\\Logs',
  fixedArgs: '-run=cook -cookonthefly -unattended -CrashForUAT -AllowStdOutLogVerbosity -ddc=DerivedDataBackendGraph -unversioned -iterate',
}

export interface AppConfig {
  columns: ColumnDef[]
  logLevels: Record<string, boolean>
  launchActivity: string
  processFilter: boolean
  scrollLock: boolean
  launchParameters: string[]
  cotfServer: CotfServerConfig
}
