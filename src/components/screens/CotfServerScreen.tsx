import { useEffect, useState } from 'react'
import {
  DEFAULT_COTF_SERVER_CONFIG,
  type AppConfig,
  type CotfServerConfig,
} from '../../types/config'
import styles from './CotfServerScreen.module.css'

type FieldName = keyof CotfServerConfig

export default function CotfServerScreen() {
  const [config, setConfig] = useState<CotfServerConfig>(DEFAULT_COTF_SERVER_CONFIG)
  const [loaded, setLoaded] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState('')
  const [lastAbslogPath, setLastAbslogPath] = useState('')
  const [lastLauncherPath, setLastLauncherPath] = useState('')
  const [lastCommand, setLastCommand] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      try {
        const saved = await window.electronAPI.configLoad() as Partial<AppConfig>
        if (!cancelled) {
          setConfig({
            ...DEFAULT_COTF_SERVER_CONFIG,
            ...saved.cotfServer,
          })
        }
      } catch {
        if (!cancelled) {
          setConfig(DEFAULT_COTF_SERVER_CONFIG)
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

  const handleLaunch = async () => {
    setLaunching(true)
    setError('')
    setLastAbslogPath('')
    setLastLauncherPath('')
    setLastCommand('')

    try {
      await window.electronAPI.configSave({ cotfServer: config })
      const result = await window.electronAPI.launchCotfServer(config)

      if (!result.success) {
        setError(result.error || 'Failed to launch COTF server.')
        return
      }

      setLastAbslogPath(result.data?.abslogPath || '')
      setLastLauncherPath(result.data?.launcherPath || '')
      setLastCommand(result.data?.command || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch COTF server.')
    } finally {
      setLaunching(false)
    }
  }

  if (!loaded) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>COTF Server</div>
        <div className={styles.loading}>Loading...</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>COTF Server</div>

      <div className={styles.content}>
        <label className={styles.field}>
          <span>UE Cmd Binary</span>
          <input
            className={styles.input}
            type="text"
            value={config.ueCmdBinary}
            onChange={(event) => handleChange('ueCmdBinary', event.target.value)}
            spellCheck={false}
          />
        </label>

        <label className={styles.field}>
          <span>Project Path</span>
          <input
            className={styles.input}
            type="text"
            value={config.projectPath}
            onChange={(event) => handleChange('projectPath', event.target.value)}
            spellCheck={false}
          />
        </label>

        <label className={styles.field}>
          <span>Abslog Directory</span>
          <input
            className={styles.input}
            type="text"
            value={config.abslogDir}
            onChange={(event) => handleChange('abslogDir', event.target.value)}
            spellCheck={false}
          />
        </label>

        <label className={styles.field}>
          <span>Fixed Arguments</span>
          <textarea
            className={`${styles.input} ${styles.argsInput}`}
            value={config.fixedArgs}
            onChange={(event) => handleChange('fixedArgs', event.target.value)}
            spellCheck={false}
          />
        </label>

        {error && <div className={styles.error}>{error}</div>}

        {lastAbslogPath && (
          <div className={styles.result}>
            <div className={styles.resultLabel}>Log</div>
            <div className={styles.resultValue}>{lastAbslogPath}</div>
          </div>
        )}

        {lastLauncherPath && (
          <div className={styles.result}>
            <div className={styles.resultLabel}>Launcher</div>
            <div className={styles.resultValue}>{lastLauncherPath}</div>
          </div>
        )}

        {lastCommand && (
          <div className={styles.result}>
            <div className={styles.resultLabel}>Command</div>
            <div className={styles.resultValue}>{lastCommand}</div>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <button className={styles.launchBtn} onClick={handleLaunch} disabled={launching}>
          {launching ? 'Launching...' : 'Launch'}
        </button>
      </div>
    </div>
  )
}
