export type PsoDumpMode = 'pipeline-cache' | 'stable-key'

export interface PsoDumpColumn {
  key: string
  label: string
  group: string
  width: number
}

export interface PsoDumpRow {
  id: number
  recordType: string
  values: Record<string, string>
}

export interface PsoDumpReport {
  mode: PsoDumpMode
  columns: PsoDumpColumn[]
  rows: PsoDumpRow[]
  expectedTotal?: number
}

const PREFIX = 'LogShaderPipelineCacheTools: Display:'
const ZERO_HASH = '0000000000000000000000000000000000000000'
const HASH_PATTERN = /^[0-9A-F]{40}$/i

const column = (key: string, group: string, width = 120): PsoDumpColumn => ({ key, label: key, group, width })

const META_COLUMNS = [
  column('RecordType', 'Record', 105), column('Entry', 'Record', 75), column('PSOHash', 'Record', 115),
  column('UsageMask', 'Record', 165), column('BindCount', 'Record', 105),
]

const GRAPHICS_FIELD_NAMES = [
  'VertexShader', 'FragmentShader', 'GeometryShader', 'MeshShader', 'AmplificationShader',
  'BlendState', 'RasterizerState', 'DepthStencilState', 'MSAASamples', 'DepthStencilFormat',
  'DepthStencilFlags', 'DepthLoad', 'StencilLoad', 'DepthStore', 'StencilStore', 'PrimitiveType',
  'RenderTargetsActive',
  ...Array.from({ length: 8 }, (_, index) => [
    `RenderTargetFormats${index}`, `RenderTargetFlags${index}`,
    `RenderTargetsLoad${index}`, `RenderTargetsStore${index}`,
  ]).flat(),
  'SubpassHint', 'SubpassIndex', 'MultiViewCount', 'bHasFDMAttachment', 'DepthBounds',
  'VertexDescriptorNum', ...Array.from({ length: 17 }, (_, index) => `VertexDescriptor${index}`),
]

const graphicsGroup = (name: string): string => {
  if (name.endsWith('Shader')) return 'Shaders'
  if (name.startsWith('RenderTarget')) return 'Render Targets'
  if (name.startsWith('VertexDescriptor')) return 'Vertex Input'
  if (['BlendState', 'RasterizerState', 'DepthStencilState'].includes(name)) return 'Pipeline State'
  return 'Render State'
}

const fieldWidth = (name: string): number => {
  if (name.endsWith('Shader')) return 330
  if (name.endsWith('State')) return 260
  if (name.startsWith('VertexDescriptor')) return name === 'VertexDescriptorNum' ? 145 : 175
  if (name.startsWith('RenderTarget')) return 165
  return Math.max(105, name.length * 8 + 24)
}

const PIPELINE_COLUMNS: PsoDumpColumn[] = [
  ...META_COLUMNS,
  ...GRAPHICS_FIELD_NAMES.map((name) => column(name, graphicsGroup(name), fieldWidth(name))),
  column('ComputeShader', 'Compute', 330), column('RayTracingShader', 'Ray Tracing', 330),
  column('DeprecatedMaxPayloadSizeInBytes', 'Ray Tracing', 245), column('Frequency', 'Ray Tracing', 105),
  column('bAllowHitGroupIndexing', 'Ray Tracing', 190),
]

const STABLE_COLUMNS: PsoDumpColumn[] = [
  column('RecordType', 'Record', 115), column('AssetType', 'Asset', 185), column('AssetPath', 'Asset', 470),
  column('ShaderType', 'Shader', 420), column('ShaderClass', 'Shader', 145), column('MaterialDomain', 'Shader', 145),
  column('FeatureLevel', 'Shader', 120), column('QualityLevel', 'Shader', 120), column('ShaderStage', 'Shader', 115),
  column('ShaderPlatform', 'Shader', 140), column('VertexFactory', 'Shader', 260), column('Permutation', 'Shader', 115),
  column('OutputHash', 'Hashes', 330), column('PipelineHash', 'Hashes', 330),
]

function payload(line: string): string | null {
  const marker = line.indexOf(PREFIX)
  return marker < 0 ? null : line.slice(marker + PREFIX.length).trim()
}

function parsePipelineLog(log: string): PsoDumpReport {
  const rows: PsoDumpRow[] = []
  let entry = ''
  let psoHash = ''
  let usageMask = ''
  let bindCount = ''
  let expectedTotal: number | undefined

  for (const line of log.split(/\r?\n/)) {
    const value = payload(line)
    if (!value) continue
    const totalMatch = value.match(/^Total PSOs logged:\s*(\d+)/)
    if (totalMatch) {
      expectedTotal = Number(totalMatch[1])
      continue
    }
    const entryMatch = value.match(/^--- Entry (\d+)/)
    if (entryMatch) {
      entry = entryMatch[1]
      psoHash = ''
      usageMask = ''
      bindCount = ''
      continue
    }
    const metadata = value.match(/^PSO hash (\d+)(?: mask (\d+) bindc (\d+))?/)
    if (metadata) {
      psoHash = metadata[1]
      usageMask = metadata[2] || ''
      bindCount = metadata[3] || ''
      continue
    }

    const fields = value.split(',')
    let recordType = ''
    let fieldNames: string[] = []
    if (fields.length === GRAPHICS_FIELD_NAMES.length && HASH_PATTERN.test(fields[0])) {
      recordType = 'Graphics'
      fieldNames = GRAPHICS_FIELD_NAMES
    } else if (fields.length === 1 && HASH_PATTERN.test(fields[0])) {
      recordType = 'Compute'
      fieldNames = ['ComputeShader']
    } else if (fields.length === 4 && HASH_PATTERN.test(fields[0])) {
      recordType = 'RayTracing'
      fieldNames = ['RayTracingShader', 'DeprecatedMaxPayloadSizeInBytes', 'Frequency', 'bAllowHitGroupIndexing']
    } else continue

    const values: Record<string, string> = { RecordType: recordType, Entry: entry, PSOHash: psoHash, UsageMask: usageMask, BindCount: bindCount }
    fieldNames.forEach((name, index) => { values[name] = fields[index]?.trim() || '' })
    rows.push({ id: rows.length, recordType, values })
  }
  return { mode: 'pipeline-cache', columns: PIPELINE_COLUMNS, rows, expectedTotal }
}

function parseStableKeyLog(log: string): PsoDumpReport {
  const rows: PsoDumpRow[] = []
  for (const line of log.split(/\r?\n/)) {
    const value = payload(line)
    if (!value) continue
    const fields = value.split(',')
    if (fields.length < 12) continue
    const asset = fields[0].trim()
    const separator = asset.indexOf(' ')
    if (separator < 1 || !asset.slice(separator + 1).startsWith('/')) continue
    const values: Record<string, string> = {
      RecordType: 'StableKey', AssetType: asset.slice(0, separator), AssetPath: asset.slice(separator + 1),
      ShaderType: fields[1].trim(), ShaderClass: fields[2].trim(), MaterialDomain: fields[3].trim(),
      FeatureLevel: fields[4].trim(), QualityLevel: fields[5].trim(), ShaderStage: fields[6].trim(),
      ShaderPlatform: fields[7].trim(), VertexFactory: fields[8].trim() === 'null' ? '' : fields[8].trim(),
      Permutation: fields[9].trim(), OutputHash: fields[10].trim(),
      PipelineHash: fields[11].trim() === ZERO_HASH ? '' : fields[11].trim(),
    }
    rows.push({ id: rows.length, recordType: 'StableKey', values })
  }
  return { mode: 'stable-key', columns: STABLE_COLUMNS, rows }
}

export function parsePsoDumpLog(log: string, mode: PsoDumpMode): PsoDumpReport {
  return mode === 'stable-key' ? parseStableKeyLog(log) : parsePipelineLog(log)
}

export interface PsoTranslationResult {
  report: PsoDumpReport
  resolvedReferences: number
  totalReferences: number
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"'
        index++
      } else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell)
      if (row.some((value) => value.length > 0)) rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell || row.length) {
    row.push(cell.endsWith('\r') ? cell.slice(0, -1) : cell)
    if (row.some((value) => value.length > 0)) rows.push(row)
  }
  return rows
}

function csvColumn(name: string): PsoDumpColumn {
  const known = [...PIPELINE_COLUMNS, ...STABLE_COLUMNS].find((item) => item.key === name)
  if (known) return known
  if (name.endsWith('Assets')) return column(name, 'Resolved Assets', 520)
  return column(name, 'Imported', 180)
}

export function parsePsoDumpCsv(text: string): PsoDumpReport {
  const csvRows = parseCsv(text)
  if (csvRows.length === 0) throw new Error('The selected CSV is empty.')
  const headers = csvRows[0].map((value) => value.trim())
  if (!headers.includes('RecordType')) throw new Error('This is not a PSO Dump CSV: RecordType column is missing.')
  const mode: PsoDumpMode = headers.includes('AssetPath') && headers.includes('OutputHash') && !headers.includes('VertexShader')
    ? 'stable-key'
    : 'pipeline-cache'
  const columns = headers.map(csvColumn)
  const rows = csvRows.slice(1).map((fields, id) => {
    const values: Record<string, string> = {}
    headers.forEach((header, index) => { values[header] = fields[index] || '' })
    return { id, recordType: values.RecordType || (mode === 'stable-key' ? 'StableKey' : 'Unknown'), values }
  })
  return { mode, columns, rows, expectedTotal: mode === 'pipeline-cache' ? rows.length : undefined }
}

export function translatePipelineCsv(pipelineCsv: string, stableCsv: string): PsoTranslationResult {
  const pipeline = parsePsoDumpCsv(pipelineCsv)
  const stable = parsePsoDumpCsv(stableCsv)
  if (pipeline.mode !== 'pipeline-cache') throw new Error('Choose a pipeline-cache dump CSV as the source.')
  if (stable.mode !== 'stable-key') throw new Error('Choose a stable-key dump CSV for translation.')

  const assetsByHash = new Map<string, Set<string>>()
  const shaderTypesByHash = new Map<string, Set<string>>()
  for (const row of stable.rows) {
    const hash = row.values.OutputHash?.trim().toUpperCase()
    const assetPath = row.values.AssetPath?.trim()
    const shaderType = row.values.ShaderType?.trim()
    if (!hash) continue
    if (assetPath) {
      const assets = assetsByHash.get(hash) || new Set<string>()
      assets.add(assetPath)
      assetsByHash.set(hash, assets)
    }
    if (shaderType) {
      const shaderTypes = shaderTypesByHash.get(hash) || new Set<string>()
      shaderTypes.add(shaderType)
      shaderTypesByHash.set(hash, shaderTypes)
    }
  }

  const shaderColumns = ['VertexShader', 'FragmentShader', 'GeometryShader', 'MeshShader', 'AmplificationShader']
  const translatedColumnKeys = new Set(shaderColumns.map((key) => `${key}Assets`))
  const translatedColumns = pipeline.columns
    .filter((item) => !translatedColumnKeys.has(item.key))
    .flatMap((item) => shaderColumns.includes(item.key)
      ? [item, column(`${item.key}Assets`, 'Resolved Assets', 520)]
      : [item])
  let resolvedReferences = 0
  let totalReferences = 0
  const rows = pipeline.rows.map((row) => {
    const values = { ...row.values }
    for (const translatedColumnKey of translatedColumnKeys) delete values[translatedColumnKey]
    for (const shaderColumn of shaderColumns) {
      const hash = values[shaderColumn]?.trim().toUpperCase()
      if (!hash || hash === ZERO_HASH) {
        values[`${shaderColumn}Assets`] = ''
        continue
      }
      totalReferences++
      const translatedValues = shaderColumn === 'VertexShader'
        ? shaderTypesByHash.get(hash)
        : assetsByHash.get(hash)
      if (translatedValues?.size) {
        resolvedReferences++
        values[`${shaderColumn}Assets`] = [...translatedValues].sort().join(' | ')
      } else values[`${shaderColumn}Assets`] = ''
    }
    return { ...row, values }
  })

  return {
    report: { ...pipeline, columns: translatedColumns, rows },
    resolvedReferences,
    totalReferences,
  }
}
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function serializePsoDumpCsv(report: PsoDumpReport): string {
  const lines = [report.columns.map((item) => csvCell(item.label)).join(',')]
  for (const row of report.rows) lines.push(report.columns.map((item) => csvCell(row.values[item.key] || '')).join(','))
  return `${lines.join('\r\n')}\r\n`
}
