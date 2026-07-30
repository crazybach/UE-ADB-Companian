export interface CommandShortcutStep {
  command: string
  waitSeconds: number
}

export interface CommandShortcut {
  id: string
  name: string
  section: string
  stateSwitch: boolean
  defaultState: boolean
  commands: CommandShortcutStep[]
}

export interface CommandShortcutSaveInput {
  id?: string
  name: string
  section: string
  stateSwitch: boolean
  defaultState: boolean
  commands: CommandShortcutStep[]
}

export interface CommandShortcutListResult {
  success: boolean
  shortcuts: CommandShortcut[]
  error?: string
}

export interface CommandShortcutSaveResult {
  success: boolean
  shortcut?: CommandShortcut
  error?: string
}
