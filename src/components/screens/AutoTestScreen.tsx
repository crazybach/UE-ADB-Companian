import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearAutoTestCheckpoint,
  loadAutoTestCheckpoint,
  saveAutoTestCheckpoint,
  type AutoTestCheckpointScope,
} from '../../services/auto-test-checkpoint'
import styles from './AutoTestScreen.module.css'

interface AutoTestUiRow extends AutoTestRow {
  done: boolean
  status: 'pending' | 'success' | 'failed'
}

export default function AutoTestScreen() {
  const [connectionMode, setConnectionMode] = useState<'adb' | 'wifi'>('adb')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('24002')
  const [filePath, setFilePath] = useState('')
  const [rows, setRows] = useState<AutoTestUiRow[]>([])
  const [running, setRunning] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [statusText, setStatusText] = useState('No CSV loaded.')
  const [lockScroll, setLockScroll] = useState(false)
  const [checkpointIndex, setCheckpointIndex] = useState<number | null>(null)
  const [pauseRequested, setPauseRequested] = useState(false)
  const activeRowRef = useRef<HTMLTableRowElement>(null)
  const runningRef = useRef(false)
  const pauseRequestedRef = useRef(false)
  const cancelWaitRef = useRef<(() => void) | null>(null)
  const checkpointScope: AutoTestCheckpointScope = connectionMode === 'adb' ? 'adb' : 'remote'
  const portNumber = Number(port)
  const remoteTargetValid = host.trim().length > 0
    && /^\d+$/.test(port)
    && portNumber >= 1
    && portNumber <= 65535
  const targetValid = connectionMode === 'adb' || remoteTargetValid

  useEffect(() => {
    if (!running || lockScroll || currentIndex === 0) return
    activeRowRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [currentIndex, lockScroll, running])

  useEffect(() => () => {
    pauseRequestedRef.current = true
    cancelWaitRef.current?.()
  }, [])

  const waitForInterval = useCallback((ms: number) => new Promise<void>((resolve) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      cancelWaitRef.current = null
      resolve()
    }
    const timer = setTimeout(finish, ms)
    cancelWaitRef.current = () => {
      clearTimeout(timer)
      finish()
    }
  }), [])

  const handleOpenCsv = useCallback(async () => {
    if (running) return

    setStatusText('Opening CSV...')

    try {
      const result = await window.electronAPI.openAutoTestCsv()
      if (result.canceled) {
        setStatusText(filePath ? 'CSV load canceled.' : 'No CSV loaded.')
        return
      }

      if (result.error) {
        setStatusText(result.error)
        setRows([])
        setFilePath(result.path || '')
        setCurrentIndex(0)
        setCheckpointIndex(null)
        return
      }

      const nextRows = (result.rows || []).map((row) => ({
        ...row,
        done: false,
        status: 'pending' as const,
      }))

      const nextFilePath = result.path || ''
      const savedCheckpoint = loadAutoTestCheckpoint(checkpointScope, nextFilePath, nextRows.length)
      const restoredRows = nextRows.map((row, index) => index < (savedCheckpoint || 0)
        ? { ...row, done: true, status: 'success' as const }
        : row)

      setFilePath(nextFilePath)
      setRows(restoredRows)
      setCheckpointIndex(savedCheckpoint)
      setCurrentIndex(savedCheckpoint || 0)
      setStatusText(savedCheckpoint !== null
        ? `Loaded ${nextRows.length} command rows. Continue from row ${savedCheckpoint + 1}.`
        : nextRows.length > 0
          ? `Loaded ${nextRows.length} command rows.`
        : 'CSV loaded, no runnable command rows found.')
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Failed to open CSV.')
    }
  }, [checkpointScope, filePath, running])

  const handleConnectionModeChange = useCallback((mode: 'adb' | 'wifi') => {
    if (running || mode === connectionMode) return
    setConnectionMode(mode)
    if (!filePath || rows.length === 0) return

    const nextScope: AutoTestCheckpointScope = mode === 'adb' ? 'adb' : 'remote'
    const savedCheckpoint = loadAutoTestCheckpoint(nextScope, filePath, rows.length)
    setRows((current) => current.map((row, index) => index < (savedCheckpoint || 0)
      ? { ...row, done: true, status: 'success' }
      : { ...row, done: false, status: 'pending' }))
    setCheckpointIndex(savedCheckpoint)
    setCurrentIndex(savedCheckpoint || 0)
    setStatusText(savedCheckpoint !== null
      ? `Switched to ${mode === 'adb' ? 'ADB' : 'WiFi'}. Continue from row ${savedCheckpoint + 1}.`
      : `Switched to ${mode === 'adb' ? 'ADB' : 'WiFi'}. Ready to restart.`)
  }, [connectionMode, filePath, rows.length, running])

  const markRowDone = useCallback((index: number, success: boolean) => {
    setRows((current) => current.map((row, rowIndex) => (
      rowIndex === index
        ? { ...row, done: true, status: success ? 'success' : 'failed' }
        : row
    )))
  }, [])

  const pauseAtCheckpoint = useCallback((nextIndex: number) => {
    saveAutoTestCheckpoint(checkpointScope, filePath, nextIndex)
    setCheckpointIndex(nextIndex)
    setCurrentIndex(nextIndex)
    setPauseRequested(false)
    pauseRequestedRef.current = false
    runningRef.current = false
    setRunning(false)
    setStatusText(`Paused. Continue from row ${nextIndex + 1}/${rows.length}.`)
  }, [checkpointScope, filePath, rows.length])

  const runFrom = useCallback(async (startIndex: number, restart: boolean) => {
    if (runningRef.current || rows.length === 0 || !targetValid) return

    let operationDevice: string | null = null
    if (connectionMode === 'adb') {
      try {
        operationDevice = (await window.electronAPI.getConnectionStatus()).device
      } catch {
        setStatusText('Failed to read the selected ADB device.')
        return
      }
      if (!operationDevice) {
        setStatusText('No ADB device is selected.')
        return
      }
    }

    runningRef.current = true
    pauseRequestedRef.current = false
    setPauseRequested(false)
    setRunning(true)
    setCurrentIndex(startIndex)
    if (restart) {
      clearAutoTestCheckpoint(checkpointScope, filePath)
      setCheckpointIndex(null)
      setStatusText(`${connectionMode === 'adb' ? 'ADB' : 'WiFi'} auto test restarted.`)
    } else {
      setStatusText(`Continuing from row ${startIndex + 1}.`)
    }
    setRows((current) => current.map((row, index) => index < startIndex
      ? { ...row, done: true, status: 'success' }
      : { ...row, done: false, status: 'pending' }))

    for (let index = startIndex; index < rows.length; index += 1) {
      const row = rows[index]
      setCurrentIndex(index + 1)
      setStatusText(`Running ${index + 1}/${rows.length}: ${row.command}`)

      try {
        const result = connectionMode === 'adb'
          ? await window.electronAPI.runAutoTestCommand(row.command, operationDevice)
          : await window.electronAPI.sendRemoteCommand(host, port, row.command)
        const errorText = 'stderr' in result
          ? result.error || result.stderr
          : result.error || result.response
        markRowDone(index, result.success)
        setStatusText(result.success
          ? `Completed ${index + 1}/${rows.length}.`
          : `Command ${index + 1} failed: ${errorText || 'Unknown error.'}`)
      } catch (error) {
        markRowDone(index, false)
        setStatusText(error instanceof Error
          ? `Command ${index + 1} failed: ${error.message}`
          : `Command ${index + 1} failed.`)
      }

      const nextIndex = index + 1
      if (nextIndex < rows.length && pauseRequestedRef.current) {
        pauseAtCheckpoint(nextIndex)
        return
      }

      if (nextIndex < rows.length && row.waitSeconds > 0) {
        setStatusText(`Waiting ${row.waitSeconds}s before next command.`)
        await waitForInterval(row.waitSeconds * 1000)
        if (pauseRequestedRef.current) {
          pauseAtCheckpoint(nextIndex)
          return
        }
      }
    }

    clearAutoTestCheckpoint(checkpointScope, filePath)
    setCheckpointIndex(null)
    setCurrentIndex(rows.length)
    setStatusText(`Auto test complete. ${rows.length}/${rows.length}`)
    runningRef.current = false
    setRunning(false)
  }, [checkpointScope, connectionMode, filePath, host, markRowDone, pauseAtCheckpoint, port, rows, targetValid, waitForInterval])

  const handlePauseOrContinue = useCallback(() => {
    if (running) {
      if (pauseRequestedRef.current) return
      pauseRequestedRef.current = true
      setPauseRequested(true)
      setStatusText('Pausing after the current command...')
      cancelWaitRef.current?.()
      return
    }
    if (checkpointIndex !== null) void runFrom(checkpointIndex, false)
  }, [checkpointIndex, runFrom, running])

  const handleRestart = useCallback(() => {
    void runFrom(0, true)
  }, [runFrom])

  return (
    <div className={styles.container}>
      <div className={styles.header}>Auto Test</div>

      <section className={styles.connectionSection}>
        <div className={styles.sectionTitle}>Connection Mode</div>
        <div className={styles.connectionGrid}>
          <div className={styles.segmented}>
            <button
              className={connectionMode === 'adb' ? styles.activeSegment : undefined}
              onClick={() => handleConnectionModeChange('adb')}
              disabled={running}
              type="button"
            >
              ADB
            </button>
            <button
              className={connectionMode === 'wifi' ? styles.activeSegment : undefined}
              onClick={() => handleConnectionModeChange('wifi')}
              disabled={running}
              type="button"
            >
              WiFi
            </button>
          </div>
          <label className={styles.hostField}>
            <span>Device IP</span>
            <input
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="10.183.74.103"
              disabled={running || connectionMode === 'adb'}
              spellCheck={false}
            />
          </label>
          <label className={styles.portField}>
            <span>Port</span>
            <input
              value={port}
              onChange={(event) => setPort(event.target.value)}
              inputMode="numeric"
              disabled={running || connectionMode === 'adb'}
              spellCheck={false}
            />
          </label>
        </div>
      </section>

      <div className={styles.fileRow}>
        <input
          className={styles.filePath}
          type="text"
          value={filePath}
          readOnly
          placeholder="Choose a CSV file..."
          spellCheck={false}
        />
        <button className={styles.secondaryBtn} onClick={handleOpenCsv} disabled={running}>
          Open
        </button>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.doneCol}>Done</th>
              <th className={styles.indexCol}>#</th>
              <th>Command</th>
              <th className={styles.waitCol}>Wait Seconds</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={`${row.id}-${index}`}
                ref={index + 1 === currentIndex ? activeRowRef : null}
                className={index + 1 === currentIndex && running ? styles.activeRow : undefined}
              >
                <td className={styles.doneCol}>
                  <input type="checkbox" checked={row.done} readOnly />
                </td>
                <td className={styles.indexCol}>{index + 1}</td>
                <td className={styles.commandCell}>{row.command}</td>
                <td className={styles.waitCol}>{row.waitSeconds}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className={styles.empty}>No command rows loaded.</div>
        )}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerStatus}>
          <span>{currentIndex}/{rows.length}</span>
          <span className={styles.statusText}>{statusText}</span>
        </div>
        <div className={styles.footerActions}>
          <label className={styles.scrollLock}>
            <input
              type="checkbox"
              checked={lockScroll}
              onChange={(event) => setLockScroll(event.target.checked)}
            />
            <span>Lock Scroll</span>
          </label>
          <button
            className={styles.secondaryBtn}
            onClick={handlePauseOrContinue}
            disabled={rows.length === 0
              || !targetValid
              || (running ? pauseRequested : checkpointIndex === null)}
          >
            {running ? (pauseRequested ? 'Pausing...' : 'Pause') : 'Continue'}
          </button>
          <button
            className={styles.startBtn}
            onClick={handleRestart}
            disabled={running || rows.length === 0 || !targetValid}
          >
            Restart
          </button>
        </div>
      </div>
    </div>
  )
}
