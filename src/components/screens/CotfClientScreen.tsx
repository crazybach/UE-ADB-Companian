import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_COTF_CLIENT_CONFIG,
  type AppConfig,
  type CotfClientConfig,
} from '../../types/config'
import {
  buildCotfClientParams,
  formatCotfClientCommand,
  mergeCotfClientConfig,
} from '../../services/cotf-client'
import PackageSelectDialog from '../dialogs/PackageSelectDialog'
import ActivitySelectDialog from '../dialogs/ActivitySelectDialog'
import styles from './CotfClientScreen.module.css'

export default function CotfClientScreen() {
  const [config, setConfig] = useState<CotfClientConfig>(DEFAULT_COTF_CLIENT_CONFIG)
  const [loaded, setLoaded] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [packageDialogOpen, setPackageDialogOpen] = useState(false)
  const [activityDialogOpen, setActivityDialogOpen] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [deviceSerial, setDeviceSerial] = useState<string | null>(null)
  const [preview, setPreview] = useState(() => formatCotfClientCommand(DEFAULT_COTF_CLIENT_CONFIG))

  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      try {
        const [saved, status] = await Promise.all([
          window.electronAPI.configLoad() as Promise<Partial<AppConfig>>,
          window.electronAPI.getConnectionStatus(),
        ])
        const merged = mergeCotfClientConfig(saved.cotfClient)
        if (!cancelled) {
          setDeviceSerial(status.device)
          setConfig(merged)
          setPreview(formatCotfClientCommand(merged, status.device))
        }
      } catch {
        if (!cancelled) {
          setConfig(DEFAULT_COTF_CLIENT_CONFIG)
          setPreview(formatCotfClientCommand(DEFAULT_COTF_CLIENT_CONFIG))
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

  useEffect(() => window.electronAPI.onConnectionStatus((status) => {
    setDeviceSerial(status.device)
  }), [])

  const saveConfig = useCallback(async (nextConfig: CotfClientConfig) => {
    await window.electronAPI.configSave({ cotfClient: nextConfig })
  }, [])

  const setAndSaveConfig = useCallback((updater: (current: CotfClientConfig) => CotfClientConfig) => {
    setConfig((current) => {
      const next = updater(current)
      saveConfig(next).catch(() => {
        setError('Failed to save COTF client settings.')
      })
      return next
    })
  }, [saveConfig])

  const handlePackageSelect = useCallback((pkg: string) => {
    setSelectedPackage(pkg)
    setPackageDialogOpen(false)
    setActivityDialogOpen(true)
  }, [])

  const handleActivitySelect = useCallback((activity: string) => {
    setAndSaveConfig((current) => ({ ...current, activity }))
    setActivityDialogOpen(false)
  }, [setAndSaveConfig])

  const handleCombine = useCallback(async () => {
    const nextPreview = formatCotfClientCommand(config, deviceSerial)
    setPreview(nextPreview)
    setError('')
    setMessage('Preview updated.')
    await saveConfig(config)
  }, [config, deviceSerial, saveConfig])

  const handleLaunch = useCallback(async () => {
    setLaunching(true)
    setError('')
    setMessage('')

    try {
      const params = buildCotfClientParams(config)
      setPreview(formatCotfClientCommand(config, deviceSerial))
      await saveConfig(config)
      const result = await window.electronAPI.launchActivity(config.activity, params)

      if ((result as { success: boolean }).success) {
        setMessage('COTF client launched.')
      } else {
        setError((result as { error?: string }).error || 'Failed to launch COTF client.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch COTF client.')
    } finally {
      setLaunching(false)
    }
  }, [config, deviceSerial, saveConfig])

  if (!loaded) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>COTF Client</div>
        <div className={styles.loading}>Loading...</div>
      </div>
    )
  }

  return (
    <>
      <div className={styles.container}>
        <div className={styles.header}>COTF Client</div>

        <div className={styles.content}>
          <div className={styles.activityRow}>
            <label className={styles.activityField}>
              <span>Activity</span>
              <input
                className={styles.input}
                type="text"
                value={config.activity}
                onChange={(event) => setAndSaveConfig((current) => ({
                  ...current,
                  activity: event.target.value,
                }))}
                spellCheck={false}
              />
            </label>
            <button className={styles.secondaryBtn} onClick={() => setPackageDialogOpen(true)}>
              Open
            </button>
          </div>

          <label className={styles.field}>
            <span>Project</span>
            <input
              className={styles.input}
              type="text"
              value={config.project}
              onChange={(event) => setConfig((current) => ({
                ...current,
                project: event.target.value,
              }))}
              spellCheck={false}
            />
          </label>

          <label className={styles.field}>
            <span>File Host IP</span>
            <input
              className={styles.input}
              type="text"
              value={config.filehostip}
              onChange={(event) => setConfig((current) => ({
                ...current,
                filehostip: event.target.value,
              }))}
              spellCheck={false}
            />
          </label>

          <label className={styles.field}>
            <span>Final command preview</span>
            <textarea className={styles.preview} value={preview} readOnly spellCheck={false} />
          </label>

          {error && <div className={styles.error}>{error}</div>}
          {message && <div className={styles.message}>{message}</div>}
        </div>

        <div className={styles.footer}>
          <button className={styles.secondaryBtn} onClick={handleCombine}>
            Combine
          </button>
          <button className={styles.launchBtn} onClick={handleLaunch} disabled={launching}>
            {launching ? 'Launching...' : 'Launch'}
          </button>
        </div>
      </div>

      {packageDialogOpen && (
        <PackageSelectDialog
          onSelect={handlePackageSelect}
          onClose={() => setPackageDialogOpen(false)}
        />
      )}
      {activityDialogOpen && (
        <ActivitySelectDialog
          packageName={selectedPackage}
          onSelect={handleActivitySelect}
          onClose={() => setActivityDialogOpen(false)}
        />
      )}
    </>
  )
}
