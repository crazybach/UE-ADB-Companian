import { useCallback } from 'react'
import ActivityLaunchSection from '../activity/ActivityLaunchSection'
import CommandSection from '../command/CommandSection'
import FilterSection from '../log/FilterSection'
import LogDisplay from '../log/LogDisplay'
import StatusBar from './StatusBar'
import styles from './MainLayout.module.css'

interface MainLayoutProps {
  onOpenClick: () => void
}

export default function MainLayout({ onOpenClick }: MainLayoutProps) {
  const handleSendCommand = useCallback((cmd: string) => {
    window.electronAPI.sendCommand(cmd)
  }, [])

  return (
    <div className={styles.layout}>
      <div className={styles.inputArea}>
        <ActivityLaunchSection onOpenClick={onOpenClick} />
        <CommandSection onSend={handleSendCommand} />
      </div>
      <FilterSection />
      <LogDisplay />
      <StatusBar />
    </div>
  )
}
