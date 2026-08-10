import { useCallback, useState } from 'react'
import { useAppStore } from '../../stores/app-store'
import { useLogStore } from '../../stores/log-store'
import styles from './StatusBar.module.css'

export default function StatusBar() {
  const connectionStatus = useAppStore((s) => s.connectionStatus)
  const connectedDevice = useAppStore((s) => s.connectedDevice)
  const availableDevices = useAppStore((s) => s.availableDevices)
  const logCount = useLogStore((s) => s.rawLines.length)
  const [switching, setSwitching] = useState(false)

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

  const handleDeviceChange = useCallback(async (serial: string) => {
    if (!serial || serial === connectedDevice) return
    setSwitching(true)
    try {
      await window.electronAPI.selectDevice(serial)
    } finally {
      setSwitching(false)
    }
  }, [connectedDevice])

  return (
    <div className={styles.bar}>
      <span className={styles.dot} style={{ color: dotColor }}>●</span>
      <select
        className={styles.deviceSelect}
        value={connectedDevice || ''}
        onChange={(event) => void handleDeviceChange(event.target.value)}
        disabled={switching || availableDevices.length === 0}
        aria-label="ADB target device"
        title="Select the ADB target used by the whole application"
      >
        {!connectedDevice && <option value="">{statusText}</option>}
        {availableDevices.map((device) => (
          <option
            key={device.serial}
            value={device.serial}
            disabled={device.state !== 'device'}
          >
            {device.serial}{device.state === 'device' ? '' : ` (${device.state})`}
          </option>
        ))}
      </select>
      {switching && <span className={styles.status}>Switching...</span>}
      <span className={styles.spacer} />
      <span className={styles.logCount}>{logCount.toLocaleString()} logs</span>
    </div>
  )
}
