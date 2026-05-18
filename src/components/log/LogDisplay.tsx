import { useRef, useEffect, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useLogStore } from '../../stores/log-store'
import LogRow from './LogRow'
import ColumnHeader from './ColumnHeader'
import styles from './LogDisplay.module.css'

export default function LogDisplay() {
  const filteredLines = useLogStore((s) => s.filteredLines)
  const columns = useLogStore((s) => s.columns)
  const scrollLock = useLogStore((s) => s.scrollLock)

  const containerRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: filteredLines.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 18, // line height
    overscan: 10,
  })

  // Auto-scroll to bottom when new logs arrive (unless scroll locked)
  const prevLengthRef = useRef(0)
  useEffect(() => {
    if (!scrollLock && filteredLines.length > prevLengthRef.current) {
      const lastIndex = filteredLines.length - 1
      if (lastIndex >= 0) {
        virtualizer.scrollToIndex(lastIndex, { align: 'end' })
      }
    }
    prevLengthRef.current = filteredLines.length
  }, [filteredLines.length, scrollLock])

  return (
    <div className={styles.container}>
      <ColumnHeader />
      <div ref={containerRef} className={styles.logArea}>
        <div
          className={styles.logContent}
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const line = filteredLines[virtualRow.index]
            return (
              <div
                key={virtualRow.key}
                className={styles.logRow}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <LogRow line={line} columns={columns} />
              </div>
            )
          })}
        </div>
        {filteredLines.length === 0 && (
          <div className={styles.empty}>Waiting for log output...</div>
        )}
      </div>
    </div>
  )
}
