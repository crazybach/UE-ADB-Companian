import { useEffect } from 'react'
import { useAppStore } from '../stores/app-store'
import { useLogStore } from '../stores/log-store'
import {
  DEFAULT_ADVANCED_LAUNCH_ACTIVITY,
  DEFAULT_COTF_CLIENT_CONFIG,
  DEFAULT_COTF_SERVER_CONFIG,
  DEFAULT_GLOBAL_SETTINGS,
  DEFAULT_PULL_LOGS_CONFIG,
} from '../types/config'
import { DEFAULT_COLUMNS } from '../types/log'
import { mergeAdvancedLaunchConfig } from '../services/advanced-launch'

export function useConfig() {
  const setConfig = useAppStore((s) => s.setConfig)
  const setConfigLoaded = useAppStore((s) => s.setConfigLoaded)
  const configLoaded = useAppStore((s) => s.configLoaded)

  const setColumns = useLogStore((s) => s.setColumns)
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

        setConfig({
          advancedLaunch: mergeAdvancedLaunchConfig(
            saved.advancedLaunch,
            saved.launchActivity || DEFAULT_ADVANCED_LAUNCH_ACTIVITY,
          ),
        })

        if (saved.cotfServer !== undefined) {
          setConfig({
            cotfServer: {
              ...DEFAULT_COTF_SERVER_CONFIG,
              ...saved.cotfServer,
            },
          })
        }

        if (saved.cotfClient !== undefined) {
          setConfig({
            cotfClient: {
              ...DEFAULT_COTF_CLIENT_CONFIG,
              ...saved.cotfClient,
            },
          })
        }

        if (saved.pullLogs !== undefined) {
          setConfig({
            pullLogs: {
              ...DEFAULT_PULL_LOGS_CONFIG,
              ...saved.pullLogs,
            },
          })
        }

        if (saved.globalSettings !== undefined) {
          setConfig({
            globalSettings: {
              ...DEFAULT_GLOBAL_SETTINGS,
              ...saved.globalSettings,
            },
          })
        }
      } catch {
        // Use defaults
      }
      setConfigLoaded(true)
    }

    load()
  }, [configLoaded])
}
