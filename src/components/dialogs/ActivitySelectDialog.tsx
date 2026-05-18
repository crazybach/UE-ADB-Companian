import { useState, useEffect } from 'react'
import styles from './Dialog.module.css'

interface ActivitySelectDialogProps {
  packageName: string
  onSelect: (activity: string) => void
  onClose: () => void
}

export default function ActivitySelectDialog({
  packageName,
  onSelect,
  onClose,
}: ActivitySelectDialogProps) {
  const [activities, setActivities] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const result = await window.electronAPI.listActivities(packageName)
        if ((result as { success: boolean; data?: { activities: string[] } }).success) {
          setActivities((result as { success: boolean; data: { activities: string[] } }).data?.activities || [])
        } else {
          setError((result as { error?: string }).error || 'Failed to list activities')
        }
      } catch {
        setError('ADB not available')
      }
      setLoading(false)
    }
    load()
  }, [packageName])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>Select Activity</div>
        <div className={styles.subtitle}>{packageName}</div>
        {loading && <div className={styles.message}>Loading activities...</div>}
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.list}>
          {activities.map((act) => (
            <div
              key={act}
              className={styles.item}
              onClick={() => onSelect(act)}
            >
              {act}
            </div>
          ))}
        </div>
        <div className={styles.buttons}>
          <button className={styles.cancelBtn} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
