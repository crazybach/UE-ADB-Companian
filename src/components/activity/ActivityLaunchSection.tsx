import { useState, useCallback, useEffect } from 'react'
import { useAppStore } from '../../stores/app-store'
import LaunchParameterDialog from './LaunchParameterDialog'
import styles from './ActivityLaunchSection.module.css'

interface ActivityLaunchSectionProps {
  onOpenClick: () => void
  selectedActivity: string
}

export default function ActivityLaunchSection({
  onOpenClick,
  selectedActivity,
}: ActivityLaunchSectionProps) {
  const [activity, setActivity] = useState('')
  const [showParams, setShowParams] = useState(false)
  const config = useAppStore((s) => s.config)
  const setConfig = useAppStore((s) => s.setConfig)

  useEffect(() => {
    if (selectedActivity) {
      setActivity(selectedActivity)
      setConfig({ launchActivity: selectedActivity })
    }
  }, [selectedActivity, setConfig])

  useEffect(() => {
    if (!activity && config.launchActivity) {
      setActivity(config.launchActivity)
    }
  }, [activity, config.launchActivity])

  useEffect(() => {
    const handleAdvancedLaunch = () => {
      if (!activity.trim()) return

      setConfig({ launchActivity: activity })
      setShowParams(true)
    }

    window.addEventListener('activity:advanced-launch', handleAdvancedLaunch)
    return () => window.removeEventListener('activity:advanced-launch', handleAdvancedLaunch)
  }, [activity, setConfig])

  const handleLaunch = useCallback(async () => {
    if (!activity.trim()) return

    setConfig({ launchActivity: activity })

    try {
      await window.electronAPI.launchActivity(activity, '')
    } catch { /* ADB error */ }
  }, [activity, setConfig])

  const handleLaunchWithParams = useCallback(async (params: string) => {
    setShowParams(false)
    try {
      await window.electronAPI.launchActivity(activity, params)
    } catch { /* ADB error */ }
  }, [activity])

  return (
    <div className={styles.row}>
      <label className={styles.label}>Activity:</label>
      <input
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
