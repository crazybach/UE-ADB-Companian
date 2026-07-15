export type ObjectMemoryKind = 'static-mesh' | 'skeletal-mesh' | 'static-mesh-component'

export interface ObjectMemoryRow {
  id: number
  className: string
  objectPath: string
  numKB: number
  maxKB: number
  resExcKB: number
  resExcDedSysKB: number
  resExcDedVidKB: number
  resExcUnkKB: number
}

export interface ObjectMemoryReport {
  kind: ObjectMemoryKind
  rows: ObjectMemoryRow[]
  summaryLines: string[]
  totals: {
    objectCount: number
    numKB: number
    maxKB: number
    resExcKB: number
    resExcDedSysKB: number
    resExcDedVidKB: number
    resExcUnkKB: number
  }
}

interface ObjectMemoryDefinition {
  command: string
  rowClasses: RegExp
  label: string
}

export const OBJECT_MEMORY_DEFINITIONS: Record<ObjectMemoryKind, ObjectMemoryDefinition> = {
  'static-mesh': {
    command: 'obj list class=StaticMesh -alphasort',
    rowClasses: /^StaticMesh$/,
    label: 'Static Mesh',
  },
  'skeletal-mesh': {
    command: 'obj list class=SkeletalMesh -alphasort',
    rowClasses: /^SkeletalMesh$/,
    label: 'Skeletal Mesh',
  },
  'static-mesh-component': {
    command: 'obj list class=StaticMeshComponent -alphasort',
    rowClasses: /^(?:StaticMeshComponent|HierarchicalInstancedStaticMeshComponent|InstancedStaticMeshComponent|FoliageInstancedStaticMeshComponent|SplineMeshComponent)$/,
    label: 'Static Mesh Component',
  },
}

const NUMBER = '([\\d.]+)'
const OBJECT_ROW = new RegExp(
  `^\\s*(\\S+)\\s+(\\/.+?)\\s+${NUMBER}\\s+${NUMBER}\\s+${NUMBER}\\s+${NUMBER}\\s+${NUMBER}\\s+${NUMBER}\\s*$`,
)

export function parseObjectMemoryReport(content: string, kind: ObjectMemoryKind): ObjectMemoryReport {
  const definition = OBJECT_MEMORY_DEFINITIONS[kind]
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const beginMarker = `MemReport: Begin command "${definition.command}"`
  const endMarker = `MemReport: End command "${definition.command}"`
  const start = normalized.indexOf(beginMarker)
  const end = start >= 0 ? normalized.indexOf(endMarker, start + beginMarker.length) : -1

  if (start < 0 || end < 0) {
    throw new Error(`No ${definition.label} object-list section was found in this memreport.`)
  }

  const lines = normalized
    .slice(start + beginMarker.length, end)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const headerIndex = lines.findIndex((line) => (
    line.includes('Object') && line.includes('NumKB') && line.includes('ResExcKB')
  ))

  if (headerIndex < 0) {
    throw new Error(`The ${definition.label} section has no recognized object table header.`)
  }

  const rows: ObjectMemoryRow[] = []
  const summaryLines: string[] = []

  for (const line of lines.slice(headerIndex + 1)) {
    const match = line.match(OBJECT_ROW)
    if (!match || !definition.rowClasses.test(match[1])) {
      summaryLines.push(line)
      continue
    }

    rows.push({
      id: rows.length + 1,
      className: match[1],
      objectPath: match[2],
      numKB: Number.parseFloat(match[3]) || 0,
      maxKB: Number.parseFloat(match[4]) || 0,
      resExcKB: Number.parseFloat(match[5]) || 0,
      resExcDedSysKB: Number.parseFloat(match[6]) || 0,
      resExcDedVidKB: Number.parseFloat(match[7]) || 0,
      resExcUnkKB: Number.parseFloat(match[8]) || 0,
    })
  }

  if (rows.length === 0) {
    throw new Error(`The ${definition.label} section did not contain any recognized object rows.`)
  }

  return {
    kind,
    rows,
    summaryLines,
    totals: {
      objectCount: rows.length,
      numKB: rows.reduce((sum, row) => sum + row.numKB, 0),
      maxKB: rows.reduce((sum, row) => sum + row.maxKB, 0),
      resExcKB: rows.reduce((sum, row) => sum + row.resExcKB, 0),
      resExcDedSysKB: rows.reduce((sum, row) => sum + row.resExcDedSysKB, 0),
      resExcDedVidKB: rows.reduce((sum, row) => sum + row.resExcDedVidKB, 0),
      resExcUnkKB: rows.reduce((sum, row) => sum + row.resExcUnkKB, 0),
    },
  }
}
