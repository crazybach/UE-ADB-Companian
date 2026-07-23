import { useCallback, useState } from 'react'
import styles from './AutoTestScreen.module.css'
import remoteStyles from './RemoteAutoTestScreen.module.css'

interface RemoteAutoTestUiRow extends AutoTestRow {
  done: boolean
  status: 'pending' | 'success' | 'failed'
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default function RemoteAutoTestScreen() {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('24002')
  const [filePath, setFilePath] = useState('')
  const [rows, setRows] = useState<RemoteAutoTestUiRow[]>([])
  const [running, setRunning] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [statusText, setStatusText] = useState('No CSV loaded.')

  const handleOpenCsv = useCallback(async () => {
    if (running) return
    setStatusText('Opening CSV...')

    try {
      const result = await window.electronAPI.openRemoteAutoTestCsv()
      if (result.canceled) {
        setStatusText(filePath ? 'CSV load canceled.' : 'No CSV loaded.')
        return
      }
      if (result.error) {
        setStatusText(result.error)
        setRows([])
        setFilePath(result.path || '')
        setCurrentIndex(0)
        return
      }

      const nextRows = (result.rows || []).map((row) => ({
        ...row,
        done: false,
        status: 'pending' as const,
      }))
      setFilePath(result.path || '')
      setRows(nextRows)
      setCurrentIndex(0)
      setStatusText(nextRows.length > 0
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

  const handleStart = useCallback(async () => {
    if (running || rows.length === 0 || !host.trim()) return

    setRunning(true)
    setCurrentIndex(0)
    setStatusText('Remote auto test started.')
    setRows((current) => current.map((row) => ({ ...row, done: false, status: 'pending' })))

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      setCurrentIndex(index + 1)
      setStatusText(`Running ${index + 1}/${rows.length}: ${row.command}`)

      try {
        const result = await window.electronAPI.sendRemoteCommand(host, port, row.command)
        markRowDone(index, result.success)
        setStatusText(result.success
          ? `Completed ${index + 1}/${rows.length}.`
          : `Command ${index + 1} failed: ${result.error || result.response || 'Unknown error.'}`)
      } catch (error) {
        markRowDone(index, false)
        setStatusText(error instanceof Error
          ? `Command ${index + 1} failed: ${error.message}`
          : `Command ${index + 1} failed.`)
      }

      if (index < rows.length - 1 && row.waitSeconds > 0) {
        setStatusText(`Waiting ${row.waitSeconds}s before next command.`)
        await wait(row.waitSeconds * 1000)
      }
    }

    setCurrentIndex(rows.length)
    setStatusText(`Remote auto test complete. ${rows.length}/${rows.length}`)
    setRunning(false)
  }, [host, markRowDone, port, rows, running])

  const portNumber = Number(port)
  const targetValid = host.trim().length > 0
    && /^\d+$/.test(port)
    && portNumber >= 1
    && portNumber <= 65535

  return (
    <div className={styles.container}>
      <div className={styles.header}>Remote Auto Test</div>

      <div className={remoteStyles.connectionRow}>
        <label className={remoteStyles.hostField}>
          <span>Device IP</span>
          <input
            type="text"
            value={host}
            onChange={(event) => setHost(event.target.value)}
            placeholder="10.183.74.103"
            disabled={running}
            spellCheck={false}
          />
        </label>
        <label className={remoteStyles.portField}>
          <span>Port</span>
          <input
            type="text"
            inputMode="numeric"
            value={port}
            onChange={(event) => setPort(event.target.value)}
            disabled={running}
            spellCheck={false}
          />
        </label>
      </div>

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

        {rows.length === 0 && <div className={styles.empty}>No command rows loaded.</div>}
      </div>

      <div className={styles.footer}>
        <div className={styles.footerStatus}>
          <span>{currentIndex}/{rows.length}</span>
          <span className={styles.statusText}>{statusText}</span>
        </div>
        <button
          className={styles.startBtn}
          onClick={handleStart}
          disabled={running || rows.length === 0 || !targetValid}
        >
          {running ? 'Running...' : 'Start'}
        </button>
      </div>
    </div>
  )
}
