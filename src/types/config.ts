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

export interface CotfClientConfig {
  activity: string
  project: string
  filehostip: string
  projects: string[]
  filehostips: string[]
}

export const DEFAULT_COTF_CLIENT_PROJECT = '../../../tankshooter/tankshooter.uproject'
export const DEFAULT_COTF_CLIENT_FILEHOSTIP = '127.0.0.1+10.183.74.12'

export const DEFAULT_COTF_CLIENT_CONFIG: CotfClientConfig = {
  activity: 'net.boomgame/com.epicgames.unreal.SplashActivity',
  project: DEFAULT_COTF_CLIENT_PROJECT,
  filehostip: DEFAULT_COTF_CLIENT_FILEHOSTIP,
  projects: [DEFAULT_COTF_CLIENT_PROJECT],
  filehostips: [DEFAULT_COTF_CLIENT_FILEHOSTIP],
}

export interface PullLogsConfig {
  androidSavedPath: string
  destinationDir: string
}

export const DEFAULT_PULL_LOGS_CONFIG: PullLogsConfig = {
  androidSavedPath: '/sdcard/Android/data/net.boomgame/files/UnrealGame/tankshooter/tankshooter/Saved/',
  destinationDir: './',
}

export interface AdvancedLaunchRow {
  id: string
  enabled: boolean
  value: string
}

export interface AdvancedLaunchConfig {
  activity: string
  direct: AdvancedLaunchRow[]
  execCmds: AdvancedLaunchRow[]
  dpcvars: AdvancedLaunchRow[]
}

export const DEFAULT_ADVANCED_LAUNCH_ACTIVITY =
  'net.boomgame/com.epicgames.unreal.SplashActivity'

export const DEFAULT_ADVANCED_LAUNCH_CONFIG: AdvancedLaunchConfig = {
  activity: DEFAULT_ADVANCED_LAUNCH_ACTIVITY,
  direct: [
    { id: 'direct-opengl', enabled: false, value: '-opengl' },
  ],
  execCmds: [
    { id: 'exec-stat-fps', enabled: false, value: 'stat fps' },
    { id: 'exec-stat-fps-unit', enabled: false, value: 'stat fps,stat unit' },
    { id: 'exec-toggle-force-default-material', enabled: false, value: 'ToggleForceDefaultMaterial' },
  ],
  dpcvars: [
    { id: 'dpcvars-material-quality-aa', enabled: false, value: 'r.MaterialQualityLevel=2,r.Mobile.AntiAliasing=2' },
    { id: 'dpcvars-foliage-density-cull', enabled: false, value: 'foliage.DensityScale=0,foliage.DisableCull=1' },
    { id: 'dpcvars-mobile-content-scale', enabled: false, value: 'r.MobileContentScaleFactor=1' },
    { id: 'dpcvars-screen-percentage', enabled: false, value: 'r.screenpercentage=60' },
    { id: 'dpcvars-reduce-loaded-mips-a', enabled: false, value: 'r.MobileReduceLoadedMips=3' },
    { id: 'dpcvars-stats-max-per-group', enabled: false, value: 'stats.maxpergroup=12' },
    { id: 'dpcvars-reduce-loaded-mips-b', enabled: false, value: 'r.MobileReduceLoadedMips=3' },
    { id: 'dpcvars-discard-load-data', enabled: false, value: 'ts.system.decorationlevel.discardloaddata=1' },
    { id: 'dpcvars-simplified-hud', enabled: false, value: 'ts.system.SimplifiedHUD=1' },
    { id: 'dpcvars-swappy-frame-pacing', enabled: false, value: 'a.UseSwappyForFramePacing=0' },
    { id: 'dpcvars-overall-tier-quality', enabled: false, value: 'sg.OverallTierQuality=0' },
    { id: 'dpcvars-scene-pixel-count-50', enabled: false, value: 'Android.3DSceneMaxDesiredPixelCount=50' },
    { id: 'dpcvars-window-dpi-360', enabled: false, value: 'Android.WindowDPI=360' },
    { id: 'dpcvars-window-dpi-scene-pixel-count', enabled: false, value: 'Android.WindowDPI=180,Android.3DSceneMaxDesiredPixelCount=230400' },
    { id: 'dpcvars-mobile-desired-res-y', enabled: false, value: 'r.Mobile.DesiredResY=360' },
    { id: 'dpcvars-software-occlusion-culling', enabled: false, value: 'r.SoftwareOcclusionCulling.Enable=0' },
    { id: 'dpcvars-niagara-component-pool', enabled: false, value: 'FX.NiagaraComponentPool.Enable=20' },
    { id: 'dpcvars-pso-cache', enabled: false, value: 'r.ShaderPipelineCache.StartupMode=0,r.Vulkan.AllowPSOPrecaching=0,r.Vulkan.UseChunkedPSOCache=0' },
  ],
}

export interface AppConfig {
  columns: ColumnDef[]
  logLevels: Record<string, boolean>
  launchActivity: string
  processFilter: boolean
  scrollLock: boolean
  launchParameters: string[]
  advancedLaunch: AdvancedLaunchConfig
  cotfServer: CotfServerConfig
  cotfClient: CotfClientConfig
  pullLogs: PullLogsConfig
}
