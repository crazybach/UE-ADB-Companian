import { useState, useEffect, useCallback } from 'react'
import styles from './ScreenCaptureScreen.module.css'

interface ScreenshotInfo {
  name: string
  device: string
  date: string
  path: string
}

type ViewMode = 'device' | 'day' | 'hour'

export default function ScreenCaptureScreen() {
  const [screenshots, setScreenshots] = useState<ScreenshotInfo[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [screenshotDir, setScreenshotDir] = useState('')

  const refreshList = useCallback(async () => {
    try {
      const result = await window.electronAPI.listScreenshots()
      if ((result as { success: boolean; data?: { files: ScreenshotInfo[] } }).success) {
        setScreenshots((result as { success: boolean; data: { files: ScreenshotInfo[] } }).data?.files || [])
      }
      const dir = await window.electronAPI.getScreenshotPath()
      setScreenshotDir(dir as string)
    } catch {
      // ADB not available
    }
  }, [])

  useEffect(() => {
    refreshList()
  }, [refreshList])

  const handleCapture = async () => {
    setCapturing(true)
    try {
      await window.electronAPI.captureScreenshot()
      await refreshList()
    } catch {
      // Error capturing
    }
    setCapturing(false)
  }

  const groupBy = (mode: ViewMode): Record<string, ScreenshotInfo[]> => {
    const groups: Record<string, ScreenshotInfo[]> = {}
    for (const s of screenshots) {
      let key: string
      if (mode === 'device') {
        key = s.device
      } else if (mode === 'day') {
        key = s.date.slice(0, 10)
      } else {
        key = s.date.slice(0, 13)
      }
      if (!groups[key]) groups[key] = []
      groups[key].push(s)
    }
    return groups
  }

  const grouped = groupBy(viewMode)
  const groupKeys = Object.keys(grouped).sort().reverse()

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <button className={styles.captureBtn} onClick={handleCapture} disabled={capturing}>
          {capturing ? 'Capturing...' : 'Capture Screenshot'}
        </button>
        <div className={styles.viewMode}>
          {(['device', 'day', 'hour'] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              className={`${styles.modeBtn} ${viewMode === mode ? styles.active : ''}`}
              onClick={() => setViewMode(mode)}
            >
              By {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
        <button className={styles.refreshBtn} onClick={refreshList}>
          Refresh
        </button>
      </div>
      <div className={styles.content}>
        <div className={styles.sidebar}>
          {groupKeys.map((key) => (
            <details key={key} open>
              <summary className={styles.groupHeader}>{key} ({grouped[key].length})</summary>
              <ul className={styles.fileList}>
                {grouped[key].map((s) => (
                  <li
                    key={s.name}
                    className={`${styles.fileItem} ${selectedImage === s.path ? styles.selected : ''}`}
                    onClick={() => setSelectedImage(s.path)}
                  >
                    <span className={styles.fileName}>{s.name}</span>
                    <span className={styles.fileDate}>{s.date}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
          {groupKeys.length === 0 && (
            <div className={styles.empty}>No screenshots captured</div>
          )}
        </div>
        <div className={styles.preview}>
          {selectedImage ? (
            <img
              src={`file://${selectedImage}`}
              alt="Screenshot preview"
              className={styles.previewImage}
            />
          ) : (
            <div className={styles.noSelection}>
              Select a screenshot to preview
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
