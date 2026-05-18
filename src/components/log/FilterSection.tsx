import { useCallback } from 'react'
import { useLogStore } from '../../stores/log-store'
import { LOG_LEVELS, LOG_LEVEL_NAMES, LOG_LEVEL_COLORS } from '../../types/log'
import type { LogLevel } from '../../types/log'
import styles from './FilterSection.module.css'

export default function FilterSection() {
  const filterText = useLogStore((s) => s.filterText)
  const logLevels = useLogStore((s) => s.logLevels)
  const processFilter = useLogStore((s) => s.processFilter)
  const scrollLock = useLogStore((s) => s.scrollLock)
  const setFilterText = useLogStore((s) => s.setFilterText)
  const toggleLevel = useLogStore((s) => s.toggleLevel)
  const setProcessFilter = useLogStore((s) => s.setProcessFilter)
  const setScrollLock = useLogStore((s) => s.setScrollLock)
  const clearLogs = useLogStore((s) => s.clearLogs)

  const handleClearFilter = useCallback(() => {
    setFilterText('')
  }, [setFilterText])

  return (
    <div className={styles.container}>
      <div className={styles.filterRow}>
        <input
          type="text"
          className={styles.textFilter}
          placeholder="Filter logs..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
        />
        <button className={styles.clearBtn} onClick={handleClearFilter}>
          Clear Filter
        </button>
        <button className={styles.clearBtn} onClick={clearLogs}>
          Clear Log
        </button>
      </div>
      <div className={styles.checkboxRow}>
        {LOG_LEVELS.map((level) => (
          <label key={level} className={styles.levelLabel} title={LOG_LEVEL_NAMES[level]}>
            <span
              className={styles.levelDot}
              style={{ color: LOG_LEVEL_COLORS[level] }}
            >
              ●
            </span>
            <input
              type="checkbox"
              checked={logLevels.has(level)}
              onChange={() => toggleLevel(level)}
            />
            <span>{level}</span>
          </label>
        ))}
        <label className={styles.checkLabel} title="Show only UE logs">
          <input
            type="checkbox"
            checked={processFilter}
            onChange={(e) => setProcessFilter(e.target.checked)}
          />
          <span>Filter my mine</span>
        </label>
        <label className={styles.checkLabel} title="Prevent auto-scroll">
          <input
            type="checkbox"
            checked={scrollLock}
            onChange={(e) => setScrollLock(e.target.checked)}
          />
          <span>Scroll Lock</span>
        </label>
      </div>
    </div>
  )
}
