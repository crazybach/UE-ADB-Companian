import { useEffect, useRef } from 'react'
import { useLogStore } from '../stores/log-store'
import { useAppStore } from '../stores/app-store'

export function useLogStream() {
  const appendBatch = useLogStore((s) => s.appendBatch)
  const recomputeFiltered = useLogStore((s) => s.recomputeFiltered)
  const setLogcatRunning = useAppStore((s) => s.setLogcatRunning)

  const cleanupRef = useRef<(() => void)[]>([])

  useEffect(() => {
    let mounted = true

    // Subscribe to logcat batches
    const unsubBatch = window.electronAPI.onLogcatBatch((lines) => {
      if (!mounted) return
      appendBatch(lines)
      // Recompute filtered after append (but throttle would be better for perf)
    })

    const unsubStatus = window.electronAPI.onLogcatStatus((status, message) => {
      if (!mounted) return
      if (status === 'started') {
        setLogcatRunning(true)
      } else if (status === 'stopped') {
        setLogcatRunning(false)
      }
    })

    // Start logcat
    window.electronAPI.startLogcat().then(() => {
      if (mounted) setLogcatRunning(true)
    })

    // Periodically recompute filtered logs (every 300ms to avoid thrash)
    const filterInterval = setInterval(() => {
      if (mounted) recomputeFiltered()
    }, 300)

    cleanupRef.current = [unsubBatch, unsubStatus]

    return () => {
      mounted = false
      unsubBatch()
      unsubStatus()
      clearInterval(filterInterval)
    }
  }, [])
}
