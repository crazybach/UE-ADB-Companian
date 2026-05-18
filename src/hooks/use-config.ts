import { useEffect } from 'react'
import { useAppStore } from '../stores/app-store'
import { useLogStore } from '../stores/log-store'
import { DEFAULT_COLUMNS } from '../types/log'

export function useConfig() {
  const setConfig = useAppStore((s) => s.setConfig)
  const setConfigLoaded = useAppStore((s) => s.setConfigLoaded)
  const configLoaded = useAppStore((s) => s.configLoaded)

  const setColumns = useLogStore((s) => s.setColumns)
  const setFilterText = useLogStore((s) => s.setFilterText)
  const setProcessFilter = useLogStore((s) => s.setProcessFilter)
  const setScrollLock = useLogStore((s) => s.setScrollLock)

  useEffect(() => {
    if (configLoaded) return

    async function load() {
      try {
        const saved = await window.electronAPI.configLoad()

        if (saved.columns && Array.isArray(saved.columns) && saved.columns.length > 0) {
          // Merge saved columns with defaults
          const colMap = new Map(DEFAULT_COLUMNS.map((c) => [c.id, c]))
          const merged = saved.columns
            .filter((c: { id: string }) => colMap.has(c.id))
            .map((c: { id: string; width?: number; visible?: boolean }) => {
              const def = colMap.get(c.id)!
              return { ...def, width: c.width ?? def.width, visible: c.visible ?? def.visible }
            })
          // Add any missing defaults
          for (const def of DEFAULT_COLUMNS) {
            if (!merged.find((c: { id: string }) => c.id === def.id)) {
              merged.push(def)
            }
          }
          setColumns(merged)
        }

        if (saved.logLevels) {
          // logLevels is stored as { V: true, D: true, ... }
        }

        if (saved.processFilter !== undefined) {
          setProcessFilter(saved.processFilter)
        }

        if (saved.scrollLock !== undefined) {
          setScrollLock(saved.scrollLock)
        }

        if (saved.launchActivity !== undefined) {
          setConfig({ launchActivity: saved.launchActivity })
        }

        if (saved.launchParameters !== undefined) {
          setConfig({ launchParameters: saved.launchParameters })
        }
      } catch {
        // Use defaults
      }
      setConfigLoaded(true)
    }

    load()
  }, [configLoaded])
}
