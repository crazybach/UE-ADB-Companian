import { useState, useCallback, useRef, useEffect } from 'react'
import { useAppStore } from '../../stores/app-store'
import styles from './LaunchParameterDialog.module.css'

interface LaunchParameterDialogProps {
  activityName: string
  onLaunch: (params: string) => void
  onCancel: () => void
}

export default function LaunchParameterDialog({
  activityName,
  onLaunch,
  onCancel,
}: LaunchParameterDialogProps) {
  const [params, setParams] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyIndex, setHistoryIndex] = useState(-1)
  const config = useAppStore((s) => s.config)
  const setConfig = useAppStore((s) => s.setConfig)
  const inputRef = useRef<HTMLInputElement>(null)

  const history = config.launchParameters || []

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleLaunch = useCallback(() => {
    if (params.trim()) {
      const filtered = history.filter((h) => h !== params.trim())
      setConfig({ launchParameters: [params.trim(), ...filtered].slice(0, 50) })
    }
    onLaunch(params)
  }, [params, history, setConfig, onLaunch])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleLaunch()
      } else if (e.key === 'Escape') {
        if (historyOpen) {
          setHistoryOpen(false)
        } else {
          onCancel()
        }
      } else if (e.key === 'ArrowDown') {
        if (!historyOpen && history.length > 0) {
          setHistoryOpen(true)
          setHistoryIndex(0)
          setParams(history[0])
        } else if (historyOpen && historyIndex < history.length - 1) {
          const next = historyIndex + 1
          setHistoryIndex(next)
          setParams(history[next])
        }
      } else if (e.key === 'ArrowUp') {
        if (historyOpen && historyIndex > 0) {
          const prev = historyIndex - 1
          setHistoryIndex(prev)
          setParams(history[prev])
        }
      } else if (e.key === 'Tab') {
        if (historyOpen && historyIndex >= 0) {
          e.preventDefault()
          setHistoryOpen(false)
        }
      }
    },
    [historyOpen, historyIndex, params, history, handleLaunch, onCancel],
  )

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.title}>Launch Parameters</div>
        <div className={styles.activityName}>{activityName}</div>
        <div className={styles.inputRow}>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            value={params}
            onChange={(e) => {
              setParams(e.target.value)
              setHistoryOpen(false)
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (params === '' && history.length > 0) {
                // Don't auto-open, let arrow key do it
              }
            }}
            placeholder="Launch parameters..."
          />
        </div>
        {historyOpen && (
          <div className={styles.historyDropdown}>
            {history.map((h, i) => (
              <div
                key={i}
                className={`${styles.historyItem} ${i === historyIndex ? styles.active : ''}`}
                onMouseDown={() => {
                  setParams(h)
                  setHistoryOpen(false)
                }}
              >
                {h}
              </div>
            ))}
          </div>
        )}
        <div className={styles.buttons}>
          <button className={styles.launchBtn} onClick={handleLaunch}>
            Launch
          </button>
          <button className={styles.cancelBtn} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
