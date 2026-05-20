import { useState, useCallback, useEffect } from 'react'
import { useAppStore } from '../../stores/app-store'
import { DEFAULT_ADVANCED_LAUNCH_ACTIVITY } from '../../types/config'
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
  const [activity, setActivity] = useState(DEFAULT_ADVANCED_LAUNCH_ACTIVITY)
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
    if (config.launchActivity) {
      setActivity(config.launchActivity)
    } else if (config.advancedLaunch.activity) {
      setActivity(config.advancedLaunch.activity)
    }
  }, [config.launchActivity, config.advancedLaunch.activity])

  useEffect(() => {
    const handleAdvancedLaunch = () => {
      const nextActivity = activity.trim() || DEFAULT_ADVANCED_LAUNCH_ACTIVITY
      setActivity(nextActivity)
      setConfig({ launchActivity: nextActivity })
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

  const handleLaunchWithParams = useCallback(async (launchActivity: string, params: string) => {
    setActivity(launchActivity)
    setShowParams(false)
    try {
      await window.electronAPI.launchActivity(launchActivity, params)
    } catch { /* ADB error */ }
  }, [])

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
