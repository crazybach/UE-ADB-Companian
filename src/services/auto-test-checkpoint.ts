const STORAGE_KEY = 'ue-console-adb:auto-test-checkpoints'

type CheckpointMap = Record<string, number>
export type AutoTestCheckpointScope = 'adb' | 'remote'

function scriptKey(scope: AutoTestCheckpointScope, filePath: string): string {
  const name = filePath.split(/[\\/]/).pop()?.trim().toLowerCase()
  return name ? `${scope}:${name}` : ''
}

function readCheckpoints(): CheckpointMap {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as CheckpointMap
  } catch {
    return {}
  }
}

function writeCheckpoints(checkpoints: CheckpointMap): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(checkpoints))
  } catch {
    // A blocked storage backend should not interrupt a running test.
  }
}

export function loadAutoTestCheckpoint(
  scope: AutoTestCheckpointScope,
  filePath: string,
  rowCount: number,
): number | null {
  const key = scriptKey(scope, filePath)
  if (!key) return null

  const checkpoints = readCheckpoints()
  const checkpoint = checkpoints[key]
  if (Number.isInteger(checkpoint) && checkpoint > 0 && checkpoint < rowCount) return checkpoint

  if (key in checkpoints) {
    delete checkpoints[key]
    writeCheckpoints(checkpoints)
  }
  return null
}

export function saveAutoTestCheckpoint(
  scope: AutoTestCheckpointScope,
  filePath: string,
  nextIndex: number,
): void {
  const key = scriptKey(scope, filePath)
  if (!key || nextIndex <= 0) return
  const checkpoints = readCheckpoints()
  checkpoints[key] = nextIndex
  writeCheckpoints(checkpoints)
}

export function clearAutoTestCheckpoint(scope: AutoTestCheckpointScope, filePath: string): void {
  const key = scriptKey(scope, filePath)
  if (!key) return
  const checkpoints = readCheckpoints()
  if (!(key in checkpoints)) return
  delete checkpoints[key]
  writeCheckpoints(checkpoints)
}
