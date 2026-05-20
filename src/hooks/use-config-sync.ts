import { useEffect, useRef } from 'react'
import { useLogStore } from '../stores/log-store'
import { useAppStore } from '../stores/app-store'

export function useConfigSync() {
  const configLoaded = useAppStore((s) => s.configLoaded)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!configLoaded) return

    // Debounced save — trigger 2s after last change
    const save = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(async () => {
        const columns = useLogStore.getState().columns
        const processFilter = useLogStore.getState().processFilter
        const scrollLock = useLogStore.getState().scrollLock
        const { config } = useAppStore.getState()

        try {
          await window.electronAPI.configSave({
            columns: columns.filter((c) => c.id !== 'message'),
            logLevels: config.logLevels,
            launchActivity: config.launchActivity,
            processFilter,
            scrollLock,
            launchParameters: config.launchParameters,
          })
        } catch {
          // Config save failed — non-critical
        }
      }, 2000)
    }

    // Subscribe to store changes
    const unsub1 = useLogStore.subscribe(() => save())
    const unsub2 = useAppStore.subscribe(() => save())

    return () => {
      unsub1()
      unsub2()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [configLoaded])

  // Save on window close
  useEffect(() => {
    const handleBeforeUnload = () => {
      const columns = useLogStore.getState().columns
      const processFilter = useLogStore.getState().processFilter
      const scrollLock = useLogStore.getState().scrollLock
      const { config } = useAppStore.getState()

      // Synchronous save attempt via IPC (fire-and-forget)
      window.electronAPI.configSave({
        columns: columns.filter((c) => c.id !== 'message'),
        logLevels: config.logLevels,
        launchActivity: config.launchActivity,
        processFilter,
        scrollLock,
        launchParameters: config.launchParameters,
      })
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])
}
