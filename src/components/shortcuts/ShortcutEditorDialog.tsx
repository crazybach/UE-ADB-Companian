import { useEffect, useState } from 'react'
import type { CommandShortcut, CommandShortcutSaveInput, CommandShortcutStep } from '../../types/command-shortcut'
import styles from './ShortcutEditorDialog.module.css'

interface ShortcutEditorDialogProps {
  shortcut: CommandShortcut | null
  initialCommand: string
  saving: boolean
  onCancel: () => void
  onSave: (shortcut: CommandShortcutSaveInput) => void
}

const emptyStep = (): CommandShortcutStep => ({ command: '', waitSeconds: 1 })

export default function ShortcutEditorDialog({
  shortcut,
  initialCommand,
  saving,
  onCancel,
  onSave,
}: ShortcutEditorDialogProps) {
  const [name, setName] = useState('')
  const [section, setSection] = useState('Global')
  const [description, setDescription] = useState('')
  const [stateSwitch, setStateSwitch] = useState(false)
  const [defaultState, setDefaultState] = useState(false)
  const [commands, setCommands] = useState<CommandShortcutStep[]>([emptyStep()])

  useEffect(() => {
    setName(shortcut?.name ?? '')
    setSection(shortcut?.section ?? 'Global')
    setDescription(shortcut?.description ?? '')
    setStateSwitch(shortcut?.stateSwitch ?? false)
    setDefaultState(shortcut?.defaultState ?? false)
    setCommands(shortcut?.commands.map((step) => ({ ...step })) ?? [
      initialCommand ? { command: initialCommand, waitSeconds: 0 } : emptyStep(),
    ])
  }, [initialCommand, shortcut])

  const updateStep = (index: number, patch: Partial<CommandShortcutStep>) => {
    setCommands((current) => current.map((step, stepIndex) => (
      stepIndex === index ? { ...step, ...patch } : step
    )))
  }

  const removeStep = (index: number) => {
    setCommands((current) => current.length === 1
      ? [emptyStep()]
      : current.filter((_, stepIndex) => stepIndex !== index))
  }

  const validCommands = commands.filter((step) => step.command.trim())
  const canSave = Boolean(name.trim() && section.trim() && validCommands.length && !saving)

  return (
    <div className={styles.backdrop} role="presentation">
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="shortcut-editor-title">
        <header className={styles.header} id="shortcut-editor-title">
          {shortcut ? 'Edit Shortcut' : 'New Shortcut'}
        </header>

        <div className={styles.content}>
          <div className={styles.metadata}>
            <label>
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
            </label>
            <label>
              <span>Section Name</span>
              <input value={section} onChange={(event) => setSection(event.target.value)} />
            </label>
          </div>

          <label className={styles.descriptionField}>
            <span>Description</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Shown when hovering over the shortcut"
            />
          </label>

          <div className={styles.switchOptions}>
            <label>
              <input
                type="checkbox"
                checked={stateSwitch}
                onChange={(event) => {
                  setStateSwitch(event.target.checked)
                  if (!event.target.checked) setDefaultState(false)
                }}
              />
              State Switch
            </label>
            <label>
              <input
                type="checkbox"
                checked={defaultState}
                onChange={(event) => setDefaultState(event.target.checked)}
                disabled={!stateSwitch}
              />
              Initially Checked
            </label>
          </div>

          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th className={styles.indexColumn}>#</th>
                  <th>Command</th>
                  <th className={styles.waitColumn}>Wait Seconds</th>
                  <th className={styles.actionColumn}>Remove</th>
                </tr>
              </thead>
              <tbody>
                {commands.map((step, index) => (
                  <tr key={index}>
                    <td>{index + 1}</td>
                    <td>
                      <input
                        value={step.command}
                        onChange={(event) => updateStep(index, { command: event.target.value })}
                        placeholder="UE console command"
                        spellCheck={false}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={step.waitSeconds}
                        onChange={(event) => updateStep(index, {
                          waitSeconds: Math.max(0, Number(event.target.value) || 0),
                        })}
                      />
                    </td>
                    <td>
                      <button className={styles.iconButton} onClick={() => removeStep(index)} type="button" title="Remove command">
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button className={styles.addButton} onClick={() => setCommands((current) => [...current, emptyStep()])} type="button">
            Add Command
          </button>
        </div>

        <footer className={styles.actions}>
          <button className={styles.secondaryButton} onClick={onCancel} disabled={saving} type="button">Cancel</button>
          <button
            className={styles.primaryButton}
            disabled={!canSave}
            onClick={() => onSave({
              id: shortcut?.id,
              name: name.trim(),
              section: section.trim(),
              description: description.trim(),
              stateSwitch,
              defaultState: stateSwitch && defaultState,
              commands: validCommands.map((step) => ({
                command: step.command.trim(),
                waitSeconds: Math.max(0, Number(step.waitSeconds) || 0),
              })),
            })}
            type="button"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  )
}
