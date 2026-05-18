import { useCallback, useRef, useState, useEffect } from 'react'
import { useLogStore } from '../../stores/log-store'
import styles from './ColumnHeader.module.css'

export default function ColumnHeader() {
  const columns = useLogStore((s) => s.columns)
  const moveColumn = useLogStore((s) => s.moveColumn)
  const resizeColumn = useLogStore((s) => s.resizeColumn)
  const toggleColumnVisibility = useLogStore((s) => s.toggleColumnVisibility)

  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const [resizing, setResizing] = useState<string | null>(null)
  const resizeStartX = useRef(0)
  const resizeStartWidth = useRef(0)

  const visibleColumns = columns.filter((c) => c.id !== 'message')

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      setDragging(index)
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(index))
    },
    [],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent, index: number) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDragOver(index)
    },
    [],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      e.preventDefault()
      const fromIndex = parseInt(e.dataTransfer.getData('text/plain'))
      if (fromIndex !== toIndex) {
        moveColumn(fromIndex, toIndex)
      }
      setDragging(null)
      setDragOver(null)
    },
    [moveColumn],
  )

  const handleDragEnd = useCallback(() => {
    setDragging(null)
    setDragOver(null)
  }, [])

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, colId: string) => {
      e.preventDefault()
      setResizing(colId)
      resizeStartX.current = e.clientX
      const col = columns.find((c) => c.id === colId)
      resizeStartWidth.current = col?.width || 10
    },
    [columns],
  )

  const handleResizeMove = useCallback(
    (e: MouseEvent) => {
      if (!resizing) return
      const delta = e.clientX - resizeStartX.current
      const newWidth = Math.max(4, resizeStartWidth.current + Math.round(delta))
      resizeColumn(resizing, newWidth)
    },
    [resizing, resizeColumn],
  )

  const handleResizeEnd = useCallback(() => {
    setResizing(null)
  }, [])

  // Attach global mousemove/mouseup for resize
  useEffect(() => {
    if (resizing) {
      window.addEventListener('mousemove', handleResizeMove)
      window.addEventListener('mouseup', handleResizeEnd)
    }
    return () => {
      window.removeEventListener('mousemove', handleResizeMove)
      window.removeEventListener('mouseup', handleResizeEnd)
    }
  }, [resizing, handleResizeMove, handleResizeEnd])

  return (
    <div className={styles.header}>
      {visibleColumns.map((col, index) => (
        <div
          key={col.id}
          className={`${styles.column} ${dragging === index ? styles.dragging : ''} ${
            dragOver === index ? styles.dragOver : ''
          }`}
          style={{
            width: col.width * 8, // approximate char width
            minWidth: 32,
          }}
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          onContextMenu={(e) => {
            e.preventDefault()
            toggleColumnVisibility(col.id)
          }}
          title={`${col.label}\nDrag to reorder | Right-click to hide`}
        >
          <span className={styles.columnLabel}>{col.label}</span>
          <div
            className={styles.resizeHandle}
            onMouseDown={(e) => handleResizeStart(e, col.id)}
          />
        </div>
      ))}
      <div className={styles.spacer}>
        <span className={styles.columnLabel}>Message</span>
      </div>
    </div>
  )
}
