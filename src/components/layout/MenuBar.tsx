import { useCallback } from 'react'
import { useAppStore } from '../../stores/app-store'
import styles from './MenuBar.module.css'

export default function MenuBar() {
  const connectionStatus = useAppStore((s) => s.connectionStatus)
  const connectedDevice = useAppStore((s) => s.connectedDevice)

  const handleOpenCapture = useCallback(() => window.electronAPI.openCaptureWindow(), [])
  const handleOpenPalette = useCallback(() => window.electronAPI.openPaletteWindow(), [])
  const handleOpenPalette2 = useCallback(() => window.electronAPI.openCommandPalette2Window(), [])
  const handleOpenPreview = useCallback(() => window.electronAPI.openPreviewWindow(), [])
  const handleOpenCotfServer = useCallback(() => window.electronAPI.openCotfServerWindow(), [])
  const handleOpenCotfClient = useCallback(() => window.electronAPI.openCotfClientWindow(), [])
  const handleOpenPullLogs = useCallback(() => window.electronAPI.openPullLogsWindow(), [])
  const handleOpenAutoTest = useCallback(() => window.electronAPI.openAutoTestWindow(), [])
  const handleOpenTextureMemory = useCallback(() => window.electronAPI.openTextureMemoryWindow(), [])
  const handleOpenStaticMeshMemory = useCallback(() => window.electronAPI.openStaticMeshMemoryWindow(), [])
  const handleOpenSkeletalMeshMemory = useCallback(() => window.electronAPI.openSkeletalMeshMemoryWindow(), [])
  const handleOpenStaticMeshComponentMemory = useCallback(() => window.electronAPI.openStaticMeshComponentMemoryWindow(), [])
  const handleOpenSettings = useCallback(() => window.electronAPI.openSettingsWindow(), [])
  const handleOpenPsoDump = useCallback(() => window.electronAPI.openPsoDumpWindow(), [])
  const handleOpenRemoteCommand = useCallback(() => window.electronAPI.openRemoteCommandWindow(), [])
  const handleOpenNiagaraDebugger = useCallback(() => window.electronAPI.openNiagaraDebuggerWindow(), [])
  const handleAdvancedLaunch = useCallback(() => {
    window.dispatchEvent(new Event('activity:advanced-launch'))
  }, [])
  const handleConnect = useCallback(async () => {
    if (connectionStatus !== 'disconnected') return
    try {
      await window.electronAPI.connect()
    } catch { /* IPC error */ }
  }, [connectionStatus])

  const isConnected = connectionStatus === 'connected'

  const dotColor =
    connectionStatus === 'connected'
      ? '#4ec9b0'
      : connectionStatus === 'connecting'
        ? '#dcdcaa'
        : '#f44747'

  return (
    <div className={styles.menuBar}>
      <div className={styles.menu}>
        <span className={styles.menuItem}>File</span>
        <div className={styles.dropdown}>
          <button className={styles.dropdownItem} onClick={handleOpenSettings}>
            Settings
          </button>
        </div>
      </div>
      <div className={styles.menu}>
        <span className={styles.menuItem}>Tools ▾</span>
        <div className={styles.dropdown}>
          <button className={styles.dropdownItem} onClick={handleOpenCapture}>
            Screen Capture
          </button>
          <button className={styles.dropdownItem} onClick={handleOpenPalette2}>
            Command Palette 2
          </button>
          <button className={styles.dropdownItem} onClick={handleOpenCotfServer}>
            COTF Server
          </button>
          <button className={styles.dropdownItem} onClick={handleOpenCotfClient}>
            COTF Client
          </button>
          <button className={styles.dropdownItem} onClick={handleOpenPullLogs}>
            Pull Logs
          </button>
          <button className={styles.dropdownItem} onClick={handleOpenAutoTest}>
            Auto Test
          </button>
          <button className={styles.dropdownItem} onClick={handleOpenPsoDump}>
            PSO Dump
          </button>
          <button className={styles.dropdownItem} onClick={handleOpenNiagaraDebugger}>
            Niagara Debugger
          </button>
          <button className={styles.dropdownItem} onClick={handleAdvancedLaunch}>
            Advanced Launch
          </button>
          <div className={styles.submenu}>
            <button className={`${styles.dropdownItem} ${styles.submenuTrigger}`} type="button">
              <span>Old</span>
              <span aria-hidden="true">›</span>
            </button>
            <div className={styles.submenuDropdown}>
              <button className={styles.dropdownItem} onClick={handleOpenPalette}>
                Command Palette
              </button>
              <button className={styles.dropdownItem} onClick={handleOpenPreview}>
                Local Preview
              </button>
              <button className={styles.dropdownItem} onClick={handleOpenRemoteCommand}>
                Remote Command Line
              </button>
            </div>
          </div>
          <div className={styles.divider} />
          <button
            className={styles.dropdownItem}
            onClick={handleConnect}
            disabled={isConnected}
          >
            {connectionStatus === 'connecting' ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
      <div className={styles.menu}>
        <span className={styles.menuItem}>Debug</span>
        <div className={styles.dropdown}>
          <button className={styles.dropdownItem} onClick={handleOpenTextureMemory}>
            Texture Memory Usage
          </button>
          <button className={styles.dropdownItem} onClick={handleOpenStaticMeshMemory}>
            Static Mesh Memory Usage
          </button>
          <button className={styles.dropdownItem} onClick={handleOpenSkeletalMeshMemory}>
            Skeletal Mesh Memory Usage
          </button>
          <button className={styles.dropdownItem} onClick={handleOpenStaticMeshComponentMemory}>
            Static Mesh Component Memory Usage
          </button>
        </div>
      </div>
      <div className={styles.title}>UE Console ADB Tool</div>
      <div className={styles.status}>
        <span style={{ color: dotColor }}>●</span>
        <span>
          {isConnected
            ? connectedDevice || 'connected'
            : connectionStatus === 'connecting'
              ? 'Connecting...'
              : 'No device'}
        </span>
      </div>
    </div>
  )
}
