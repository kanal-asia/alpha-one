/**
 * Alpha Workspace ΓÇö Reporting SDK: report model + deterministic summary (pure)
 */
import type { SpreadsheetAnalysis } from '../spreadsheet/analyze'

export interface ReportColumnSection {
  name: string
  type: 'number' | 'text' | 'empty'
  rows: number
  nonEmpty: number
  unique: number
  stats: { sum: number | null; mean: number | null; min: number | null; max: number | null }
}

export interface ReportDto {
  title: string
  source: string
  generatedAt: string
  overview: {
    columns: number
    rows: number
    totalCells: number
    nonEmptyCells: number
  }
  summary: string
  columns: ReportColumnSection[]
  numericColumns: number
}

const EMPTY = 'n/a'

function fmt(n: number | null): string {
  return n === null ? EMPTY : Number(n.toFixed(4)).toString()
}

export function buildReport(opts: {
  title: string
  source: string
  analysis: SpreadsheetAnalysis
}): ReportDto {
  const { title, source, analysis } = opts

  const columns: ReportColumnSection[] = analysis.columns.map((c) => ({
    name: c.name,
    type: c.type,
    rows: analysis.rowCount,
    nonEmpty: c.nonEmpty,
    unique: c.unique,
    stats: { sum: c.sum, mean: c.mean, min: c.min, max: c.max },
  }))

  const numericColumns = columns.filter((c) => c.type === 'number')
  const numericParts = numericColumns.map((c) => {
    return `${c.name} (mean ${fmt(c.stats.mean)}, min ${fmt(c.stats.min)}, max ${fmt(c.stats.max)})`
  })

  const summary =
    `This report covers ${analysis.rowCount} data rows across ${analysis.columnCount} columns ` +
    `(${analysis.nonEmptyCells} of ${analysis.totalCells} cells populated, ${numericColumns.length} numeric columns). ` +
    (numericParts.length > 0
      ? `Numeric highlights: ${numericParts.join('; ')}.`
      : 'No numeric columns were detected; values are textual.') +
    ` Generated deterministically from the local source "${source}".`

  return {
    title,
    source,
    generatedAt: new Date().toISOString(),
    overview: {
      columns: analysis.columnCount,
      rows: analysis.rowCount,
      totalCells: analysis.totalCells,
      nonEmptyCells: analysis.nonEmptyCells,
    },
    summary,
    columns,
    numericColumns: numericColumns.length,
  }
}

export function reportToPdfLines(report: ReportDto): string[] {
  const lines: string[] = [
    `Source: ${report.source}`,
    `Generated: ${report.generatedAt}`,
    '',
    `Rows: ${report.overview.rows} | Columns: ${report.overview.columns}`,
    `Cells populated: ${report.overview.nonEmptyCells} / ${report.overview.totalCells}`,
    `Numeric columns: ${report.numericColumns}`,
    '',
    'Summary:',
    report.summary,
    '',
    'Per-column analysis:',
  ]
  for (const col of report.columns) {
    const stats =
      col.type === 'number'
        ? `sum=${fmt(col.stats.sum)} mean=${fmt(col.stats.mean)} min=${fmt(col.stats.min)} max=${fmt(col.stats.max)}`
        : col.type === 'empty'
          ? 'empty column'
          : 'text values'
    lines.push(`- ${col.name} (${col.type}, ${col.nonEmpty}/${col.rows} filled, ${col.unique} unique): ${stats}`)
  }
  return lines
}

/** Deterministic summary document (JSON artifact payload). */
export function summaryJson(report: ReportDto): Record<string, unknown> {
  return {
    title: report.title,
    source: report.source,
    generatedAt: report.generatedAt,
    overview: report.overview,
    summary: report.summary,
    columns: report.columns.map((c) => ({
      name: c.name,
      type: c.type,
      nonEmpty: c.nonEmpty,
      unique: c.unique,
      stats: c.stats,
    })),
    numericColumns: report.numericColumns,
  }
}

/** Full statistics report (text artifact payload). */
export function statisticsText(
  analysis: SpreadsheetAnalysis,
  report: ReportDto,
): string {
  const lines: string[] = [
    `Statistics Report ΓÇö ${report.source}`,
    `Generated deterministically by Alpha One at ${report.generatedAt}`,
    '',
    'Overview',
    `  Rows: ${analysis.rowCount}`,
    `  Columns: ${analysis.columnCount}`,
    `  Total cells: ${analysis.totalCells}`,
    `  Non-empty cells: ${analysis.nonEmptyCells}`,
    `  Numeric columns: ${report.numericColumns}`,
    '',
    'Per-column statistics',
  ]
  for (const col of analysis.columns) {
    lines.push(
      `  ${col.name}`,
      `    type: ${col.type}`,
      `    non-empty: ${col.nonEmpty}`,
      `    numeric values: ${col.numericCount}`,
      `    unique: ${col.unique}`,
      `    sum: ${fmt(col.sum)}`,
      `    mean: ${fmt(col.mean)}`,
      `    min: ${fmt(col.min)}`,
      `    max: ${fmt(col.max)}`,
    )
  }
  lines.push('', 'End of report.')
  return lines.join('\n')
}
