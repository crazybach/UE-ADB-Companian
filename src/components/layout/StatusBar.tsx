import { useAppStore } from '../../stores/app-store'
import { useLogStore } from '../../stores/log-store'
import styles from './StatusBar.module.css'

export default function StatusBar() {
  const connectionStatus = useAppStore((s) => s.connectionStatus)
  const connectedDevice = useAppStore((s) => s.connectedDevice)
  const logCount = useLogStore((s) => s.rawLines.length)

  const dotColor =
    connectionStatus === 'connected'
      ? '#4ec9b0'
      : connectionStatus === 'connecting'
        ? '#dcdcaa'
        : '#f44747'

  const statusText =
    connectionStatus === 'connected'
      ? `Connected: ${connectedDevice || 'device'}`
      : connectionStatus === 'connecting'
        ? 'Connecting...'
        : 'No device'

  return (
    <div className={styles.bar}>
      <span className={styles.dot} style={{ color: dotColor }}>●</span>
      <span className={styles.status}>{statusText}</span>
      <span className={styles.spacer} />
      <span className={styles.logCount}>{logCount.toLocaleString()} logs</span>
    </div>
  )
}
