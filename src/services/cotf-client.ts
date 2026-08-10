import {
  DEFAULT_COTF_CLIENT_CONFIG,
  type CotfClientConfig,
} from '../types/config'
import { formatLaunchCommand } from './advanced-launch'

const ESCAPED_QUOTE = String.raw`\\\"`

function mergeUnique(saved: unknown, fallback: string[]): string[] {
  const values = Array.isArray(saved)
    ? saved.filter((value): value is string => typeof value === 'string')
    : []

  const merged = [...values, ...fallback]
    .map((value) => value.trim())
    .filter(Boolean)

  return [...new Set(merged)]
}

export function mergeCotfClientConfig(saved: unknown): CotfClientConfig {
  const savedConfig = saved && typeof saved === 'object'
    ? saved as Partial<CotfClientConfig>
    : {}

  const projects = mergeUnique(savedConfig.projects, DEFAULT_COTF_CLIENT_CONFIG.projects)
  const filehostips = mergeUnique(savedConfig.filehostips, DEFAULT_COTF_CLIENT_CONFIG.filehostips)

  return {
    activity: savedConfig.activity?.trim() || DEFAULT_COTF_CLIENT_CONFIG.activity,
    project: savedConfig.project?.trim() || projects[0] || DEFAULT_COTF_CLIENT_CONFIG.project,
    filehostip: savedConfig.filehostip?.trim() || filehostips[0] || DEFAULT_COTF_CLIENT_CONFIG.filehostip,
    projects,
    filehostips,
  }
}

function escapeParamValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, ESCAPED_QUOTE)
    .replace(/ /g, String.raw`\ `)
}

export function buildCotfClientParams(config: Pick<CotfClientConfig, 'project' | 'filehostip'>): string {
  const project = config.project.trim()
  const filehostip = config.filehostip.trim()
  const parts: string[] = []

  if (project) {
    parts.push(`-project=${ESCAPED_QUOTE}${escapeParamValue(project)}${ESCAPED_QUOTE}`)
  }

  if (filehostip) {
    parts.push(`-filehostip=${escapeParamValue(filehostip)}`)
  }

  return parts.length > 0 ? `${parts.join(String.raw`\ `)}\\` : ''
}

export function formatCotfClientCommand(
  config: Pick<CotfClientConfig, 'activity' | 'project' | 'filehostip'>,
  deviceSerial?: string | null,
): string {
  return formatLaunchCommand(config.activity, buildCotfClientParams(config), deviceSerial)
}
