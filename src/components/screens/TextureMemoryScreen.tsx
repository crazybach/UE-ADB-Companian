import { useCallback, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import styles from './TextureMemoryScreen.module.css'

type SortKey = keyof Pick<
  TextureMemoryRow,
  | 'currentKB'
  | 'cookedKB'
  | 'currentDimensions'
  | 'format'
  | 'lodGroup'
  | 'name'
  | 'streaming'
  | 'virtualTexture'
  | 'usageCount'
  | 'numMips'
  | 'uncompressed'
>

interface GroupRow {
  name: string
  count: number
  currentKB: number
  cookedKB: number
  streamingCount: number
}

function formatMemory(kb: number): string {
  return kb >= 1024 ? `${(kb / 1024).toFixed(2)} MB` : `${kb.toFixed(0)} KB`
}

function compareValues(a: string | number, b: string | number): number {
  return typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export default function TextureMemoryScreen() {
  const [report, setReport] = useState<TextureMemoryReport | null>(null)
  const [filePath, setFilePath] = useState('')
  const [status, setStatus] = useState('Open a memreport or capture one from the connected device.')
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [lodGroup, setLodGroup] = useState('ALL')
  const [format, setFormat] = useState('ALL')
  const [streaming, setStreaming] = useState('ALL')
  const [view, setView] = useState<'textures' | 'groups'>('textures')
  const [sortKey, setSortKey] = useState<SortKey>('currentKB')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)

  const applyResult = useCallback((result: TextureMemoryResult, action: string) => {
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
    setLodGroup('ALL')
    setFormat('ALL')
    setStreaming('ALL')
    setSelectedId(null)
    setStatus(`${action}: ${result.report.rows.length.toLocaleString()} textures loaded.`)
  }, [])

  const handleOpen = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setStatus('Opening memreport...')
    try {
      applyResult(await window.electronAPI.openTextureMemreport(), 'Opened')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to open memreport.')
    } finally {
      setBusy(false)
    }
  }, [applyResult, busy])

  const handleCapture = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setStatus('Capturing memreport -full. Waiting for the device report to finish...')
    try {
      applyResult(await window.electronAPI.captureTextureMemreport(), 'Captured')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to capture memreport.')
    } finally {
      setBusy(false)
    }
  }, [applyResult, busy])

  const lodGroups = useMemo(
    () => [...new Set(report?.rows.map((row) => row.lodGroup) || [])].sort(),
    [report],
  )
  const formats = useMemo(
    () => [...new Set(report?.rows.map((row) => row.format) || [])].sort(),
    [report],
  )

  const visibleRows = useMemo(() => {
    if (!report) return []
    const needle = query.trim().toLowerCase()
    const rows = report.rows.filter((row) => {
      if (lodGroup !== 'ALL' && row.lodGroup !== lodGroup) return false
      if (format !== 'ALL' && row.format !== format) return false
      if (streaming !== 'ALL' && row.streaming.toUpperCase() !== streaming) return false
      return !needle || `${row.name} ${row.lodGroup} ${row.format}`.toLowerCase().includes(needle)
    })

    return [...rows].sort((a, b) => {
      const comparison = compareValues(a[sortKey], b[sortKey])
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [format, lodGroup, query, report, sortDirection, sortKey, streaming])

  const groupRows = useMemo<GroupRow[]>(() => {
    const groups = new Map<string, GroupRow>()
    for (const row of visibleRows) {
      const group = groups.get(row.lodGroup) || {
        name: row.lodGroup,
        count: 0,
        currentKB: 0,
        cookedKB: 0,
        streamingCount: 0,
      }
      group.count += 1
      group.currentKB += row.currentKB
      group.cookedKB += row.cookedKB
      if (row.streaming.toUpperCase() === 'YES') group.streamingCount += 1
      groups.set(row.lodGroup, group)
    }
    return [...groups.values()].sort((a, b) => b.currentKB - a.currentKB)
  }, [visibleRows])

  const visibleCurrentKB = useMemo(
    () => visibleRows.reduce((sum, row) => sum + row.currentKB, 0),
    [visibleRows],
  )
  const visibleCookedKB = useMemo(
    () => visibleRows.reduce((sum, row) => sum + row.cookedKB, 0),
    [visibleRows],
  )

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
      setSortDirection(key === 'name' || key === 'format' || key === 'lodGroup' ? 'asc' : 'desc')
    }
  }, [sortKey])

  const sortLabel = (key: SortKey, label: string) => (
    <button className={styles.columnButton} onClick={() => changeSort(key)}>
      {label}{sortKey === key ? (sortDirection === 'asc' ? ' ^' : ' v') : ''}
    </button>
  )

  const selectedRow = report?.rows.find((row) => row.id === selectedId)

  return (
    <div className={styles.container}>
      <header className={styles.header}>Texture Memory Usage</header>

      <div className={styles.actionBar}>
        <input className={styles.path} value={filePath} readOnly placeholder="No memreport loaded" />
        <button className={styles.button} onClick={handleOpen} disabled={busy}>Open</button>
        <button className={styles.primaryButton} onClick={handleCapture} disabled={busy}>
          {busy ? 'Working...' : 'Capture'}
        </button>
      </div>

      <section className={styles.summaryBand}>
        <div><span>Textures</span><strong>{(report?.totals.textureCount || 0).toLocaleString()}</strong></div>
        <div><span>Current / In Memory</span><strong>{formatMemory(report?.totals.currentKB || 0)}</strong></div>
        <div><span>Cooked / On Disk</span><strong>{formatMemory(report?.totals.cookedKB || 0)}</strong></div>
        <div><span>Streaming</span><strong>{(report?.totals.streamingCount || 0).toLocaleString()}</strong></div>
        <div><span>Virtual Textures</span><strong>{(report?.totals.virtualTextureCount || 0).toLocaleString()}</strong></div>
      </section>

      <div className={styles.filterBar}>
        <input
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter texture name, LOD group, or format"
        />
        <select value={lodGroup} onChange={(event) => setLodGroup(event.target.value)}>
          <option value="ALL">All LOD groups</option>
          {lodGroups.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={format} onChange={(event) => setFormat(event.target.value)}>
          <option value="ALL">All formats</option>
          {formats.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={streaming} onChange={(event) => setStreaming(event.target.value)}>
          <option value="ALL">All streaming</option>
          <option value="YES">Streaming</option>
          <option value="NO">Not streaming</option>
        </select>
        <div className={styles.segmented}>
          <button className={view === 'textures' ? styles.segmentActive : ''} onClick={() => setView('textures')}>Textures</button>
          <button className={view === 'groups' ? styles.segmentActive : ''} onClick={() => setView('groups')}>Groups</button>
        </div>
      </div>

      {view === 'textures' ? (
        <div className={styles.tableScroller} ref={tableRef}>
          <div className={`${styles.gridRow} ${styles.tableHeader}`}>
            <div>{sortLabel('currentKB', 'In Mem')}</div>
            <div>{sortLabel('cookedKB', 'On Disk')}</div>
            <div>{sortLabel('currentDimensions', 'Current')}</div>
            <div>{sortLabel('format', 'Format')}</div>
            <div>{sortLabel('lodGroup', 'LOD Group')}</div>
            <div>{sortLabel('name', 'Texture')}</div>
            <div>{sortLabel('streaming', 'Stream')}</div>
            <div>{sortLabel('virtualTexture', 'VT')}</div>
            <div>{sortLabel('usageCount', 'Uses')}</div>
            <div>{sortLabel('numMips', 'Mips')}</div>
            <div>{sortLabel('uncompressed', 'Raw')}</div>
          </div>
          <div className={styles.virtualBody} style={{ height: rowVirtualizer.getTotalSize() }}>
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const row = visibleRows[virtualRow.index]
              return (
                <div
                  key={row.id}
                  className={`${styles.gridRow} ${styles.dataRow} ${selectedId === row.id ? styles.selectedRow : ''}`}
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                  onClick={() => setSelectedId(row.id)}
                >
                  <div className={styles.numeric}>{formatMemory(row.currentKB)}</div>
                  <div className={styles.numeric}>{formatMemory(row.cookedKB)}</div>
                  <div>{row.currentDimensions}</div>
                  <div>{row.format}</div>
                  <div title={row.lodGroup}>{row.lodGroup}</div>
                  <div className={styles.textureName} title={row.name}>{row.name}</div>
                  <div>{row.streaming}</div>
                  <div>{row.virtualTexture}</div>
                  <div className={styles.numeric}>{row.usageCount}</div>
                  <div className={styles.numeric}>{row.numMips}</div>
                  <div>{row.uncompressed}</div>
                </div>
              )
            })}
          </div>
          {!report && <div className={styles.empty}>No texture report loaded.</div>}
          {report && visibleRows.length === 0 && <div className={styles.empty}>No textures match the current filters.</div>}
        </div>
      ) : (
        <div className={styles.groupScroller}>
          <table className={styles.groupTable}>
            <thead><tr><th>LOD Group</th><th>Textures</th><th>In Memory</th><th>Share</th><th>On Disk</th><th>Streaming</th></tr></thead>
            <tbody>
              {groupRows.map((group) => (
                <tr key={group.name}>
                  <td>{group.name}</td>
                  <td>{group.count.toLocaleString()}</td>
                  <td>{formatMemory(group.currentKB)}</td>
                  <td>{visibleCurrentKB ? `${((group.currentKB / visibleCurrentKB) * 100).toFixed(1)}%` : '0%'}</td>
                  <td>{formatMemory(group.cookedKB)}</td>
                  <td>{group.streamingCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {groupRows.length === 0 && <div className={styles.empty}>No groups to display.</div>}
        </div>
      )}

      {selectedRow && view === 'textures' && (
        <div className={styles.detailBar} title={selectedRow.name}>
          <strong>{selectedRow.name}</strong>
          <span>Cooked {selectedRow.cookedDimensions}</span>
          <span>Bias {selectedRow.authoredBias || '?'}</span>
          <span>{selectedRow.lodGroup}</span>
        </div>
      )}

      <footer className={styles.statusBar}>
        <span>{visibleRows.length.toLocaleString()} / {(report?.rows.length || 0).toLocaleString()} textures</span>
        <span>{formatMemory(visibleCurrentKB)} visible in memory</span>
        <span>{formatMemory(visibleCookedKB)} visible on disk</span>
        <span className={styles.statusText}>{status}</span>
      </footer>
    </div>
  )
}
