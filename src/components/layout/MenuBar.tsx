import { useCallback } from 'react'
import styles from './MenuBar.module.css'

export default function MenuBar() {
  const handleOpenCapture = useCallback(() => window.electronAPI.openCaptureWindow(), [])
  const handleOpenPalette = useCallback(() => window.electronAPI.openPaletteWindow(), [])
  const handleOpenPreview = useCallback(() => window.electronAPI.openPreviewWindow(), [])

  return (
    <div className={styles.menuBar}>
      <div className={styles.menu}>
        <span className={styles.menuItem}>File</span>
      </div>
      <div className={styles.menu}>
        <span className={styles.menuItem}>Tools ▾</span>
        <div className={styles.dropdown}>
          <button className={styles.dropdownItem} onClick={handleOpenCapture}>
            Screen Capture
          </button>
          <button className={styles.dropdownItem} onClick={handleOpenPalette}>
            Command Palette
          </button>
          <button className={styles.dropdownItem} onClick={handleOpenPreview}>
            Local Preview
          </button>
        </div>
      </div>
      <div className={styles.title}>UE Console ADB Tool</div>
    </div>
  )
}
