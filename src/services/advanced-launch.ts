import {
  DEFAULT_ADVANCED_LAUNCH_CONFIG,
  DEFAULT_ADVANCED_LAUNCH_ACTIVITY,
  type AdvancedLaunchConfig,
  type AdvancedLaunchRow,
} from '../types/config'

type AdvancedLaunchCategory = 'direct' | 'execCmds' | 'dpcvars'

const ESCAPED_GROUP_QUOTE = String.raw`\\\"`

function cloneRows(rows: AdvancedLaunchRow[]): AdvancedLaunchRow[] {
  return rows.map((row) => ({ ...row }))
}

function isRow(value: unknown): value is AdvancedLaunchRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return typeof row.id === 'string'
    && typeof row.enabled === 'boolean'
    && typeof row.value === 'string'
}

function mergeRows(
  savedRows: unknown,
  defaultRows: AdvancedLaunchRow[],
): AdvancedLaunchRow[] {
  if (!Array.isArray(savedRows)) {
    return cloneRows(defaultRows)
  }

  const merged = savedRows.filter(isRow).map((row) => ({ ...row }))
  const knownIds = new Set(merged.map((row) => row.id))

  for (const row of defaultRows) {
    if (!knownIds.has(row.id)) {
      merged.push({ ...row })
    }
  }

  return merged.length > 0 ? merged : cloneRows(defaultRows)
}

export function mergeAdvancedLaunchConfig(
  saved: unknown,
  fallbackActivity = DEFAULT_ADVANCED_LAUNCH_ACTIVITY,
): AdvancedLaunchConfig {
  const savedConfig = saved && typeof saved === 'object'
    ? saved as Partial<Record<keyof AdvancedLaunchConfig, unknown>>
    : {}

  const activity =
    typeof savedConfig.activity === 'string' && savedConfig.activity.trim()
      ? savedConfig.activity
      : fallbackActivity

  return {
    activity,
    direct: mergeRows(savedConfig.direct, DEFAULT_ADVANCED_LAUNCH_CONFIG.direct),
    execCmds: mergeRows(savedConfig.execCmds, DEFAULT_ADVANCED_LAUNCH_CONFIG.execCmds),
    dpcvars: mergeRows(savedConfig.dpcvars, DEFAULT_ADVANCED_LAUNCH_CONFIG.dpcvars),
  }
}

function enabledValues(rows: AdvancedLaunchRow[]): string[] {
  return rows
    .filter((row) => row.enabled)
    .map((row) => row.value.trim())
    .filter(Boolean)
}

function escapeGroupedValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, ESCAPED_GROUP_QUOTE)
    .replace(/ /g, String.raw`\ `)
    .replace(/,/g, String.raw`\,`)
}

function buildGroupedParameter(prefix: '-ExecCmds' | '-dpcvars', values: string[]): string | null {
  if (values.length === 0) return null
  return `${prefix}=${ESCAPED_GROUP_QUOTE}${escapeGroupedValue(values.join(','))}${ESCAPED_GROUP_QUOTE}\\`
}

export function buildAdvancedLaunchParams(config: Pick<AdvancedLaunchConfig, AdvancedLaunchCategory>): string {
  const parts = [
    ...enabledValues(config.direct),
    buildGroupedParameter('-ExecCmds', enabledValues(config.execCmds)),
    buildGroupedParameter('-dpcvars', enabledValues(config.dpcvars)),
  ].filter((part): part is string => Boolean(part))

  return parts.join(' ')
}

export function formatLaunchCommand(activity: string, parameters: string): string {
  const trimmedActivity = activity.trim()
  if (!parameters.trim()) {
    return `adb shell am start -n ${trimmedActivity}`
  }

  return `adb shell am start -n ${trimmedActivity} --es cmdline "${parameters} "`
}
