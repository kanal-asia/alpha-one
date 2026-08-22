/**
 * Alpha Workspace ΓÇö Documents SDK: minimal PDF writer (pure, dependency-free)
 *
 * Produces a valid single/multi-page PDF with a title, a subtitle and body
 * lines. Intentionally tiny: this is the "documents.pdf.create" step of the
 * vertical slice. No external PDF library is required. All content is
 * sanitized to ASCII so string `.length` equals byte length (no Buffer needed,
 * which keeps this module testable in the browser).
 */

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 50
const LINE_H = 14
const MAX_LINES_PER_PAGE = Math.floor((PAGE_H - MARGIN * 2) / LINE_H)

function escapePdf(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7e]/g, (c) => (c.charCodeAt(0) < 32 ? ' ' : '?'))
}

function wrap(text: string, widthChars: number): string[] {
  if (text.length <= widthChars) return [text]
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line && `${line} ${word}`.length > widthChars) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines
}

export interface PdfDocument {
  title: string
  subtitle?: string
  lines: string[]
}

export function buildPdf(doc: PdfDocument): Uint8Array {
  const bodyLines: string[] = []
  if (doc.subtitle) {
    bodyLines.push('')
    bodyLines.push(doc.subtitle)
    bodyLines.push('')
  }
  for (const line of doc.lines) {
    bodyLines.push(...wrap(line, 95))
  }

  const titleLines = wrap(doc.title, 95)
  const allLines: Array<{ text: string; bold: boolean }> = [
    ...titleLines.map((l) => ({ text: l, bold: true })),
    ...bodyLines.map((l) => ({ text: l, bold: false })),
  ]

  const pagesLines: string[][] = []
  let current: string[] = []
  let count = 0
  const flush = () => {
    if (current.length) pagesLines.push(current)
    current = []
    count = 0
  }
  for (const line of allLines) {
    if (count >= MAX_LINES_PER_PAGE) flush()
    current.push(line.bold ? `#B#${line.text}` : line.text)
    count++
  }
  flush()

  const pageCount = Math.max(1, pagesLines.length)

  const parts: string[] = []
  const offsets: number[] = []
  const push = (s: string) => {
    offsets.push(totalBytes(parts))
    parts.push(s)
  }

  const totalBytes = (list: string[]) =>
    list.reduce((acc, s) => acc + s.length, 0)

  push('%PDF-1.4\n')

  const pageObjIds: number[] = []
  const streamObjIds: number[] = []
  let id = 3 // catalog=1, pages=2
  for (let p = 0; p < pageCount; p++) pageObjIds.push(id++)
  const fontBoldId = id++
  const fontRegId = id++
  for (let p = 0; p < pageCount; p++) streamObjIds.push(id++)

  push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`)
  push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((o) => `${o} 0 R`).join(' ')}] /Count ${pageCount} >>\nendobj\n`,
  )

  for (let p = 0; p < pageCount; p++) {
    const pageId = pageObjIds[p]
    push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
        `/Resources << /Font << /F1 ${fontRegId} 0 R /F2 ${fontBoldId} 0 R >> >> /Contents ${streamObjIds[p]} 0 R >>\nendobj\n`,
    )
  }

  push(`${fontBoldId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n`)
  push(`${fontRegId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`)

  for (let p = 0; p < pageCount; p++) {
    const pageLines = pagesLines[p] ?? []
    let y = PAGE_H - MARGIN - 20
    let stream = 'BT\n'
    for (const raw of pageLines) {
      const bold = raw.startsWith('#B#')
      const text = bold ? raw.slice(3) : raw
      stream += `${bold ? '/F2' : '/F1'} ${bold ? 16 : 11} Tf 1 0 0 1 ${MARGIN} ${y} Tm (${escapePdf(text)}) Tj\n`
      y -= LINE_H
    }
    stream += 'ET'

    push(
      `${streamObjIds[p]} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    )
  }

  const startXref = totalBytes(parts)
  // offsets[0] is the PDF header (object 0 is always the free entry). Objects
  // 1..n are offsets[1..]. xref size must cover entries 0..(max object id).
  const size = offsets.length
  push(`xref\n0 ${size}\n`)
  push('0000000000 65535 f \n')
  for (let i = 1; i < size; i++) {
    push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`)
  }
  push(
    `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`,
  )

  return new TextEncoder().encode(parts.join(''))
}
