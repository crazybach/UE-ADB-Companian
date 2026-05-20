import { useEffect, useState } from 'react'
import {
  DEFAULT_PULL_LOGS_CONFIG,
  type AppConfig,
  type PullLogsConfig,
} from '../../types/config'
import styles from './PullLogsScreen.module.css'

type FieldName = keyof PullLogsConfig

export default function PullLogsScreen() {
  const [config, setConfig] = useState<PullLogsConfig>(DEFAULT_PULL_LOGS_CONFIG)
  const [loaded, setLoaded] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState('')
  const [destinationPath, setDestinationPath] = useState('')
  const [lastCommand, setLastCommand] = useState('')
  const [output, setOutput] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      try {
        const saved = await window.electronAPI.configLoad() as Partial<AppConfig>
        if (!cancelled) {
          setConfig({
            ...DEFAULT_PULL_LOGS_CONFIG,
            ...saved.pullLogs,
          })
        }
      } catch {
        if (!cancelled) {
          setConfig(DEFAULT_PULL_LOGS_CONFIG)
        }
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    loadConfig()

    return () => {
      cancelled = true
    }
  }, [])

  const handleChange = (field: FieldName, value: string) => {
    setConfig((current) => ({
      ...current,
      [field]: value,
    }))
  }

  const handlePull = async () => {
    setPulling(true)
    setError('')
    setDestinationPath('')
    setLastCommand('')
    setOutput('')

    try {
      await window.electronAPI.configSave({ pullLogs: config })
      const result = await window.electronAPI.pullLogs(config)

      if (!result.success) {
        setError(result.error || 'Failed to pull logs.')
        setDestinationPath(result.data?.destinationPath || '')
        setLastCommand(result.data?.command || '')
        setOutput([result.data?.stdout, result.data?.stderr].filter(Boolean).join('\n'))
        return
      }

      const explorerError = result.data?.explorerError
        ? `Explorer: ${result.data.explorerError}`
        : ''

      setDestinationPath(result.data?.destinationPath || '')
      setLastCommand(result.data?.command || '')
      setOutput([result.data?.stdout, result.data?.stderr, explorerError].filter(Boolean).join('\n'))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pull logs.')
    } finally {
      setPulling(false)
    }
  }

  if (!loaded) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>Pull Logs</div>
        <div className={styles.loading}>Loading...</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>Pull Logs</div>

      <div className={styles.content}>
        <label className={styles.field}>
          <span>Android Saved Path</span>
          <input
            className={styles.input}
            type="text"
            value={config.androidSavedPath}
            onChange={(event) => handleChange('androidSavedPath', event.target.value)}
            spellCheck={false}
          />
        </label>

        <label className={styles.field}>
          <span>Destination Folder</span>
          <input
            className={styles.input}
            type="text"
            value={config.destinationDir}
            onChange={(event) => handleChange('destinationDir', event.target.value)}
            spellCheck={false}
          />
        </label>

        {error && <div className={styles.error}>{error}</div>}

        {destinationPath && (
          <div className={styles.result}>
            <div className={styles.resultLabel}>Destination</div>
            <div className={styles.resultValue}>{destinationPath}</div>
          </div>
        )}

        {lastCommand && (
          <div className={styles.result}>
            <div className={styles.resultLabel}>Command</div>
            <div className={styles.resultValue}>{lastCommand}</div>
          </div>
        )}

        {output && (
          <div className={styles.result}>
            <div className={styles.resultLabel}>Output</div>
            <pre className={styles.output}>{output}</pre>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <button className={styles.pullBtn} onClick={handlePull} disabled={pulling}>
          {pulling ? 'Pulling...' : 'Pull'}
        </button>
      </div>
    </div>
  )
}
