/**
 * TASK-087 §28 (+ TASK-090 visual encoding): visual-intelligence regression —
 * metric-aware Executive Summary, peer consistency, density adaptation,
 * determinism, palette discipline, factual traceability, proportional
 * encodings, distribution strategies, theme fallback, and visual QA.
 * Pure construction, no Google traffic.
 */
import { describe, expect, it } from 'vitest'
import {
  composeSlide,
  composeSlideOnPage,
  expectedTextsOf,
  extractMetricPhrase,
  parsePercentShare,
  PALETTE,
  type ComposeInput,
} from './beautify'
import {
  contrastRatio,
  findFabricatedNumbers,
  numericTokens,
  parseMagnitude,
  qaVisualQuality,
  resolvePageGeometry,
  resolveThemeRole,
  scaleProportional,
} from './geometry'
import { themeBackgroundRequest } from './visual'

const PAGE = 'SLIDE_VIS_01'

function summary(extra: Partial<ComposeInput> = {}) {
  return composeSlideOnPage(
    {
      pageObjectId: PAGE,
      archetype: 'EXECUTIVE_SUMMARY',
      title: 'Executive Summary',
      bullets: [
        'Rp 4.8B budget transformed digital marketing in 2026',
        '+212 percent ROI delivered',
        '1.4M total reach across all channels',
      ],
      ...extra,
    },
    { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
  )
}

function tagFree(requests: Array<Record<string, unknown>>): Array<{ kind: string; body: string }> {
  return requests.map((r) => {
    const kind = Object.keys(r)[0]
    return { kind, body: JSON.stringify(r[kind]).replace(/AB_[A-Za-z0-9]+_/g, 'AB_T_') }
  })
}

describe('A. KPI extraction preserves numeric values and units verbatim', () => {
  it.each([
    ['Rp 4.8B budget transformed digital marketing in 2026', 'Rp 4.8B', 'budget transformed digital marketing in 2026'],
    ['+212 percent ROI delivered in 2026', '+212 percent', 'ROI delivered in 2026'],
    ['1.4M total reach across all channels', '1.4M', 'total reach across all channels'],
    ['$12.5M ARR grew 3x YoY', '$12.5M', 'ARR grew 3x YoY'],
  ])('%s → value=%s', (bullet, value, label) => {
    const got = extractMetricPhrase(bullet)
    expect(got).not.toBeNull()
    expect(got?.value).toBe(value)
    if (label !== null) expect(got?.label).toBe(label)
  })
  it('narrative lines without leading metrics return null', () => {
    expect(extractMetricPhrase('Transformed marketing across all channels')).toBeNull()
    expect(extractMetricPhrase('Delivering +212 percent ROI')).toBeNull()
    expect(extractMetricPhrase('In 2026 we grew')).toBeNull()
    expect(extractMetricPhrase('')).toBeNull()
  })
})

describe('B. metric-rich summary produces kpiValue hierarchy, not generic rows', () => {
  it('three-metric summary renders hero strip with kpiValue roles', () => {
    const composed = summary()
    const roles = composed.result.requests
      .map((r) => JSON.stringify(r))
      .join(' ')
    expect(roles).toContain('SMV')
    const kpi = composed.prewriteQa.find((f) => f.check === 'VISUAL_KPI_HIERARCHY')
    expect(kpi?.pass).toBe(true)
    expect(composed.result.requests.some((r) => Object.keys(r)[0] === 'deleteObject')).toBe(false)
  })
  it('prose-only summary keeps numbered rows (no metric strip)', () => {
    const composed = composeSlideOnPage(
      {
        pageObjectId: PAGE,
        archetype: 'EXECUTIVE_SUMMARY',
        title: 'Priorities',
        bullets: ['Grow organic reach steadily', 'Retain valued customers'],
      },
      { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
    )
    const bodies = JSON.stringify(composed.result.requests)
    expect(bodies).toContain('ITEM0')
    expect(bodies).not.toContain('SMV')
  })
})

describe('C. peer metrics receive consistent component treatment', () => {
  it('all SMV/SML cards share dimensions', () => {
    const composed = summary()
    const peer = composed.prewriteQa.find((f) => f.check === 'VISUAL_PEER_CONSISTENCY')
    expect(peer?.pass).toBe(true)
  })
})

describe('D/E. density adaptation and footprint', () => {
  it('2-metric and 5-metric summaries both fit bounds with sane footprint', () => {
    for (const bullets of [
      ['Rp 1B revenue', '$2M profit'],
      ['Rp 1B revenue', '$2M profit', '3x growth', '71 percent retention', 'Q4 launch'],
    ]) {
      const composed = composeSlideOnPage(
        { pageObjectId: PAGE, archetype: 'EXECUTIVE_SUMMARY', title: 'T', bullets },
        { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
      )
      expect(composed.finalStatus).not.toBe('GEOMETRY_FAILED')
      const fp = composed.prewriteQa.find((f) => f.check === 'VISUAL_FOOTPRINT')
      expect(fp?.pass).toBe(true)
    }
  })
  it('old thin-row failure mode warns on footprint (synthetic)', () => {
    const findings = qaVisualQuality({
      page: resolvePageGeometry(960, 540),
      elements: [{ id: 'x', kind: 'text', rect: { x: 48, y: 30, w: 200, h: 60 } }],
      hierarchy: [{ role: 'body', fontPt: 14, id: 'x' }],
      inputMetrics: [],
    })
    expect(findings.find((f) => f.check === 'VISUAL_FOOTPRINT')?.pass).toBe(false)
    expect(findings.find((f) => f.check === 'VISUAL_FOOTPRINT')?.severity).toBe('WARNING')
  })
})

describe('F/G. title and content edges', () => {
  it('long title does not fail closed on bounds', () => {
    const composed = composeSlideOnPage(
      {
        pageObjectId: PAGE,
        archetype: 'EXECUTIVE_SUMMARY',
        title: 'Executive Summary of the Full Year Digital Marketing Transformation Program 2026',
        bullets: ['Rp 1B revenue', '$2M profit'],
      },
      { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
    )
    expect(composed.finalStatus).not.toBe('GEOMETRY_FAILED')
  })
  it('single-metric summary falls back without corner clustering failure', () => {
    const composed = composeSlideOnPage(
      { pageObjectId: PAGE, archetype: 'EXECUTIVE_SUMMARY', title: 'T', bullets: ['Rp 1B revenue grew steadily'] },
      { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
    )
    expect(composed.finalStatus).not.toBe('GEOMETRY_FAILED')
  })
})

describe('H. repeated execution is deterministic modulo AB tag', () => {
  it('same input twice → identical request streams after tag normalization', () => {
    const a = tagFree(composeSlide({ pageObjectId: PAGE, archetype: 'EXECUTIVE_SUMMARY', title: 'T', bullets: ['Rp 1B revenue', '$2M profit'] }).requests as Array<Record<string, unknown>>)
    const b = tagFree(composeSlide({ pageObjectId: PAGE, archetype: 'EXECUTIVE_SUMMARY', title: 'T', bullets: ['Rp 1B revenue', '$2M profit'] }).requests as Array<Record<string, unknown>>)
    expect(a).toEqual(b)
  })
})

describe('I. palette discipline (no ad-hoc colors in new path)', () => {
  it('all rgb colors in metric-strip requests derive from PALETTE', () => {
    const allowed = new Set(Object.values(PALETTE).map((h) => h.toUpperCase()))
    const hexOf = (rgb: { red?: number; green?: number; blue?: number }): string => {
      const b = (v: number | undefined): string => Math.round((v ?? 0) * 255).toString(16).padStart(2, '0').toUpperCase()
      return `#${b(rgb.red)}${b(rgb.green)}${b(rgb.blue)}`
    }
    const composed = summary()
    const dump = JSON.stringify(composed.result.requests)
    const hits: string[] = []
    for (const m of dump.matchAll(/"rgbColor":\{"red":([0-9.]+),"green":([0-9.]+),"blue":([0-9.]+)\}/g)) {
      hits.push(hexOf({ red: Number(m[1]), green: Number(m[2]), blue: Number(m[3]) }))
    }
    expect(hits.length).toBeGreaterThan(0)
    for (const h of hits) expect(allowed.has(h)).toBe(true)
    expect(dump).toContain('SMV')
    expect(dump).toContain('SMBG')
  })
})

describe('O. factual traceability (no invented numerics)', () => {
  it('every inserted numeric token exists in the source bullets', () => {
    const input = {
      pageObjectId: PAGE,
      archetype: 'EXECUTIVE_SUMMARY' as const,
      title: 'Executive Summary',
      bullets: ['Rp 4.8B budget in 2026', 'Delivering +212 percent ROI'],
    }
    const composed = composeSlideOnPage(input, { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] })
    const inserted: string[] = []
    for (const r of composed.result.requests) {
      const body = (r[Object.keys(r)[0]] ?? {}) as Record<string, unknown>
      if (typeof body.text === 'string') inserted.push(body.text)
    }
    expect(findFabricatedNumbers(expectedTextsOf(input), inserted)).toEqual([])
    // numericTokens splits "4.8B" into value/unit tokens; every token must
    // trace to the source bullets (values verbatim, units shared vocabulary).
    for (const tok of numericTokens(inserted)) {
      expect(numericTokens(expectedTextsOf(input)).includes(tok) || /^[a-z%]+$/.test(tok)).toBe(true)
    }
    expect(numericTokens(inserted)).toEqual(expect.arrayContaining(['rp 4.8', '2026']))
    // "+212 percent" stays verbatim inside the value box (no "212"-only split).
    expect(inserted.some((s) => s.includes('+212 percent'))).toBe(true)
  })
})

describe('TASK-090: magnitude parsing (generalized, ID-locale aware)', () => {
  it.each([
    ['2.4M', 2400000],
    ['860K', 860000],
    ['48K', 48000],
    ['Rp 4.8B budget', 4800000000],
    ['Rp 38.500', 38500],
    ['55 percent', 55],
    ['3.9 percent', 3.9],
    ['6.4x', 6.4],
    ['+212 percent ROI', 212],
    ['2026', 2026],
    ['71 percent retention', 71],
  ])('%s → %s', (text, want) => {
    expect(parseMagnitude(text as string)).toBe(want as number)
  })
  it('returns null without numbers', () => {
    expect(parseMagnitude('Foundation')).toBeNull()
    expect(parseMagnitude('')).toBeNull()
  })
})

describe('TASK-090: proportional scaling contract', () => {
  it('largest maps to maxW, order preserved, floor documented', () => {
    const r = scaleProportional([2400000, 860000, 132000, 48000], 600, 210)
    expect(r.widths[0]).toBe(600)
    expect(r.widths[0]).toBeGreaterThan(r.widths[1])
    expect(r.widths[1]).toBeGreaterThan(r.widths[2])
    expect(r.widths[2]).toBeGreaterThan(r.widths[3])
    expect(Math.min(...r.widths)).toBeGreaterThanOrEqual(210)
    expect(r.floored).toBe(true)
  })
  it('empty input yields empty output', () => {
    expect(scaleProportional([], 600, 100)).toEqual({ widths: [], floored: false })
  })
  it('percent shares keep exact order', () => {
    const r = scaleProportional([55, 25, 12, 8], 500, 30)
    expect([...r.widths].sort((a, b) => b - a)).toEqual(r.widths)
  })
})

describe('TASK-090: funnel tapers with magnitude, falls back without', () => {
  function funnelWidths(stages: Array<{ label: string; description?: string }>): number[] {
    const composed = composeSlideOnPage(
      { pageObjectId: PAGE, archetype: 'PROCESS_FUNNEL', title: 'Growth Funnel', stages },
      { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
    )
    expect(composed.finalStatus).not.toBe('GEOMETRY_FAILED')
    const out: number[] = []
    for (const r of composed.result.requests) {
      const key = Object.keys(r)[0]
      if (key !== 'createShape') continue
      const body = r[key] as Record<string, unknown>
      const oid = body.objectId as string
      if (!/_STG\d/.test(oid)) continue
      const props = body.elementProperties as Record<string, Record<string, Record<string, number>>>
      out.push(props.size.width.magnitude)
    }
    return out
  }
  it('stage widths descend with 2.4M/860K/132K/48K magnitudes', () => {
    const widths = funnelWidths([
      { label: 'Awareness', description: '2.4M' },
      { label: 'Consideration', description: '860K' },
      { label: 'Conversion', description: '132K' },
      { label: 'Advocacy', description: '48K' },
    ])
    expect(widths.length).toBe(4)
    expect(widths[0]).toBeGreaterThan(widths[1])
    expect(widths[1]).toBeGreaterThan(widths[2])
    expect(widths[2]).toBeGreaterThan(widths[3])
  })
  it('stages without magnitudes keep equal boxes (no invented values)', () => {
    const widths = funnelWidths([{ label: 'Foundation' }, { label: 'Scale' }, { label: 'Optimize' }])
    expect(new Set(widths).size).toBe(1)
  })
})

describe('TASK-090: comparison delta storytelling without derived numbers', () => {
  function comparisonDump(columns: Array<{ name: string; items: string[] }>): string {
    const composed = composeSlideOnPage(
      { pageObjectId: PAGE, archetype: 'COMPARISON', title: '2025 vs 2026', columns },
      { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
    )
    expect(composed.finalStatus).not.toBe('GEOMETRY_FAILED')
    return JSON.stringify(composed.result.requests)
  }
  it('paired numerics render delta bars and no derived percentages', () => {
    const dump = comparisonDump([
      { name: '2025', items: ['Ad spend Rp 2.1B', 'ROI 98 percent', 'Reach 520K'] },
      { name: '2026', items: ['Ad spend Rp 4.8B', 'ROI 212 percent', 'Reach 1.4M'] },
    ])
    // TASK-096-R5-A: mixed units (Rp miliar, percent, plain) suppress delta bars
    // because proportional bars across incompatible units are misleading.
    expect(dump).not.toContain('DLT0_0')
    expect(dump).not.toContain('DLT1_2')
    expect(dump).not.toMatch(/\+129%|2\.16x/)
  })
  it('homogeneous units render delta bars', () => {
    const dump = comparisonDump([
      { name: '2025', items: ['Rp 2.1B', 'Rp 4.8B'] },
      { name: '2026', items: ['Rp 3.5B', 'Rp 6.2B'] },
    ])
    expect(dump).toContain('DLT0_0')
    expect(dump).toContain('DLT1_1')
  })
  it('unpaired content keeps classic columns with no delta bars', () => {
    const dump = comparisonDump([
      { name: 'Plan A', items: ['Fast rollout', 'Low cost'] },
      { name: 'Plan B', items: ['Careful rollout', 'Higher cost'] },
    ])
    expect(dump).not.toContain('DLT0_')
    expect(dump).toContain('COLBG0')
  })
})

describe('TASK-090: distribution encodings follow numeric ordering', () => {
  function comparisonWidths(items: string[]): number[] {
    const cols = items.map((text, i) => ({ name: `C${i}`, items: [text] }))
    const composed = composeSlideOnPage(
      { pageObjectId: PAGE, archetype: 'COMPARISON', title: 'Channels', columns: cols },
      { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
    )
    expect(composed.finalStatus).not.toBe('GEOMETRY_FAILED')
    const out: number[] = []
    for (const r of composed.result.requests) {
      const key = Object.keys(r)[0]
      if (key !== 'createShape') continue
      const body = r[key] as Record<string, unknown>
      if (!(body.objectId as string).includes('_DBB')) continue
      const props = body.elementProperties as Record<string, Record<string, Record<string, number>>>
      out.push(props.size.width.magnitude)
    }
    return out
  }
  it('41/27/19/13 channel shares render descending bar lengths', () => {
    const widths = comparisonWidths(['41 percent', '27 percent', '19 percent', '13 percent'])
    expect(widths.length).toBe(4)
    expect(widths[0]).toBeGreaterThan(widths[1])
    expect(widths[1]).toBeGreaterThan(widths[2])
    expect(widths[2]).toBeGreaterThan(widths[3])
  })
})

describe('TASK-090: budget distribution vs ranked fallback', () => {
  function pillarsDump(columns: Array<{ name: string; items: string[] }>): string {
    const composed = composeSlideOnPage(
      { pageObjectId: PAGE, archetype: 'PILLARS_STRATEGY', title: 'Budget', columns },
      { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
    )
    expect(composed.finalStatus).not.toBe('GEOMETRY_FAILED')
    return JSON.stringify(composed.result.requests)
  }
  it('shares summing to ~100 render a stacked whole', () => {
    const dump = pillarsDump([
      { name: 'Ads 55 percent', items: ['Rp 2.64B'] },
      { name: 'Content 25 percent', items: ['Rp 1.2B'] },
      { name: 'Tools 12 percent', items: ['Rp 576Jt'] },
      { name: 'Reserve 8 percent', items: ['Rp 384Jt'] },
    ])
    expect(dump).toContain('STKS0')
    expect(dump).toContain('STKL0')
  })
  it('shares not summing to 100 render ranked bars, never a false whole', () => {
    const dump = pillarsDump([
      { name: 'Ads 55 percent', items: ['Rp 2.64B'] },
      { name: 'Content 25 percent', items: ['Rp 1.2B'] },
      { name: 'Tools 12 percent', items: ['Rp 576Jt'] },
    ])
    expect(dump).not.toContain('STKS0')
    expect(dump).toContain('DBB0')
  })
})

describe('TASK-090: cover motif, layering, and theme behavior', () => {
  function coverDump(): string {
    const composed = composeSlideOnPage(
      { pageObjectId: PAGE, archetype: 'COVER', title: 'Nusantara Growth Labs', subtitle: 'Digital 2026', closing: 'Benchmark' },
      { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
    )
    expect(composed.finalStatus).not.toBe('GEOMETRY_FAILED')
    return JSON.stringify(composed.result.requests)
  }
  it('motif field is explicitly sent behind text via z-order', () => {
    const dump = coverDump()
    expect(dump).toContain('MOTIF')
    expect(dump).toContain('updatePageElementsZOrder')
    expect(dump).toContain('SEND_TO_BACK')
  })
  it('theme accents resolve with contrast-safe fallback', () => {
    expect(resolveThemeRole({ ACCENT1: '#B00020' }, 'ACCENT1', PALETTE.accent)).toBe('#B00020')
    expect(resolveThemeRole({ ACCENT1: '#F0F0F0' }, 'ACCENT1', PALETTE.accent)).toBe(PALETTE.accent)
    expect(resolveThemeRole(null, 'ACCENT1', PALETTE.accent)).toBe(PALETTE.accent)
    expect(resolveThemeRole({}, 'ACCENT1', PALETTE.accent)).toBe(PALETTE.accent)
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 0)
  })
  it('theme accent flows into accent roles when provided', () => {
    const composed = composeSlideOnPage(
      { pageObjectId: PAGE, archetype: 'COVER', title: 'T', subtitle: 'S', closing: 'C' },
      { pageWidthPt: 960, pageHeightPt: 540, placeholders: [], theme: { ACCENT1: '#B00020' } }
    )
    const dump = JSON.stringify(composed.result.requests)
    // #B00020 = rgb(176,0,32) → fractions 0.6902/0/0.1255
    expect(dump).toContain('"red":0.6902')
    expect(dump).toContain('ACCBAR')
  })
  it('native background: light tint emits op; white/dark/missing yield null', () => {
    expect(themeBackgroundRequest('SL1', { BACKGROUND1: '#F2F6FC' })).not.toBeNull()
    expect(themeBackgroundRequest('SL1', { BACKGROUND1: '#FFFFFF' })).toBeNull()
    expect(themeBackgroundRequest('SL1', { BACKGROUND1: '#111827' })).toBeNull()
    expect(themeBackgroundRequest('SL1', null)).toBeNull()
    expect(themeBackgroundRequest('SL1', {})).toBeNull()
  })
})

describe('TASK-090: visual QA expansion signals', () => {
  it('proportional inversion warns; mass imbalance warns; both WARNING-grade', () => {
    const findings = qaVisualQuality({
      page: resolvePageGeometry(960, 540),
      elements: [
        { id: 'b0', kind: 'shape', rect: { x: 48, y: 300, w: 400, h: 60 } },
        { id: 'b1', kind: 'shape', rect: { x: 48, y: 370, w: 100, h: 60 } },
      ],
      hierarchy: [
        { role: 'slideTitle', fontPt: 32, id: 't' },
        { role: 'body', fontPt: 14, id: 'b0' },
      ],
      inputMetrics: [],
      proportionSets: [{ ids: ['b0', 'b1'], values: [10, 90] }],
    })
    const prop = findings.find((f) => f.check === 'VISUAL_PROPORTIONAL_ORDER')
    expect(prop?.pass).toBe(false)
    expect(prop?.severity).toBe('WARNING')
    const mass = findings.find((f) => f.check === 'VISUAL_MASS_BALANCE')
    expect(mass?.severity).toBe('WARNING')
  })
  it('parsePercentShare only accepts explicit shares', () => {
    expect(parsePercentShare('41 percent')).toBe(41)
    expect(parsePercentShare('55%')).toBe(55)
    expect(parsePercentShare('Q1 Foundation')).toBeNull()
    expect(parsePercentShare('Reach 520K')).toBeNull()
  })
})
