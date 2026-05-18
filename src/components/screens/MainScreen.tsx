import { useState, useCallback } from 'react'
import MenuBar from '../layout/MenuBar'
import MainLayout from '../layout/MainLayout'
import PackageSelectDialog from '../dialogs/PackageSelectDialog'
import ActivitySelectDialog from '../dialogs/ActivitySelectDialog'
import { useLogStream } from '../../hooks/use-log-stream'
import { useConfig } from '../../hooks/use-config'
import { useConfigSync } from '../../hooks/use-config-sync'

export default function MainScreen() {
  useLogStream()
  useConfig()
  useConfigSync()

  const [packageDialogOpen, setPackageDialogOpen] = useState(false)
  const [activityDialogOpen, setActivityDialogOpen] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState('')

  const handleOpenClick = useCallback(() => {
    setPackageDialogOpen(true)
  }, [])

  const handlePackageSelect = useCallback((pkg: string) => {
    setSelectedPackage(pkg)
    setPackageDialogOpen(false)
    setActivityDialogOpen(true)
  }, [])

  const handleActivitySelect = useCallback((activity: string) => {
    setActivityDialogOpen(false)
    // The activity name will be set via a shared state or callback
    // We use the window focus event to pass the selected activity back
    const input = document.querySelector<HTMLInputElement>('[data-activity-input]')
    if (input) {
      input.value = activity
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }, [])

  return (
    <>
      <MenuBar />
      <MainLayout onOpenClick={handleOpenClick} />
      {packageDialogOpen && (
        <PackageSelectDialog
          onSelect={handlePackageSelect}
          onClose={() => setPackageDialogOpen(false)}
        />
      )}
      {activityDialogOpen && (
        <ActivitySelectDialog
          packageName={selectedPackage}
          onSelect={handleActivitySelect}
          onClose={() => setActivityDialogOpen(false)}
        />
      )}
    </>
  )
}
