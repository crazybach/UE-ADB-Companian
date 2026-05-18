import { useState, useCallback, useMemo } from 'react'
import paletteData from '../../data/ue_command_palette.json'
import styles from './CommandPaletteScreen.module.css'

interface PaletteCommand {
  Category: string
  Name: string
  Command: string
  'Default State': string
  Description: string
}

export default function CommandPaletteScreen() {
  const commands: PaletteCommand[] = useMemo(() => paletteData.commands || [], [])

  const [states, setStates] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const cmd of commands) {
      initial[cmd.Command] = cmd['Default State'] === '1'
    }
    return initial
  })

  const handleToggle = useCallback(async (command: string) => {
    const newState = !states[command]
    setStates((prev) => ({ ...prev, [command]: newState }))
    const cmdStr = `${command} ${newState ? '1' : '0'}`
    try {
      await window.electronAPI.sendCommand(cmdStr)
    } catch { /* ADB error */ }
  }, [states])

  const grouped = useMemo(() => {
    const map = new Map<string, PaletteCommand[]>()
    for (const cmd of commands) {
      if (!map.has(cmd.Category)) {
        map.set(cmd.Category, [])
      }
      map.get(cmd.Category)!.push(cmd)
    }
    return map
  }, [commands])

  return (
    <div className={styles.container}>
      <div className={styles.header}>Command Palette</div>
      <div className={styles.content}>
        {[...grouped.entries()].map(([category, cmds]) => (
          <div key={category} className={styles.category}>
            <div className={styles.categoryTitle}>{category}</div>
            <div className={styles.grid}>
              {cmds.map((cmd) => (
                <label
                  key={cmd.Command}
                  className={styles.item}
                  title={cmd.Description}
                >
                  <input
                    type="checkbox"
                    checked={states[cmd.Command] || false}
                    onChange={() => handleToggle(cmd.Command)}
                  />
                  <span>{cmd.Name}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
