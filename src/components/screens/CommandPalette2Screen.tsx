import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CommandSection from '../command/CommandSection'
import ShortcutEditorDialog from '../shortcuts/ShortcutEditorDialog'
import type { CommandShortcut, CommandShortcutSaveInput } from '../../types/command-shortcut'
import styles from './CommandPalette2Screen.module.css'

type ConnectionMode = 'adb' | 'wifi'

const wait = (seconds: number) => new Promise((resolve) => {
  window.setTimeout(resolve, Math.max(0, seconds) * 1000)
})

export default function CommandPalette2Screen() {
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('adb')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('24002')
  const [shortcuts, setShortcuts] = useState<CommandShortcut[]>([])
  const [switchStates, setSwitchStates] = useState<Record<string, boolean>>({})
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingShortcut, setEditingShortcut] = useState<CommandShortcut | null>(null)
  const [editorInitialCommand, setEditorInitialCommand] = useState('')
  const [saving, setSaving] = useState(false)
  const [copyingShortcutId, setCopyingShortcutId] = useState<string | null>(null)
  const [runningShortcutId, setRunningShortcutId] = useState<string | null>(null)
  const [status, setStatus] = useState('Ready')
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadShortcuts = useCallback(async () => {
    try {
      const result = await window.electronAPI.listCommandShortcuts()
      if (!mountedRef.current) return
      if (!result.success) throw new Error(result.error || 'Failed to load shortcuts.')
      setShortcuts(result.shortcuts)
      setSwitchStates((current) => Object.fromEntries(result.shortcuts.map((shortcut) => [
        shortcut.id,
        shortcut.stateSwitch ? (current[shortcut.id] ?? shortcut.defaultState) : false,
      ])))
      setStatus(result.shortcuts.length ? `${result.shortcuts.length} shortcut(s) loaded.` : 'No shortcuts configured.')
    } catch (error) {
      if (mountedRef.current) {
        setStatus(error instanceof Error ? error.message : 'Failed to load shortcuts.')
      }
    }
  }, [])

  useEffect(() => {
    void loadShortcuts()
  }, [loadShortcuts])

  const sendCommand = useCallback(async (command: string) => {
    if (connectionMode === 'wifi') {
      if (!host.trim()) throw new Error('Enter a device IP address for WiFi mode.')
      const result = await window.electronAPI.sendRemoteCommand(host, port, command)
      if (!result.success) throw new Error(result.error || result.response || 'Remote command failed.')
      return
    }

    const result = await window.electronAPI.sendCommand(command)
    if (!result.success) throw new Error(result.error || 'ADB command failed.')
  }, [connectionMode, host, port])

  const handleSend = useCallback(async (command: string) => {
    if (runningShortcutId) return
    setStatus(`Sending: ${command}`)
    try {
      await sendCommand(command)
      setStatus(`Sent: ${command}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to send command.')
    }
  }, [runningShortcutId, sendCommand])

  const openNewEditor = useCallback((currentInput: string) => {
    setEditingShortcut(null)
    setEditorInitialCommand(currentInput)
    setEditorOpen(true)
  }, [])

  const openEditEditor = useCallback((shortcut: CommandShortcut) => {
    setEditingShortcut(shortcut)
    setEditorInitialCommand('')
    setEditorOpen(true)
  }, [])

  const handleSave = useCallback(async (input: CommandShortcutSaveInput) => {
    setSaving(true)
    try {
      const result = await window.electronAPI.saveCommandShortcut(input)
      if (!result.success) throw new Error(result.error || 'Failed to save shortcut.')
      if (result.shortcut) {
        setSwitchStates((current) => ({
          ...current,
          [result.shortcut!.id]: result.shortcut!.stateSwitch && result.shortcut!.defaultState,
        }))
      }
      setEditorOpen(false)
      setEditingShortcut(null)
      await loadShortcuts()
      setStatus(`Saved shortcut: ${input.name}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to save shortcut.')
    } finally {
      setSaving(false)
    }
  }, [loadShortcuts])

  const handleDelete = useCallback(async (shortcut: CommandShortcut) => {
    if (!window.confirm(`Delete shortcut "${shortcut.name}"?`)) return
    try {
      const result = await window.electronAPI.deleteCommandShortcut(shortcut.id)
      if (!result.success) throw new Error(result.error || 'Failed to delete shortcut.')
      setSwitchStates((current) => {
        const next = { ...current }
        delete next[shortcut.id]
        return next
      })
      await loadShortcuts()
      setStatus(`Deleted shortcut: ${shortcut.name}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to delete shortcut.')
    }
  }, [loadShortcuts])

  const handleCopy = useCallback(async (shortcut: CommandShortcut) => {
    if (copyingShortcutId) return
    const namesInSection = new Set(
      shortcuts
        .filter((item) => item.section === shortcut.section)
        .map((item) => item.name.toLocaleLowerCase()),
    )
    let copyName = `${shortcut.name} Copy`
    let copyNumber = 2
    while (namesInSection.has(copyName.toLocaleLowerCase())) {
      copyName = `${shortcut.name} Copy ${copyNumber}`
      copyNumber += 1
    }

    setCopyingShortcutId(shortcut.id)
    try {
      const result = await window.electronAPI.saveCommandShortcut({
        name: copyName,
        section: shortcut.section,
        description: shortcut.description,
        stateSwitch: shortcut.stateSwitch,
        defaultState: shortcut.defaultState,
        commands: shortcut.commands.map((step) => ({ ...step })),
      })
      if (!result.success) throw new Error(result.error || 'Failed to copy shortcut.')
      await loadShortcuts()
      setStatus(`Copied shortcut: ${copyName}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to copy shortcut.')
    } finally {
      setCopyingShortcutId(null)
    }
  }, [copyingShortcutId, loadShortcuts, shortcuts])

  const runShortcut = useCallback(async (shortcut: CommandShortcut, switchState?: boolean) => {
    if (runningShortcutId) return false
    setRunningShortcutId(shortcut.id)
    let failures = 0

    for (let index = 0; index < shortcut.commands.length; index += 1) {
      const step = shortcut.commands[index]
      const command = shortcut.stateSwitch
        ? `${step.command} ${switchState ? 1 : 0}`
        : step.command
      setStatus(`${shortcut.name}: ${index + 1}/${shortcut.commands.length} - ${command}`)
      try {
        await sendCommand(command)
      } catch (error) {
        failures += 1
        setStatus(`${shortcut.name}: ${error instanceof Error ? error.message : 'Command failed.'}`)
      }
      if (index < shortcut.commands.length - 1 && step.waitSeconds > 0) {
        await wait(step.waitSeconds)
      }
      if (!mountedRef.current) return false
    }

    setRunningShortcutId(null)
    setStatus(failures
      ? `${shortcut.name} completed with ${failures} failure(s).`
      : `${shortcut.name} completed.`)
    return failures === 0
  }, [runningShortcutId, sendCommand])

  const handleSwitchChange = useCallback(async (shortcut: CommandShortcut, checked: boolean) => {
    if (runningShortcutId) return
    const previousState = switchStates[shortcut.id] ?? shortcut.defaultState
    setSwitchStates((current) => ({ ...current, [shortcut.id]: checked }))
    const succeeded = await runShortcut(shortcut, checked)
    if (!succeeded && mountedRef.current) {
      setSwitchStates((current) => ({ ...current, [shortcut.id]: previousState }))
    }
  }, [runShortcut, runningShortcutId, switchStates])

  const groupedShortcuts = useMemo(() => {
    const groups = new Map<string, CommandShortcut[]>()
    for (const shortcut of shortcuts) {
      const current = groups.get(shortcut.section) ?? []
      current.push(shortcut)
      groups.set(shortcut.section, current)
    }
    return [...groups.entries()]
  }, [shortcuts])

  return (
    <div className={styles.container}>
      <header className={styles.header}>Command Palette 2</header>

      <main className={styles.content}>
        <section className={styles.section}>
          <div className={styles.sectionTitle}>Connection Mode</div>
          <div className={styles.connectionGrid}>
            <div className={styles.segmented}>
              <button className={connectionMode === 'adb' ? styles.activeSegment : undefined} onClick={() => setConnectionMode('adb')} type="button">ADB</button>
              <button className={connectionMode === 'wifi' ? styles.activeSegment : undefined} onClick={() => setConnectionMode('wifi')} type="button">WiFi</button>
            </div>
            <label className={styles.field}>
              <span>Device IP</span>
              <input value={host} onChange={(event) => setHost(event.target.value)} placeholder="10.183.74.103" disabled={connectionMode === 'adb'} spellCheck={false} />
            </label>
            <label className={styles.portField}>
              <span>Port</span>
              <input value={port} onChange={(event) => setPort(event.target.value)} inputMode="numeric" disabled={connectionMode === 'adb'} spellCheck={false} />
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionTitle}>Command Line</div>
          <CommandSection
            onSend={handleSend}
            autocompletePlacement="bottom"
            secondaryActionLabel="Shortcuts"
            onSecondaryAction={openNewEditor}
          />
        </section>

        <section className={`${styles.section} ${styles.shortcutsSection}`}>
          <div className={styles.sectionTitle}>Shortcuts</div>
          <div className={styles.shortcutScroller}>
            {!groupedShortcuts.length && (
              <div className={styles.emptyState}>Create a shortcut from the Command Line section.</div>
            )}
            {groupedShortcuts.map(([sectionName, sectionShortcuts]) => (
              <div className={styles.shortcutGroup} key={sectionName}>
                <div className={styles.groupTitle}>{sectionName}</div>
                <div className={styles.shortcutGrid}>
                  {sectionShortcuts.map((shortcut) => (
                    <div className={styles.shortcutItem} key={shortcut.id}>
                      {shortcut.stateSwitch ? (
                        <label
                          className={`${styles.shortcutButton} ${styles.switchButton}`}
                          data-disabled={Boolean(runningShortcutId || copyingShortcutId)}
                          title={shortcut.description
                            ? `${shortcut.description}\n${shortcut.commands.length} state command(s)`
                            : `${shortcut.commands.length} state command(s)`}
                        >
                          <input
                            type="checkbox"
                            checked={switchStates[shortcut.id] ?? shortcut.defaultState}
                            onChange={(event) => void handleSwitchChange(shortcut, event.target.checked)}
                            disabled={Boolean(runningShortcutId || copyingShortcutId)}
                          />
                          <span>{runningShortcutId === shortcut.id ? 'Running...' : shortcut.name}</span>
                        </label>
                      ) : (
                        <button
                          className={styles.shortcutButton}
                          onClick={() => void runShortcut(shortcut)}
                          disabled={Boolean(runningShortcutId || copyingShortcutId)}
                          title={shortcut.description
                            ? `${shortcut.description}\n${shortcut.commands.length} command(s)`
                            : `${shortcut.commands.length} command(s)`}
                          type="button"
                        >
                          {runningShortcutId === shortcut.id ? 'Running...' : shortcut.name}
                        </button>
                      )}
                      <button className={styles.itemAction} onClick={() => void handleCopy(shortcut)} disabled={Boolean(runningShortcutId || copyingShortcutId)} title="Copy shortcut" type="button">Copy</button>
                      <button className={styles.itemAction} onClick={() => openEditEditor(shortcut)} disabled={Boolean(runningShortcutId || copyingShortcutId)} title="Edit shortcut" type="button">Edit</button>
                      <button className={styles.itemAction} onClick={() => void handleDelete(shortcut)} disabled={Boolean(runningShortcutId || copyingShortcutId)} title="Delete shortcut" type="button">Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.status}>{status}</footer>

      {editorOpen && (
        <ShortcutEditorDialog
          shortcut={editingShortcut}
          initialCommand={editorInitialCommand}
          saving={saving}
          onCancel={() => setEditorOpen(false)}
          onSave={(input) => void handleSave(input)}
        />
      )}
    </div>
  )
}
