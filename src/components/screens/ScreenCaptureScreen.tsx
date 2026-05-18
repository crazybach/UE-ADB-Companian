import { useState, useEffect, useCallback, useRef } from 'react'
import type { PointerEvent, WheelEvent } from 'react'
import styles from './ScreenCaptureScreen.module.css'

interface ScreenshotInfo {
  name: string
  device: string
  date: string
  path: string
}

type ViewMode = 'device' | 'day' | 'hour'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 6

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

export default function ScreenCaptureScreen() {
  const [screenshots, setScreenshots] = useState<ScreenshotInfo[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [capturing, setCapturing] = useState(false)
  const [screenshotDir, setScreenshotDir] = useState('')
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    panX: number
    panY: number
  } | null>(null)

  const refreshList = useCallback(async () => {
    try {
      const result = await window.electronAPI.listScreenshots()
      if (result.success) {
        setScreenshots(result.data?.files || [])
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

  useEffect(() => {
    if (!selectedImage) {
      setPreviewSrc(null)
      setPreviewError(null)
      setZoom(1)
      setPan({ x: 0, y: 0 })
      return
    }

    let cancelled = false
    setPreviewSrc(null)
    setPreviewError(null)
    setZoom(1)
    setPan({ x: 0, y: 0 })

    window.electronAPI.getScreenshotDataUrl(selectedImage)
      .then((result) => {
        if (cancelled) return
        if (result.success && result.data?.dataUrl) {
          setPreviewSrc(result.data.dataUrl)
        } else {
          setPreviewError(result.error || 'Failed to load screenshot')
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewError('Failed to load screenshot')
      })

    return () => {
      cancelled = true
    }
  }, [selectedImage])

  const handleCapture = async () => {
    setCapturing(true)
    try {
      const result = await window.electronAPI.captureScreenshot()
      await refreshList()
      if (result.success && result.data?.localPath) {
        setSelectedImage(result.data.localPath)
      }
    } catch {
      // Error capturing
    }
    setCapturing(false)
  }

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    if (!previewSrc) return

    event.preventDefault()

    const rect = event.currentTarget.getBoundingClientRect()
    const nextZoom = clampZoom(zoom * (event.deltaY < 0 ? 1.12 : 0.88))
    const pointerX = event.clientX - rect.left - rect.width / 2
    const pointerY = event.clientY - rect.top - rect.height / 2

    setPan((current) => ({
      x: pointerX - ((pointerX - current.x) / zoom) * nextZoom,
      y: pointerY - ((pointerY - current.y) / zoom) * nextZoom,
    }))
    setZoom(nextZoom)
  }, [previewSrc, zoom])

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (!previewSrc || event.button !== 0) return

    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
    }
  }, [pan, previewSrc])

  const handlePointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return

    setPan({
      x: drag.panX + event.clientX - drag.startX,
      y: drag.panY + event.clientY - drag.startY,
    })
  }, [])

  const stopPanning = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }, [])

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
              type="button"
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
        <div
          className={`${styles.preview} ${previewSrc ? styles.interactivePreview : ''}`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopPanning}
          onPointerCancel={stopPanning}
          onPointerLeave={stopPanning}
        >
          {selectedImage && previewSrc ? (
            <img
              src={previewSrc}
              alt="Screenshot preview"
              className={styles.previewImage}
              draggable={false}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            />
          ) : selectedImage && previewError ? (
            <div className={styles.noSelection}>{previewError}</div>
          ) : selectedImage ? (
            <div className={styles.noSelection}>Loading screenshot...</div>
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
