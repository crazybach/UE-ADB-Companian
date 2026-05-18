import { useState, useEffect } from 'react'
import styles from './Dialog.module.css'

interface PackageSelectDialogProps {
  onSelect: (pkg: string) => void
  onClose: () => void
}

export default function PackageSelectDialog({ onSelect, onClose }: PackageSelectDialogProps) {
  const [packages, setPackages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const result = await window.electronAPI.listPackages()
        if ((result as { success: boolean; data?: { packages: string[] } }).success) {
          setPackages((result as { success: boolean; data: { packages: string[] } }).data?.packages || [])
        } else {
          setError((result as { error?: string }).error || 'Failed to list packages')
        }
      } catch {
        setError('ADB not available')
      }
      setLoading(false)
    }
    load()
  }, [])

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>Select Package</div>
        {loading && <div className={styles.message}>Loading packages...</div>}
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.list}>
          {packages.map((pkg) => (
            <div
              key={pkg}
              className={styles.item}
              onClick={() => onSelect(pkg)}
            >
              {pkg}
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
