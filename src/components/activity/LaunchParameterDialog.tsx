import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { useAppStore } from '../../stores/app-store'
import {
  DEFAULT_ADVANCED_LAUNCH_ACTIVITY,
  DEFAULT_ADVANCED_LAUNCH_INJECT_PATH,
  type AdvancedLaunchConfig,
  type AdvancedLaunchRow,
} from '../../types/config'
import {
  buildAdvancedLaunchParams,
  buildUECommandLineContent,
  formatLaunchCommand,
  mergeAdvancedLaunchConfig,
} from '../../services/advanced-launch'
import PackageSelectDialog from '../dialogs/PackageSelectDialog'
import ActivitySelectDialog from '../dialogs/ActivitySelectDialog'
import styles from './LaunchParameterDialog.module.css'

interface LaunchParameterDialogProps {
  activityName: string
  onLaunch: (activity: string, params: string) => void
  onCancel: () => void
}

type CategoryKey = 'direct' | 'execCmds' | 'dpcvars'

interface ParameterListProps {
  title: string
  hint: string
  rows: AdvancedLaunchRow[]
  setRows: Dispatch<SetStateAction<AdvancedLaunchRow[]>>
  category: CategoryKey
}

function createRow(category: CategoryKey): AdvancedLaunchRow {
  return {
    id: `${category}-custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    value: '',
  }
}

function ParameterList({
  title,
  hint,
  rows,
  setRows,
  category,
}: ParameterListProps) {
  const updateRow = useCallback((
    id: string,
    updater: (row: AdvancedLaunchRow) => AdvancedLaunchRow,
  ) => {
    setRows((current) => current.map((row) => row.id === id ? updater(row) : row))
  }, [setRows])

  const removeRow = useCallback((id: string) => {
    setRows((current) => current.filter((row) => row.id !== id))
  }, [setRows])

  const addRow = useCallback(() => {
    setRows((current) => [...current, createRow(category)])
  }, [category, setRows])

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <div className={styles.sectionTitle}>{title}</div>
          <div className={styles.sectionHint}>{hint}</div>
        </div>
        <button className={styles.smallBtn} onClick={addRow}>
          Add
        </button>
      </div>
      <div className={styles.rowList}>
        {rows.map((row) => (
          <div className={styles.paramRow} key={row.id}>
            <input
              className={styles.checkbox}
              type="checkbox"
              checked={row.enabled}
              onChange={(event) => {
                const enabled = event.target.checked
                updateRow(row.id, (current) => ({ ...current, enabled }))
              }}
              aria-label={`Enable ${title} row`}
            />
            <input
              className={styles.paramInput}
              type="text"
              value={row.value}
              onChange={(event) => {
                const value = event.target.value
                updateRow(row.id, (current) => ({ ...current, value }))
              }}
            />
            <button
              className={styles.removeBtn}
              onClick={() => removeRow(row.id)}
              title="Remove row"
              aria-label={`Remove ${title} row`}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function LaunchParameterDialog({
  activityName,
  onLaunch,
  onCancel,
}: LaunchParameterDialogProps) {
  const config = useAppStore((s) => s.config)
  const setConfig = useAppStore((s) => s.setConfig)

  const initialConfig = useMemo(
    () => mergeAdvancedLaunchConfig(
      config.advancedLaunch,
      activityName.trim()
        || config.launchActivity
        || DEFAULT_ADVANCED_LAUNCH_ACTIVITY,
    ),
    [activityName, config.advancedLaunch, config.launchActivity],
  )

  const [activity, setActivity] = useState(
    activityName.trim()
      || initialConfig.activity
      || DEFAULT_ADVANCED_LAUNCH_ACTIVITY,
  )
  const [injectPath, setInjectPath] = useState(initialConfig.injectPath)
  const [direct, setDirect] = useState<AdvancedLaunchRow[]>(initialConfig.direct)
  const [execCmds, setExecCmds] = useState<AdvancedLaunchRow[]>(initialConfig.execCmds)
  const [dpcvars, setDpcvars] = useState<AdvancedLaunchRow[]>(initialConfig.dpcvars)
  const [packageDialogOpen, setPackageDialogOpen] = useState(false)
  const [activityDialogOpen, setActivityDialogOpen] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState('')
  const [message, setMessage] = useState('')
  const [injecting, setInjecting] = useState(false)

  const createCurrentConfig = useCallback((activityValue = activity): AdvancedLaunchConfig => ({
    activity: activityValue.trim() || DEFAULT_ADVANCED_LAUNCH_ACTIVITY,
    injectPath: injectPath.trim() || DEFAULT_ADVANCED_LAUNCH_INJECT_PATH,
    direct,
    execCmds,
    dpcvars,
  }), [activity, direct, execCmds, dpcvars, injectPath])

  const buildPreview = useCallback((activityValue = activity) => {
    const nextConfig = createCurrentConfig(activityValue)
    const params = buildAdvancedLaunchParams(nextConfig)
    return {
      params,
      command: formatLaunchCommand(nextConfig.activity, params),
      config: nextConfig,
    }
  }, [activity, createCurrentConfig])

  const [preview, setPreview] = useState(() => buildPreview().command)

  const handleCombine = useCallback(() => {
    setPreview(buildPreview().command)
    setMessage('Preview updated.')
  }, [buildPreview])

  const handleLaunch = useCallback(() => {
    const built = buildPreview()
    setPreview(built.command)
    setConfig({
      launchActivity: built.config.activity,
      advancedLaunch: built.config,
    })
    window.electronAPI.configSave({
      launchActivity: built.config.activity,
      advancedLaunch: built.config,
    }).catch(() => {
      // Debounced config sync will retry later.
    })
    onLaunch(built.config.activity, built.params)
  }, [buildPreview, onLaunch, setConfig])

  const handleInject = useCallback(async () => {
    const nextConfig = createCurrentConfig()
    const content = buildUECommandLineContent(nextConfig)
    setInjecting(true)
    setMessage('Writing and injecting UECommandLine.txt...')
    setConfig({ advancedLaunch: nextConfig })

    try {
      window.electronAPI.configSave({ advancedLaunch: nextConfig }).catch(() => {
        // Debounced config sync will retry later.
      })
      const result = await window.electronAPI.injectAdvancedLaunch(content, nextConfig.injectPath)
      if (!result.success) {
        setMessage(`Inject failed: ${result.error || 'Unknown error'}`)
        return
      }
      if (result.data?.openError) {
        setMessage(`Injected to ${result.data.remotePath}. Could not open local copy: ${result.data.openError}`)
      } else {
        setMessage(`Injected to ${result.data?.remotePath || nextConfig.injectPath}. Local copy opened.`)
      }
    } catch (error) {
      setMessage(`Inject failed: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setInjecting(false)
    }
  }, [createCurrentConfig, setConfig])

  const handlePackageSelect = useCallback((pkg: string) => {
    setSelectedPackage(pkg)
    setPackageDialogOpen(false)
    setActivityDialogOpen(true)
  }, [])

  const handleActivitySelect = useCallback((selectedActivity: string) => {
    setActivity(selectedActivity)
    setActivityDialogOpen(false)
    setMessage('Activity selected. Use Combine to refresh the preview.')
  }, [])

  return (
    <>
      <div className={styles.overlay} onClick={onCancel}>
        <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
          <div className={styles.header}>
            <div>
              <div className={styles.title}>Advanced Launch</div>
              <div className={styles.subtitle}>Build Android activity launch parameters</div>
            </div>
            <button className={styles.closeBtn} onClick={onCancel} aria-label="Close">
              x
            </button>
          </div>

          <div className={styles.activityRow}>
            <label className={styles.label}>Activity</label>
            <input
              className={styles.activityInput}
              type="text"
              value={activity}
              onChange={(event) => setActivity(event.target.value)}
            />
            <button className={styles.secondaryBtn} onClick={() => setPackageDialogOpen(true)}>
              Open
            </button>
          </div>

          <div className={styles.injectRow}>
            <label className={styles.label}>Inject path</label>
            <input
              className={styles.activityInput}
              type="text"
              value={injectPath}
              onChange={(event) => setInjectPath(event.target.value)}
              spellCheck={false}
            />
          </div>

          <div className={styles.sections}>
            <ParameterList
              title="Direct"
              hint="Raw flags, for example -opengl"
              rows={direct}
              setRows={setDirect}
              category="direct"
            />
            <ParameterList
              title="ExecCmds"
              hint="Console commands joined into -ExecCmds"
              rows={execCmds}
              setRows={setExecCmds}
              category="execCmds"
            />
            <ParameterList
              title="dpcvars"
              hint="Console variables joined into -dpcvars"
              rows={dpcvars}
              setRows={setDpcvars}
              category="dpcvars"
            />
          </div>

          <div className={styles.previewBlock}>
            <label className={styles.previewLabel}>Final command preview</label>
            <textarea
              className={styles.preview}
              value={preview}
              readOnly
              spellCheck={false}
            />
          </div>

          <div className={styles.footer}>
            <div className={styles.message}>{message}</div>
            <div className={styles.buttons}>
              <button className={styles.secondaryBtn} onClick={handleInject} disabled={injecting}>
                {injecting ? 'Injecting...' : 'Inject'}
              </button>
              <button className={styles.secondaryBtn} onClick={handleCombine}>
                Combine
              </button>
              <button className={styles.launchBtn} onClick={handleLaunch}>
                Launch
              </button>
            </div>
          </div>
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
