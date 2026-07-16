import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_GLOBAL_SETTINGS,
  type AppConfig,
  type GlobalSettings,
} from '../../types/config'
import styles from './SettingsScreen.module.css'

type FieldName = keyof GlobalSettings

const SETTINGS_ROWS: { field: FieldName; label: string; picker: SettingsFileKind }[] = [
  { field: 'editorExe', label: 'Editor EXE', picker: 'editor-exe' },
  { field: 'editorCommandLineExe', label: 'Editor CommandLine EXE', picker: 'editor-command-line-exe' },
  { field: 'projectPath', label: 'Project', picker: 'project' },
]

export default function SettingsScreen() {
  const [settings, setSettings] = useState<GlobalSettings>(DEFAULT_GLOBAL_SETTINGS)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const saved = await window.electronAPI.configLoad() as Partial<AppConfig>
        if (!cancelled) {
          setSettings({ ...DEFAULT_GLOBAL_SETTINGS, ...saved.globalSettings })
        }
      } catch {
        if (!cancelled) setSettings(DEFAULT_GLOBAL_SETTINGS)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  const updateField = useCallback((field: FieldName, value: string) => {
    setSettings((current) => ({ ...current, [field]: value }))
    setStatus('')
  }, [])

  const browse = useCallback(async (field: FieldName, picker: SettingsFileKind) => {
    try {
      const result = await window.electronAPI.selectSettingsFile(picker)
      if (!result.canceled && result.path) {
        updateField(field, result.path)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to open file chooser.')
    }
  }, [updateField])

  const save = useCallback(async () => {
    setSaving(true)
    setStatus('')
    try {
      await window.electronAPI.configSave({ globalSettings: settings })
      setStatus('Settings saved.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }, [settings])

  if (!loaded) {
    return <div className={styles.container}><div className={styles.header}>Settings</div><div className={styles.loading}>Loading...</div></div>
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>Settings</div>
      <div className={styles.content}>
        <div className={styles.table}>
          <div className={`${styles.row} ${styles.tableHeader}`}>
            <div>Setting</div><div>Value</div><div />
          </div>
          {SETTINGS_ROWS.map((row) => (
            <div className={styles.row} key={row.field}>
              <label htmlFor={row.field}>{row.label}</label>
              <input
                id={row.field}
                value={settings[row.field]}
                onChange={(event) => updateField(row.field, event.target.value)}
                spellCheck={false}
              />
              <button onClick={() => browse(row.field, row.picker)}>Browse</button>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.footer}>
        <span className={styles.status}>{status}</span>
        <button className={styles.saveButton} onClick={save} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
