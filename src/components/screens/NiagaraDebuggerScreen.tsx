import { useCallback, useState } from 'react'
import {
  buildNiagaraSpawnCommand,
  type NiagaraLocationMode,
} from '../../services/niagara-debug'
import styles from './NiagaraDebuggerScreen.module.css'

type ConnectionMode = 'adb' | 'wifi'

const DEBUG_MODES = [
  { value: '0', label: 'Off' },
  { value: '1', label: 'Overview' },
  { value: '2', label: 'Scalability' },
  { value: '3', label: 'Performance' },
  { value: '4', label: 'Performance Graph' },
  { value: '5', label: 'GPU Compute Performance' },
]

export default function NiagaraDebuggerScreen() {
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('adb')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('24002')
  const [debugMode, setDebugMode] = useState('0')
  const [debugCamera, setDebugCamera] = useState(false)
  const [assetFile, setAssetFile] = useState('')
  const [systemPath, setSystemPath] = useState('')
  const [attachToPlayer, setAttachToPlayer] = useState(true)
  const [autoDestroy, setAutoDestroy] = useState(true)
  const [autoActivate, setAutoActivate] = useState(true)
  const [preCullCheck, setPreCullCheck] = useState(true)
  const [locationMode, setLocationMode] = useState<NiagaraLocationMode>('player')
  const [location, setLocation] = useState<[string, string, string]>(['2000', '0', '0'])
  const [combinedCommand, setCombinedCommand] = useState('')
  const [status, setStatus] = useState('Ready')
  const [sending, setSending] = useState(false)

  const sendCommand = useCallback(async (command: string) => {
    if (sending) return false
    if (connectionMode === 'wifi' && !host.trim()) {
      setStatus('Enter a device IP address for WiFi mode.')
      return false
    }

    setSending(true)
    setStatus(`Sending: ${command}`)
    try {
      if (connectionMode === 'adb') {
        const result = await window.electronAPI.sendCommand(command)
        if (!result.success) throw new Error(result.error || 'ADB command failed.')
      } else {
        const result = await window.electronAPI.sendRemoteCommand(host, port, command)
        if (!result.success) throw new Error(result.error || result.response || 'Remote command failed.')
      }
      setStatus(`Sent: ${command}`)
      return true
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to send command.')
      return false
    } finally {
      setSending(false)
    }
  }, [connectionMode, host, port, sending])

  const handleDebugModeChange = useCallback((value: string) => {
    setDebugMode(value)
    void sendCommand(`NiagaraDebugHud ${value}`)
  }, [sendCommand])

  const handleDebugCameraChange = useCallback((checked: boolean) => {
    setDebugCamera(checked)
    void sendCommand(`toggledebugcamera ${checked ? 1 : 0}`)
  }, [sendCommand])

  const handleOpenAsset = useCallback(async () => {
    try {
      const result = await window.electronAPI.selectNiagaraAsset()
      if (result.canceled) return
      if (result.path) setAssetFile(result.path)
      if (result.error) {
        setStatus(result.error)
        return
      }
      setSystemPath(result.systemPath || '')
      setCombinedCommand('')
      setStatus('Niagara system selected.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to select Niagara asset.')
    }
  }, [])

  const updateLocation = (index: number, value: string) => {
    setLocation((current) => current.map((item, itemIndex) => (
      itemIndex === index ? value : item
    )) as [string, string, string])
  }

  const combine = useCallback(() => {
    try {
      const command = buildNiagaraSpawnCommand({
        systemPath,
        attachToPlayer,
        autoDestroy,
        autoActivate,
        preCullCheck,
        locationMode,
        location,
      })
      setCombinedCommand(command)
      setStatus('Preview command combined.')
      return command
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to combine command.')
      return null
    }
  }, [attachToPlayer, autoActivate, autoDestroy, location, locationMode, preCullCheck, systemPath])

  const handlePreview = useCallback(() => {
    const command = combine()
    if (command) void sendCommand(command)
  }, [combine, sendCommand])

  const handleClear = useCallback(() => {
    void sendCommand('fx.Niagara.Debug.KillSpawned')
  }, [sendCommand])

  return (
    <div className={styles.container}>
      <header className={styles.header}>Niagara Debugger</header>

      <main className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Connection Mode</div>
          <div className={styles.connectionGrid}>
            <div className={styles.segmented}>
              <button
                className={connectionMode === 'adb' ? styles.activeSegment : undefined}
                onClick={() => setConnectionMode('adb')}
                type="button"
              >
                ADB
              </button>
              <button
                className={connectionMode === 'wifi' ? styles.activeSegment : undefined}
                onClick={() => setConnectionMode('wifi')}
                type="button"
              >
                WiFi
              </button>
            </div>
            <label className={styles.field}>
              <span>Device IP</span>
              <input
                value={host}
                onChange={(event) => setHost(event.target.value)}
                placeholder="10.183.74.103"
                disabled={connectionMode === 'adb'}
                spellCheck={false}
              />
            </label>
            <label className={styles.portField}>
              <span>Port</span>
              <input
                value={port}
                onChange={(event) => setPort(event.target.value)}
                inputMode="numeric"
                disabled={connectionMode === 'adb'}
                spellCheck={false}
              />
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Niagara Debugger</div>
          <div className={styles.debugControls}>
            <label className={styles.modeField}>
              <span>Mode</span>
              <select
                value={debugMode}
                onChange={(event) => handleDebugModeChange(event.target.value)}
                disabled={sending}
              >
                {DEBUG_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.value} - {mode.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.checkField}>
              <input
                type="checkbox"
                checked={debugCamera}
                onChange={(event) => handleDebugCameraChange(event.target.checked)}
                disabled={sending}
              />
              <span>Debug Camera</span>
            </label>
          </div>
        </section>

        <section className={`${styles.section} ${styles.previewSection}`}>
          <div className={styles.sectionTitle}>Niagara Preview</div>

          <div className={styles.assetRow}>
            <label className={styles.field}>
              <span>Asset File</span>
              <input value={assetFile} readOnly placeholder="Choose a Niagara .uasset..." />
            </label>
            <button className={styles.secondaryButton} onClick={handleOpenAsset} type="button">
              Open
            </button>
          </div>

          <label className={styles.field}>
            <span>System Name</span>
            <input
              value={systemPath}
              onChange={(event) => setSystemPath(event.target.value)}
              placeholder="/Game/VFX/System.System"
              spellCheck={false}
            />
          </label>

          <div className={styles.optionsRow}>
            <label><input type="checkbox" checked={attachToPlayer} onChange={(event) => setAttachToPlayer(event.target.checked)} /> AttachToPlayer</label>
            <label><input type="checkbox" checked={autoDestroy} onChange={(event) => setAutoDestroy(event.target.checked)} /> AutoDestroy</label>
            <label><input type="checkbox" checked={autoActivate} onChange={(event) => setAutoActivate(event.target.checked)} /> AutoActivate</label>
            <label><input type="checkbox" checked={preCullCheck} onChange={(event) => setPreCullCheck(event.target.checked)} /> PreCullCheck</label>
          </div>

          <div className={styles.locationRow}>
            <div className={styles.segmented}>
              <button className={locationMode === 'none' ? styles.activeSegment : undefined} onClick={() => setLocationMode('none')} type="button">Off</button>
              <button className={locationMode === 'location' ? styles.activeSegment : undefined} onClick={() => setLocationMode('location')} type="button">Location</button>
              <button className={locationMode === 'player' ? styles.activeSegment : undefined} onClick={() => setLocationMode('player')} type="button">From Player</button>
            </div>
            {['X', 'Y', 'Z'].map((axis, index) => (
              <label className={styles.axisField} key={axis}>
                <span>{axis}</span>
                <input
                  type="number"
                  value={location[index]}
                  onChange={(event) => updateLocation(index, event.target.value)}
                  disabled={locationMode === 'none'}
                />
              </label>
            ))}
          </div>

          <label className={styles.field}>
            <span>Command Preview</span>
            <textarea value={combinedCommand} readOnly />
          </label>

          <div className={styles.actions}>
            <button className={styles.secondaryButton} onClick={combine} type="button">Combine</button>
            <button className={styles.secondaryButton} onClick={handleClear} disabled={sending} type="button">
              Clear
            </button>
            <button className={styles.primaryButton} onClick={handlePreview} disabled={sending} type="button">
              {sending ? 'Sending...' : 'Preview'}
            </button>
          </div>
        </section>
      </main>

      <footer className={styles.status}>{status}</footer>
    </div>
  )
}
