import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { type PsoDumpConfig } from '../../types/config'
import type { PsoDumpColumn, PsoDumpReport, PsoDumpRow } from '../../services/pso-dump'
import styles from './PsoDumpScreen.module.css'

type SortDirection = 'asc' | 'desc'
type DisplayItem = { kind: 'group'; key: string; count: number } | { kind: 'row'; row: PsoDumpRow }

const EMPTY_CONFIG: PsoDumpConfig = { mode: 'pipeline-cache', pipelineCacheFile: '', stableKeyFile: '' }

function compare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export default function PsoDumpScreen() {
  const [config, setConfig] = useState<PsoDumpConfig>(EMPTY_CONFIG)
  const [report, setReport] = useState<PsoDumpReport | null>(null)
  const [logPath, setLogPath] = useState('')
  const [csvPath, setCsvPath] = useState('')
  const [status, setStatus] = useState('Choose a dump mode and input, then run the commandlet.')
  const [busy, setBusy] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [query, setQuery] = useState('')
  const [recordType, setRecordType] = useState('ALL')
  const [facetColumn, setFacetColumn] = useState('')
  const [facetValue, setFacetValue] = useState('ALL')
  const [groupBy, setGroupBy] = useState('')
  const [sortKey, setSortKey] = useState('Entry')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const tableRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    window.electronAPI.configLoad().then((saved) => {
      if (cancelled) return
      const previous = saved.psoDump as Partial<PsoDumpConfig> & { useStableKeyFile?: boolean }
      setConfig({
        mode: previous.mode || (previous.useStableKeyFile ? 'stable-key' : 'pipeline-cache'),
        pipelineCacheFile: previous.pipelineCacheFile || '',
        stableKeyFile: previous.stableKeyFile || '',
      })
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const saveConfig = useCallback((next: PsoDumpConfig) => {
    setConfig(next)
    void window.electronAPI.configSave({ psoDump: next })
  }, [])

  const update = useCallback((field: keyof PsoDumpConfig, value: string) => saveConfig({ ...config, [field]: value }), [config, saveConfig])

  const setMode = useCallback((mode: PsoDumpConfig['mode']) => {
    saveConfig({ ...config, mode })
    setReport(null)
    setLogPath('')
    setCsvPath('')
    setStatus(mode === 'pipeline-cache' ? 'Pipeline cache mode selected.' : 'Stable key mode selected.')
  }, [config, saveConfig])

  const browse = useCallback(async (kind: PsoDumpPickerKind) => {
    try {
      const result = await window.electronAPI.selectPsoDumpPath(kind)
      if (result.canceled || !result.path) return
      update(kind === 'pipeline-cache' ? 'pipelineCacheFile' : 'stableKeyFile', result.path)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not open the chooser.')
    }
  }, [update])

  const run = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setStatus('Running ShaderPipelineCacheTools dump...')
    try {
      const result = await window.electronAPI.runPsoDump(config)
      if (!result.success || !result.report) {
        setStatus(result.error || 'PSO dump failed.')
        return
      }
      setReport(result.report)
      setLogPath(result.logPath || '')
      setCsvPath(result.csvPath || '')
      setQuery('')
      setRecordType('ALL')
      setFacetColumn('')
      setFacetValue('ALL')
      setGroupBy('')
      setSortKey(result.report.mode === 'pipeline-cache' ? 'Entry' : 'AssetPath')
      const expected = result.report.expectedTotal
      setStatus(expected !== undefined && expected !== result.report.rows.length
        ? `Warning: parsed ${result.report.rows.length.toLocaleString()} of ${expected.toLocaleString()} logged PSOs.`
        : `Dump complete. ${result.report.rows.length.toLocaleString()} records exported to CSV.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'PSO dump failed.')
    } finally {
      setBusy(false)
    }
  }, [busy, config])

  const loadCsv = useCallback(async () => {
    if (busy || translating) return
    setBusy(true)
    setStatus('Loading PSO Dump CSV...')
    try {
      const result = await window.electronAPI.loadPsoDumpCsv()
      if (result.canceled) {
        setStatus('CSV load canceled.')
        return
      }
      if (!result.success || !result.report || !result.path) {
        setStatus(result.error || 'Failed to load PSO CSV.')
        return
      }
      setReport(result.report)
      setCsvPath(result.path)
      setLogPath('')
      saveConfig({ ...config, mode: result.report.mode })
      setQuery('')
      setRecordType('ALL')
      setFacetColumn('')
      setFacetValue('ALL')
      setGroupBy('')
      setSortKey(result.report.mode === 'pipeline-cache' ? 'Entry' : 'AssetPath')
      setStatus(`Loaded ${result.report.rows.length.toLocaleString()} records from CSV.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to load PSO CSV.')
    } finally {
      setBusy(false)
    }
  }, [busy, config, saveConfig, translating])

  const translate = useCallback(async () => {
    if (!csvPath || report?.mode !== 'pipeline-cache' || busy || translating) return
    setTranslating(true)
    setStatus('Choose a stable-key dump CSV for shader translation...')
    try {
      const result = await window.electronAPI.translatePsoDump(csvPath)
      if (result.canceled) {
        setStatus('Translation canceled.')
        return
      }
      if (!result.success || !result.report || !result.path) {
        setStatus(result.error || 'Shader translation failed.')
        return
      }
      setReport(result.report)
      setCsvPath(result.path)
      setFacetColumn('')
      setFacetValue('ALL')
      setGroupBy('')
      const resolved = result.resolvedReferences || 0
      const total = result.totalReferences || 0
      setStatus(`Translated ${resolved.toLocaleString()} of ${total.toLocaleString()} shader references. Saved ${result.path}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Shader translation failed.')
    } finally {
      setTranslating(false)
    }
  }, [busy, csvPath, report?.mode, translating])
  const recordTypes = useMemo(() => [...new Set(report?.rows.map((row) => row.recordType) || [])].sort(), [report])
  const filterColumns = useMemo(() => report?.columns.filter((item) => !['Entry', 'PSOHash', 'UsageMask', 'BindCount'].includes(item.key)) || [], [report])
  const facetValues = useMemo(() => {
    if (!report || !facetColumn) return []
    return [...new Set(report.rows.map((row) => row.values[facetColumn]).filter(Boolean))].sort(compare).slice(0, 2000)
  }, [facetColumn, report])

  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return [...(report?.rows || [])].filter((row) => (
      (recordType === 'ALL' || row.recordType === recordType)
      && (!facetColumn || facetValue === 'ALL' || row.values[facetColumn] === facetValue)
      && (!needle || Object.values(row.values).some((value) => value.toLowerCase().includes(needle)))
    )).sort((a, b) => {
      const result = compare(a.values[sortKey] || '', b.values[sortKey] || '')
      return sortDirection === 'asc' ? result : -result
    })
  }, [facetColumn, facetValue, query, recordType, report, sortDirection, sortKey])

  const displayItems = useMemo<DisplayItem[]>(() => {
    if (!groupBy) return filteredRows.map((row) => ({ kind: 'row', row }))
    const groups = new Map<string, PsoDumpRow[]>()
    for (const row of filteredRows) {
      const key = row.values[groupBy] || '(empty)'
      const group = groups.get(key) || []
      group.push(row)
      groups.set(key, group)
    }
    return [...groups.entries()].sort(([a], [b]) => compare(a, b)).flatMap(([key, rows]) => [
      { kind: 'group' as const, key, count: rows.length },
      ...rows.map((row) => ({ kind: 'row' as const, row })),
    ])
  }, [filteredRows, groupBy])

  const virtualizer = useVirtualizer({ count: displayItems.length, getScrollElement: () => tableRef.current, estimateSize: (index) => displayItems[index]?.kind === 'group' ? 34 : 30, overscan: 18 })
  const gridTemplate = useMemo(() => report?.columns.map((item) => `${item.width}px`).join(' ') || '1fr', [report])

  const changeSort = useCallback((item: PsoDumpColumn) => {
    if (sortKey === item.key) setSortDirection((value) => value === 'asc' ? 'desc' : 'asc')
    else { setSortKey(item.key); setSortDirection('asc') }
  }, [sortKey])

  const modeSummary = useMemo(() => recordTypes.map((type) => ({ type, count: report?.rows.filter((row) => row.recordType === type).length || 0 })), [recordTypes, report])

  return <div className={styles.container}>
    <header className={styles.header}><span>PSO Dump</span><div className={styles.modeSwitch}><button className={config.mode === 'pipeline-cache' ? styles.activeMode : ''} onClick={() => setMode('pipeline-cache')}>Pipeline Cache</button><button className={config.mode === 'stable-key' ? styles.activeMode : ''} onClick={() => setMode('stable-key')}>Stable Key</button></div></header>

    <section className={styles.inputs}>
      {config.mode === 'pipeline-cache' ? <>
        <label>Pipeline Cache File<input value={config.pipelineCacheFile} onChange={(event) => update('pipelineCacheFile', event.target.value)} placeholder="Select a .upipelinecache file" /></label><button onClick={() => browse('pipeline-cache')} disabled={busy}>Browse</button>
      </> : <>
        <label>Stable Key File<input value={config.stableKeyFile} onChange={(event) => update('stableKeyFile', event.target.value)} placeholder="Select a .shk file" /></label><button onClick={() => browse('stable-key-file')} disabled={busy}>Browse</button>
      </>}
    </section>

    <section className={styles.summary}>
      <div><span>Total Records</span><strong>{(report?.rows.length || 0).toLocaleString()}</strong></div>
      {report?.expectedTotal !== undefined && <div><span>Logged Total</span><strong>{report.expectedTotal.toLocaleString()}</strong></div>}
      {modeSummary.map((item) => <div key={item.type}><span>{item.type}</span><strong>{item.count.toLocaleString()}</strong></div>)}
      <div><span>Columns</span><strong>{report?.columns.length || 0}</strong></div>
    </section>

    <div className={styles.toolbar}>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search all columns" />
      <select value={recordType} onChange={(event) => setRecordType(event.target.value)}><option value="ALL">All record types</option>{recordTypes.map((value) => <option key={value}>{value}</option>)}</select>
      <select value={facetColumn} onChange={(event) => { setFacetColumn(event.target.value); setFacetValue('ALL') }}><option value="">Filter column...</option>{filterColumns.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
      <select value={facetValue} disabled={!facetColumn} onChange={(event) => setFacetValue(event.target.value)}><option value="ALL">All values</option>{facetValues.map((value) => <option key={value}>{value}</option>)}</select>
      <select value={groupBy} onChange={(event) => setGroupBy(event.target.value)}><option value="">No grouping</option>{filterColumns.map((item) => <option key={item.key} value={item.key}>Group: {item.label}</option>)}</select>
      <button onClick={loadCsv} disabled={busy || translating}>Load CSV</button>
      <button onClick={translate} disabled={!csvPath || report?.mode !== 'pipeline-cache' || busy || translating}>{translating ? 'Translating...' : 'Translate'}</button>
      <button disabled={!csvPath} onClick={() => window.electronAPI.openPsoOutput(csvPath)}>Open CSV</button>
    </div>

    <div className={styles.pathBar} title={csvPath || logPath}>{csvPath || logPath || 'The dump log and normalized CSV will be saved beside the selected input.'}</div>

    <div className={styles.tableScroller} ref={tableRef}>
      {report && <div className={styles.headerRow} style={{ gridTemplateColumns: gridTemplate }}>{report.columns.map((item) => <button key={item.key} style={{ width: item.width }} onClick={() => changeSort(item)}><small>{item.group}</small><span>{item.label}{sortKey === item.key ? (sortDirection === 'asc' ? ' ^' : ' v') : ''}</span></button>)}</div>}
      <div className={styles.virtualBody} style={{ height: virtualizer.getTotalSize(), width: report?.columns.reduce((sum, item) => sum + item.width, 0) || '100%' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = displayItems[virtualItem.index]
          if (item.kind === 'group') return <div className={styles.groupRow} key={`group-${item.key}`} style={{ transform: `translateY(${virtualItem.start}px)` }}>{item.key}<span>{item.count.toLocaleString()} records</span></div>
          return <div className={styles.dataRow} key={item.row.id} style={{ gridTemplateColumns: gridTemplate, transform: `translateY(${virtualItem.start}px)` }}>{report?.columns.map((column) => <div key={column.key} title={item.row.values[column.key] || ''}>{item.row.values[column.key] || ''}</div>)}</div>
        })}
      </div>
      {!report && <div className={styles.empty}>No dump results loaded.</div>}
      {report && filteredRows.length === 0 && <div className={styles.empty}>No records match the current filters.</div>}
    </div>

    <footer className={styles.footer}><span>{status}</span><span>{filteredRows.length.toLocaleString()} / {(report?.rows.length || 0).toLocaleString()}</span><button className={styles.runButton} onClick={run} disabled={busy || translating}>{busy ? 'Running...' : 'Run Dump'}</button></footer>
  </div>
}