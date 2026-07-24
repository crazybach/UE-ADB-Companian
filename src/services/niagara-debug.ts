export type NiagaraLocationMode = 'none' | 'location' | 'player'

export interface NiagaraSpawnOptions {
  systemPath: string
  attachToPlayer: boolean
  autoDestroy: boolean
  autoActivate: boolean
  preCullCheck: boolean
  locationMode: NiagaraLocationMode
  location: [string, string, string]
}

function normalizeCoordinate(value: string, axis: string): string {
  const trimmed = value.trim()
  if (!trimmed || !Number.isFinite(Number(trimmed))) {
    throw new Error(`${axis} must be a valid number.`)
  }
  return trimmed
}

export function buildNiagaraSpawnCommand(options: NiagaraSpawnOptions): string {
  let systemPath = options.systemPath.trim()
  if (systemPath.startsWith('Game/')) systemPath = `/${systemPath}`
  if (!systemPath.startsWith('/Game/') || !systemPath.includes('.')) {
    throw new Error('Choose or enter a valid /Game Niagara system path.')
  }

  const parameters = [
    `AttachToPlayer=${options.attachToPlayer ? 1 : 0}`,
    `AutoDestroy=${options.autoDestroy ? 1 : 0}`,
    `AutoActivate=${options.autoActivate ? 1 : 0}`,
    `PreCullCheck=${options.preCullCheck ? 1 : 0}`,
  ]

  if (options.locationMode !== 'none') {
    const coordinates = options.location.map((value, index) => (
      normalizeCoordinate(value, ['X', 'Y', 'Z'][index])
    ))
    const key = options.locationMode === 'location' ? 'Location' : 'LocationFromPlayer'
    parameters.push(`${key}=${coordinates.join(',')}`)
  }

  return `fx.Niagara.Debug.SpawnComponent ${systemPath} ${parameters.join(' ')}`
}
