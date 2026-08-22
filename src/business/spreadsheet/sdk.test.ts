import { describe, expect, it } from 'vitest'
import { parseCsv } from './parse'
import { analyzeSpreadsheet } from './analyze'

describe('Spreadsheet SDK ΓÇö CSV parsing', () => {
  it('parses a simple CSV into headers and rows', () => {
    const table = parseCsv('a,b,c\n1,2,3\n4,5,6')
    expect(table.headers).toEqual(['a', 'b', 'c'])
    expect(table.rows).toHaveLength(2)
    expect(table.rows[0]).toEqual(['1', '2', '3'])
  })

  it('handles quoted fields and escaped quotes', () => {
    const table = parseCsv('name,note\n"Smith, John","said ""hi"""')
    expect(table.headers).toEqual(['name', 'note'])
    expect(table.rows[0]).toEqual(['Smith, John', 'said "hi"'])
  })

  it('handles CRLF line endings and BOM', () => {
    const table = parseCsv('\uFEFFx,y\r\n1,2\r\n3,4\r\n')
    expect(table.headers).toEqual(['x', 'y'])
    expect(table.rows).toHaveLength(2)
  })

  it('drops fully empty trailing rows', () => {
    const table = parseCsv('x\n1\n\n\n')
    expect(table.rows).toHaveLength(1)
  })
})

describe('Spreadsheet SDK ΓÇö deterministic analysis', () => {
  const table = parseCsv('product,units,price\nA,10,5\nB,20,7.5\nC,15,4\nD,5,12')
  const analysis = analyzeSpreadsheet(table.headers, table.rows)

  it('computes row/column counts', () => {
    expect(analysis.rowCount).toBe(4)
    expect(analysis.columnCount).toBe(3)
    expect(analysis.totalCells).toBe(12)
    expect(analysis.nonEmptyCells).toBe(12)
  })

  it('classifies numeric vs text columns', () => {
    const byName = Object.fromEntries(analysis.columns.map((c) => [c.name, c]))
    expect(byName['product'].type).toBe('text')
    expect(byName['units'].type).toBe('number')
    expect(byName['price'].type).toBe('number')
  })

  it('computes numeric stats', () => {
    const units = analysis.columns.find((c) => c.name === 'units')!
    expect(units.sum).toBe(50)
    expect(units.mean).toBe(12.5)
    expect(units.min).toBe(5)
    expect(units.max).toBe(20)
    expect(units.unique).toBe(4)
  })

  it('handles empty columns as empty type', () => {
    const t = parseCsv('a,b\n1,\n2,')
    const a = analyzeSpreadsheet(t.headers, t.rows)
    const b = a.columns.find((c) => c.name === 'b')!
    expect(b.type).toBe('empty')
    expect(b.nonEmpty).toBe(0)
  })
})
