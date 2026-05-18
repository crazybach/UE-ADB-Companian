import { useEffect } from 'react'
import { useLogStore } from '../stores/log-store'
import { useAppStore } from '../stores/app-store'

export function useLogStream() {
  const appendBatch = useLogStore((s) => s.appendBatch)
  const recomputeFiltered = useLogStore((s) => s.recomputeFiltered)
  const setLogcatRunning = useAppStore((s) => s.setLogcatRunning)

  useEffect(() => {
    let mounted = true

    const unsubBatch = window.electronAPI.onLogcatBatch((lines) => {
      if (!mounted) return
      appendBatch(lines)
      // Throttled recompute - batched by the 100ms push interval from main
      recomputeFiltered()
    })

    const unsubStatus = window.electronAPI.onLogcatStatus((status) => {
      if (!mounted) return
      if (status === 'started') {
        setLogcatRunning(true)
      } else if (status === 'stopped') {
        setLogcatRunning(false)
      }
    })

    return () => {
      mounted = false
      unsubBatch()
      unsubStatus()
    }
  }, [])
}
