import { describe, expect, it } from 'vitest'
import { buildPdf } from './pdf'

function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

describe('Documents SDK ΓÇö minimal PDF writer', () => {
  it('produces a structurally valid PDF', () => {
    const pdf = buildPdf({ title: 'Report', lines: ['Hello world'] })
    const text = decode(pdf)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(text).toContain('/Type /Catalog')
    expect(text).toContain('/Type /Page')
    expect(text).toContain('/BaseFont /Helvetica')
    expect(text).toContain('startxref')
  })

  it('embeds the title and body text', () => {
    const pdf = buildPdf({ title: 'Q3 Sales', subtitle: 'Generated', lines: ['Total units: 50', 'Mean price: 7.125'] })
    const text = decode(pdf)
    expect(text).toContain('Q3 Sales')
    expect(text).toContain('Total units: 50')
    expect(text).toContain('Mean price: 7.125')
  })

  it('produces a valid cross-reference table with matching offsets', () => {
    const pdf = buildPdf({ title: 'T', lines: ['a', 'b', 'c'] })
    const text = decode(pdf)
    const xrefMatch = text.match(/startxref\n(\d+)\n%%EOF/)
    expect(xrefMatch).toBeTruthy()
    const startXref = Number(xrefMatch![1])
    expect(text.slice(startXref).startsWith('xref')).toBe(true)
  })

  it('splits long content across multiple pages', () => {
    const lines = Array.from({ length: 120 }, (_, i) => `line-${i}`)
    const pdf = buildPdf({ title: 'Long', lines })
    const text = decode(pdf)
    const pageCount = (text.match(/\/Type \/Page\b/g) ?? []).length
    expect(pageCount).toBeGreaterThan(1)
    expect(text).toContain('line-119')
  })

  it('sanitizes non-ASCII characters to ASCII', () => {
    const pdf = buildPdf({ title: 'Caf\u00e9', lines: ['na\u00efve'] })
    const text = decode(pdf)
    expect(text).not.toContain('\u00e9')
  })
})
