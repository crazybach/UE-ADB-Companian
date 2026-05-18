import { useEffect } from 'react'
import { useAppStore } from '../stores/app-store'

export function useConnectionMonitor() {
  const setConnectionStatus = useAppStore((s) => s.setConnectionStatus)

  useEffect(() => {
    const unsub = window.electronAPI.onConnectionStatus((payload) => {
      setConnectionStatus(payload.status, payload.device)
    })

    // Query initial status on mount
    window.electronAPI.getConnectionStatus().then((s) => {
      setConnectionStatus(
        s.status as 'disconnected' | 'connecting' | 'connected',
        s.device,
      )
    })

    return unsub
  }, [])
}
