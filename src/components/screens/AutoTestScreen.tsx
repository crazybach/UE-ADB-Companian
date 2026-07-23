import { useCallback, useEffect, useRef, useState } from 'react'
import {
  clearAutoTestCheckpoint,
  loadAutoTestCheckpoint,
  saveAutoTestCheckpoint,
} from '../../services/auto-test-checkpoint'
import styles from './AutoTestScreen.module.css'

interface AutoTestUiRow extends AutoTestRow {
  done: boolean
  status: 'pending' | 'success' | 'failed'
}

export default function AutoTestScreen() {
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
      const savedCheckpoint = loadAutoTestCheckpoint('adb', nextFilePath, nextRows.length)
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
  }, [filePath, running])

  const markRowDone = useCallback((index: number, success: boolean) => {
    setRows((current) => current.map((row, rowIndex) => (
      rowIndex === index
        ? { ...row, done: true, status: success ? 'success' : 'failed' }
        : row
    )))
  }, [])

  const pauseAtCheckpoint = useCallback((nextIndex: number) => {
    saveAutoTestCheckpoint('adb', filePath, nextIndex)
    setCheckpointIndex(nextIndex)
    setCurrentIndex(nextIndex)
    setPauseRequested(false)
    pauseRequestedRef.current = false
    runningRef.current = false
    setRunning(false)
    setStatusText(`Paused. Continue from row ${nextIndex + 1}/${rows.length}.`)
  }, [filePath, rows.length])

  const runFrom = useCallback(async (startIndex: number, restart: boolean) => {
    if (runningRef.current || rows.length === 0) return

    runningRef.current = true
    pauseRequestedRef.current = false
    setPauseRequested(false)
    setRunning(true)
    setCurrentIndex(startIndex)
    if (restart) {
      clearAutoTestCheckpoint('adb', filePath)
      setCheckpointIndex(null)
      setStatusText('Auto test restarted.')
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
        const result = await window.electronAPI.runAutoTestCommand(row.command)
        markRowDone(index, result.success)
        setStatusText(result.success
          ? `Completed ${index + 1}/${rows.length}.`
          : `Command ${index + 1} failed: ${result.error || result.stderr || 'Unknown error.'}`)
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

    clearAutoTestCheckpoint('adb', filePath)
    setCheckpointIndex(null)
    setCurrentIndex(rows.length)
    setStatusText(`Auto test complete. ${rows.length}/${rows.length}`)
    runningRef.current = false
    setRunning(false)
  }, [filePath, markRowDone, pauseAtCheckpoint, rows, running, waitForInterval])

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
            disabled={rows.length === 0 || (running ? pauseRequested : checkpointIndex === null)}
          >
            {running ? (pauseRequested ? 'Pausing...' : 'Pause') : 'Continue'}
          </button>
          <button
            className={styles.startBtn}
            onClick={handleRestart}
            disabled={running || rows.length === 0}
          >
            Restart
          </button>
        </div>
      </div>
    </div>
  )
}
