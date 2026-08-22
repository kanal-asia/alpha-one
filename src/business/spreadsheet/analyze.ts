/**
 * Alpha Workspace ΓÇö Spreadsheet SDK: deterministic analysis (pure)
 */

export interface ColumnStat {
  name: string
  type: 'number' | 'text' | 'empty'
  nonEmpty: number
  numericCount: number
  sum: number | null
  mean: number | null
  min: number | null
  max: number | null
  unique: number
}

export interface SpreadsheetAnalysis {
  columnCount: number
  rowCount: number
  totalCells: number
  nonEmptyCells: number
  columns: ColumnStat[]
  generatedAt: string
}

export function toNumber(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (trimmed === '') return null
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : null
}

export function analyzeSpreadsheet(
  headers: string[],
  rows: string[][],
): SpreadsheetAnalysis {
  const columns: ColumnStat[] = headers.map((header, colIndex) => {
    const values = rows.map((r) => r[colIndex] ?? '')
    const nonEmpty = values.filter((v) => v.trim().length > 0)
    const numeric = values.map(toNumber).filter((n): n is number => n !== null)
    const unique = new Set(values.map((v) => v.trim()).filter(Boolean)).size

    let sum: number | null = null
    let mean: number | null = null
    let min: number | null = null
    let max: number | null = null

    if (numeric.length > 0) {
      sum = numeric.reduce((a, b) => a + b, 0)
      mean = sum / numeric.length
      min = Math.min(...numeric)
      max = Math.max(...numeric)
    }

    const type: ColumnStat['type'] =
      numeric.length === nonEmpty.length && nonEmpty.length > 0
        ? 'number'
        : nonEmpty.length === 0
          ? 'empty'
          : 'text'

    return {
      name: header,
      type,
      nonEmpty: nonEmpty.length,
      numericCount: numeric.length,
      sum,
      mean,
      min,
      max,
      unique,
    }
  })

  const totalCells = headers.length * rows.length
  const nonEmptyCells = columns.reduce((acc, c) => acc + c.nonEmpty, 0)

  return {
    columnCount: headers.length,
    rowCount: rows.length,
    totalCells,
    nonEmptyCells,
    columns,
    generatedAt: new Date().toISOString(),
  }
}
