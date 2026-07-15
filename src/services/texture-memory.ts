export interface TextureMemoryRow {
  id: number
  cookedDimensions: string
  cookedKB: number
  authoredBias: string
  currentDimensions: string
  currentKB: number
  format: string
  lodGroup: string
  name: string
  streaming: string
  unknownRef: string
  virtualTexture: string
  usageCount: number
  numMips: number
  uncompressed: string
}

export interface TextureMemoryReport {
  rows: TextureMemoryRow[]
  summaryLines: string[]
  totals: {
    textureCount: number
    currentKB: number
    cookedKB: number
    streamingCount: number
    virtualTextureCount: number
  }
}

function parseTextureSize(value: string): { dimensions: string; sizeKB: number; authoredBias: string } {
  const match = value.trim().match(/^(.*?)\s*\(\s*([\d.]+)\s*KB(?:\s*,\s*([^)]*))?\s*\)$/i)
  return {
    dimensions: match?.[1]?.trim() || value.trim(),
    sizeKB: Number.parseFloat(match?.[2] || '0') || 0,
    authoredBias: match?.[3]?.trim() || '',
  }
}

function parseRecord(line: string, id: number): TextureMemoryRow | null {
  const firstFieldEnd = line.indexOf(')')
  if (firstFieldEnd < 0) return null

  const cookedText = line.slice(0, firstFieldEnd + 1).trim()
  const remaining = line.slice(firstFieldEnd + 1).replace(/^\s*,\s*/, '').split(/,\s*/)
  if (remaining.length < 10) return null

  const cooked = parseTextureSize(cookedText)
  const current = parseTextureSize(remaining[0])

  return {
    id,
    cookedDimensions: cooked.dimensions,
    cookedKB: cooked.sizeKB,
    authoredBias: cooked.authoredBias,
    currentDimensions: current.dimensions,
    currentKB: current.sizeKB,
    format: remaining[1]?.trim() || '',
    lodGroup: remaining[2]?.trim() || '',
    name: remaining[3]?.trim() || '',
    streaming: remaining[4]?.trim() || '',
    unknownRef: remaining[5]?.trim() || '',
    virtualTexture: remaining[6]?.trim() || '',
    usageCount: Number.parseInt(remaining[7] || '0', 10) || 0,
    numMips: Number.parseInt(remaining[8] || '0', 10) || 0,
    uncompressed: remaining[9]?.trim() || '',
  }
}

export function parseTextureMemoryReport(content: string): TextureMemoryReport {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const beginMarker = 'MemReport: Begin command "ListTextures"'
  const endMarker = 'MemReport: End command "ListTextures"'
  const start = normalized.indexOf(beginMarker)
  const end = start >= 0 ? normalized.indexOf(endMarker, start + beginMarker.length) : -1

  if (start < 0 || end < 0) {
    throw new Error('No ListTextures section was found in this memreport.')
  }

  const lines = normalized
    .slice(start + beginMarker.length, end)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const headerIndex = lines.findIndex((line) => line.startsWith('Cooked/OnDisk:'))
  if (headerIndex < 0) {
    throw new Error('The ListTextures section has no recognized texture table header.')
  }

  const summaryIndex = lines.findIndex((line, index) => index > headerIndex && line.startsWith('Total size:'))
  const recordLines = lines.slice(headerIndex + 1, summaryIndex >= 0 ? summaryIndex : undefined)
  const rows = recordLines
    .map((line, index) => parseRecord(line, index + 1))
    .filter((row): row is TextureMemoryRow => row !== null)
  const summaryLines = summaryIndex >= 0 ? lines.slice(summaryIndex) : []

  if (rows.length === 0) {
    throw new Error('The ListTextures section did not contain any recognized texture rows.')
  }

  return {
    rows,
    summaryLines,
    totals: {
      textureCount: rows.length,
      currentKB: rows.reduce((sum, row) => sum + row.currentKB, 0),
      cookedKB: rows.reduce((sum, row) => sum + row.cookedKB, 0),
      streamingCount: rows.filter((row) => row.streaming.toUpperCase() === 'YES').length,
      virtualTextureCount: rows.filter((row) => row.virtualTexture.toUpperCase() === 'YES').length,
    },
  }
}
