import { useState, useCallback, useRef } from 'react'
import { useAppStore } from '../../stores/app-store'
import LaunchParameterDialog from './LaunchParameterDialog'
import styles from './ActivityLaunchSection.module.css'

interface ActivityLaunchSectionProps {
  onOpenClick: () => void
}

export default function ActivityLaunchSection({ onOpenClick }: ActivityLaunchSectionProps) {
  const [activity, setActivity] = useState('')
  const [showParams, setShowParams] = useState(false)
  const config = useAppStore((s) => s.config)
  const setConfig = useAppStore((s) => s.setConfig)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleLaunch = useCallback(async () => {
    if (!activity.trim()) return

    setConfig({ launchActivity: activity })

    // Show launch parameter dialog
    setShowParams(true)
  }, [activity, setConfig])

  const handleLaunchWithParams = useCallback(async (params: string) => {
    setShowParams(false)
    try {
      await window.electronAPI.launchActivity(activity, params)
    } catch { /* ADB error */ }
  }, [activity])

  // Load saved activity on mount
  if (!activity && config.launchActivity) {
    // Will be set via useEffect in parent, but for now check ref
    if (inputRef.current) {
      inputRef.current.value = config.launchActivity
    }
  }

  return (
    <div className={styles.row}>
      <label className={styles.label}>Activity:</label>
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        data-activity-input
        value={activity}
        onChange={(e) => setActivity(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleLaunch()
        }}
        placeholder="com.example/.MainActivity"
      />
      <button className={styles.btn} onClick={handleLaunch}>
        Launch
      </button>
      <button className={styles.btnSecondary} onClick={onOpenClick}>
        Open
      </button>

      {showParams && (
        <LaunchParameterDialog
          activityName={activity}
          onLaunch={handleLaunchWithParams}
          onCancel={() => setShowParams(false)}
        />
      )}
    </div>
  )
}
