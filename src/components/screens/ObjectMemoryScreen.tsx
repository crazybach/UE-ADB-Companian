import { useCallback, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import base from './TextureMemoryScreen.module.css'
import styles from './ObjectMemoryScreen.module.css'

type SortKey = keyof Pick<
  ObjectMemoryRow,
  | 'className'
  | 'objectPath'
  | 'numKB'
  | 'maxKB'
  | 'resExcKB'
  | 'resExcDedSysKB'
  | 'resExcDedVidKB'
  | 'resExcUnkKB'
>

interface ObjectMemoryScreenProps {
  kind: ObjectMemoryKind
}

interface GroupRow {
  name: string
  count: number
  numKB: number
  maxKB: number
  resExcKB: number
}

const TITLES: Record<ObjectMemoryKind, string> = {
  'static-mesh': 'Static Mesh Memory Usage',
  'skeletal-mesh': 'Skeletal Mesh Memory Usage',
  'static-mesh-component': 'Static Mesh Component Memory Usage',
}

function formatMemory(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(2)} KB`
}

function getRoot(objectPath: string): string {
  const match = objectPath.match(/^\/([^/]+)/)
  return match ? `/${match[1]}` : 'Other'
}

function compareValues(a: string | number, b: string | number): number {
  return typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export default function ObjectMemoryScreen({ kind }: ObjectMemoryScreenProps) {
  const [report, setReport] = useState<ObjectMemoryReport | null>(null)
  const [filePath, setFilePath] = useState('')
  const [status, setStatus] = useState('Open a memreport or capture one from the connected device.')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [className, setClassName] = useState('ALL')
  const [root, setRoot] = useState('ALL')
  const [view, setView] = useState<'objects' | 'groups'>('objects')
  const [sortKey, setSortKey] = useState<SortKey>('resExcKB')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  const applyResult = useCallback((result: ObjectMemoryResult, action: string) => {
    if (result.canceled) {
      setStatus('Open canceled.')
      return
    }
    if (!result.success || !result.report) {
      setStatus(result.error || `${action} failed.`)
      return
    }
    setReport(result.report)
    setFilePath(result.path || '')
    setQuery('')
    setClassName('ALL')
    setRoot('ALL')
    setSelectedId(null)
    setStatus(`${action}: ${result.report.rows.length.toLocaleString()} objects loaded.`)
  }, [])

  const handleOpen = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setStatus('Opening memreport...')
    try {
      applyResult(await window.electronAPI.openObjectMemreport(kind), 'Opened')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to open memreport.')
    } finally {
      setBusy(false)
    }
  }, [applyResult, busy, kind])

  const handleCapture = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setStatus('Capturing memreport -full. Waiting for the device report to finish...')
    try {
      applyResult(await window.electronAPI.captureObjectMemreport(kind), 'Captured')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to capture memreport.')
    } finally {
      setBusy(false)
    }
  }, [applyResult, busy, kind])

  const classes = useMemo(
    () => [...new Set(report?.rows.map((row) => row.className) || [])].sort(),
    [report],
  )
  const roots = useMemo(
    () => [...new Set(report?.rows.map((row) => getRoot(row.objectPath)) || [])].sort(),
    [report],
  )

  const visibleRows = useMemo(() => {
    if (!report) return []
    const needle = query.trim().toLowerCase()
    const rows = report.rows.filter((row) => (
      (className === 'ALL' || row.className === className)
      && (root === 'ALL' || getRoot(row.objectPath) === root)
      && (!needle || `${row.objectPath} ${row.className}`.toLowerCase().includes(needle))
    ))
    return [...rows].sort((a, b) => {
      const comparison = compareValues(a[sortKey], b[sortKey])
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [className, query, report, root, sortDirection, sortKey])

  const groups = useMemo<GroupRow[]>(() => {
    const values = new Map<string, GroupRow>()
    for (const row of visibleRows) {
      const groupName = kind === 'static-mesh-component' ? row.className : getRoot(row.objectPath)
      const group = values.get(groupName) || { name: groupName, count: 0, numKB: 0, maxKB: 0, resExcKB: 0 }
      group.count += 1
      group.numKB += row.numKB
      group.maxKB += row.maxKB
      group.resExcKB += row.resExcKB
      values.set(groupName, group)
    }
    return [...values.values()].sort((a, b) => b.resExcKB - a.resExcKB)
  }, [kind, visibleRows])

  const visibleTotals = useMemo(() => visibleRows.reduce((totals, row) => ({
    numKB: totals.numKB + row.numKB,
    maxKB: totals.maxKB + row.maxKB,
    resExcKB: totals.resExcKB + row.resExcKB,
    dedSysKB: totals.dedSysKB + row.resExcDedSysKB,
  }), { numKB: 0, maxKB: 0, resExcKB: 0, dedSysKB: 0 }), [visibleRows])

  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => tableRef.current,
    estimateSize: () => 29,
    overscan: 15,
  })

  const changeSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDirection(key === 'objectPath' || key === 'className' ? 'asc' : 'desc')
    }
  }, [sortKey])

  const sortLabel = (key: SortKey, label: string) => (
    <button className={base.columnButton} onClick={() => changeSort(key)}>
      {label}{sortKey === key ? (sortDirection === 'asc' ? ' ^' : ' v') : ''}
    </button>
  )
  const selectedRow = report?.rows.find((row) => row.id === selectedId)
  const gridClass = kind === 'static-mesh-component' ? styles.componentGrid : styles.objectGrid

  return (
    <div className={base.container}>
      <header className={base.header}>{TITLES[kind]}</header>
      <div className={base.actionBar}>
        <input className={base.path} value={filePath} readOnly placeholder="No memreport loaded" />
        <button className={base.button} onClick={handleOpen} disabled={busy}>Open</button>
        <button className={base.primaryButton} onClick={handleCapture} disabled={busy}>
          {busy ? 'Working...' : 'Capture'}
        </button>
      </div>

      <section className={base.summaryBand}>
        <div><span>Objects</span><strong>{(report?.totals.objectCount || 0).toLocaleString()}</strong></div>
        <div><span>Allocated</span><strong>{formatMemory(report?.totals.numKB || 0)}</strong></div>
        <div><span>Maximum</span><strong>{formatMemory(report?.totals.maxKB || 0)}</strong></div>
        <div><span>Exclusive Resources</span><strong>{formatMemory(report?.totals.resExcKB || 0)}</strong></div>
        <div><span>Dedicated System</span><strong>{formatMemory(report?.totals.resExcDedSysKB || 0)}</strong></div>
      </section>

      <div className={`${base.filterBar} ${styles.filterBar}`}>
        <input className={base.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter object path or class" />
        <select value={root} onChange={(event) => setRoot(event.target.value)}>
          <option value="ALL">All roots</option>
          {roots.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={className} onChange={(event) => setClassName(event.target.value)}>
          <option value="ALL">All classes</option>
          {classes.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <div className={base.segmented}>
          <button className={view === 'objects' ? base.segmentActive : ''} onClick={() => setView('objects')}>Objects</button>
          <button className={view === 'groups' ? base.segmentActive : ''} onClick={() => setView('groups')}>Groups</button>
        </div>
      </div>

      {view === 'objects' ? (
        <div className={base.tableScroller} ref={tableRef}>
          <div className={`${base.gridRow} ${gridClass} ${base.tableHeader}`}>
            <div>{sortLabel('className', 'Class')}</div>
            <div>{sortLabel('objectPath', 'Object')}</div>
            <div>{sortLabel('numKB', 'Num KB')}</div>
            <div>{sortLabel('maxKB', 'Max KB')}</div>
            <div>{sortLabel('resExcKB', 'Exclusive')}</div>
            <div>{sortLabel('resExcDedSysKB', 'Ded Sys')}</div>
            <div>{sortLabel('resExcDedVidKB', 'Ded Vid')}</div>
            <div>{sortLabel('resExcUnkKB', 'Unknown')}</div>
          </div>
          <div className={`${base.virtualBody} ${styles.objectBody}`} style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = visibleRows[virtualRow.index]
              return (
                <div
                  key={row.id}
                  className={`${base.gridRow} ${gridClass} ${base.dataRow} ${selectedId === row.id ? base.selectedRow : ''}`}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                  onClick={() => setSelectedId(row.id)}
                >
                  <div title={row.className}>{row.className}</div>
                  <div className={base.textureName} title={row.objectPath}>{row.objectPath}</div>
                  <div className={base.numeric}>{row.numKB.toFixed(2)}</div>
                  <div className={base.numeric}>{row.maxKB.toFixed(2)}</div>
                  <div className={base.numeric}>{row.resExcKB.toFixed(2)}</div>
                  <div className={base.numeric}>{row.resExcDedSysKB.toFixed(2)}</div>
                  <div className={base.numeric}>{row.resExcDedVidKB.toFixed(2)}</div>
                  <div className={base.numeric}>{row.resExcUnkKB.toFixed(2)}</div>
                </div>
              )
            })}
          </div>
          {!report && <div className={base.empty}>No memory report loaded.</div>}
          {report && visibleRows.length === 0 && <div className={base.empty}>No objects match the current filters.</div>}
        </div>
      ) : (
        <div className={base.groupScroller}>
          <table className={base.groupTable}>
            <thead><tr><th>{kind === 'static-mesh-component' ? 'Component Class' : 'Asset Root'}</th><th>Objects</th><th>Allocated</th><th>Maximum</th><th>Exclusive</th><th>Share</th></tr></thead>
            <tbody>{groups.map((group) => (
              <tr key={group.name}>
                <td>{group.name}</td><td>{group.count.toLocaleString()}</td><td>{formatMemory(group.numKB)}</td>
                <td>{formatMemory(group.maxKB)}</td><td>{formatMemory(group.resExcKB)}</td>
                <td>{visibleTotals.resExcKB ? `${((group.resExcKB / visibleTotals.resExcKB) * 100).toFixed(1)}%` : '0%'}</td>
              </tr>
            ))}</tbody>
          </table>
          {groups.length === 0 && <div className={base.empty}>No groups to display.</div>}
        </div>
      )}

      {selectedRow && view === 'objects' && (
        <div className={base.detailBar} title={selectedRow.objectPath}>
          <strong>{selectedRow.objectPath}</strong><span>{selectedRow.className}</span>
          <span>Exclusive {formatMemory(selectedRow.resExcKB)}</span>
        </div>
      )}

      <footer className={base.statusBar}>
        <span>{visibleRows.length.toLocaleString()} / {(report?.rows.length || 0).toLocaleString()} objects</span>
        <span>{formatMemory(visibleTotals.numKB)} visible allocated</span>
        <span>{formatMemory(visibleTotals.resExcKB)} visible exclusive</span>
        <span className={base.statusText}>{status}</span>
      </footer>
    </div>
  )
}
