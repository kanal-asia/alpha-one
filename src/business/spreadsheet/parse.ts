/**
 * Alpha Workspace ΓÇö Spreadsheet SDK: CSV parsing (pure)
 */

export interface ParsedTable {
  headers: string[]
  rows: string[][]
}

/**
 * Minimal CSV parser supporting quoted fields, escaped quotes and CRLF/LF.
 * Returns raw string cells; numeric conversion happens in analysis.
 */
export function parseCsv(text: string): ParsedTable {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  const pushField = () => {
    row.push(field)
    field = ''
  }
  const pushRow = () => {
    pushField()
    if (row.some((cell) => cell.trim().length > 0)) {
      rows.push(row)
    }
    row = []
  }

  const chars = text.replace(/^\uFEFF/, '').split('')
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (inQuotes) {
      if (ch === '"') {
        if (chars[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      pushField()
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && chars[i + 1] === '\n') i++
      pushRow()
    } else {
      field += ch
    }
  }
  if (field.length > 0 || row.length > 0) {
    pushRow()
  }

  const headers = rows[0] ?? []
  const data = rows.slice(1).map((r) => {
    while (r.length < headers.length) r.push('')
    return r
  })
  return { headers, rows: data }
}

/** Loads a local spreadsheet file path into text (used by read on node side). */
export function tableToText(table: ParsedTable): string {
  const lines = [table.headers.join(',')]
  for (const row of table.rows) lines.push(row.join(','))
  return lines.join('\n')
}
