export interface AutoTestRow {
  id: number
  command: string
  waitSeconds: number
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        inQuotes = false
      } else {
        cell += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\r') {
      if (next === '\n') i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  if (row.some((value) => value.trim())) {
    rows.push(row)
  }

  return rows
}

export function parseAutoTestCsv(text: string): AutoTestRow[] {
  return parseCsv(text)
    .map((columns, index) => {
      const command = (columns[0] || '').trim()
      const waitValue = Number.parseFloat((columns[1] || '').trim())

      return {
        id: index + 1,
        command,
        waitSeconds: Number.isFinite(waitValue) && waitValue > 0 ? waitValue : 0,
      }
    })
    .filter((row) => row.command && !row.command.startsWith('--'))
}
