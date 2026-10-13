/**
 * TASK-087B Phase 12/14: deterministic 10-slide corpus benchmark.
 * Every slide of the Digital Marketing Beautify corpus (fixture facts) is
 * planned → composed → structurally QA'd → visually QA'd in-process.
 * No Google traffic. Asserts SUPPORTED status for every intent: structural
 * QA BLOCKING-clean and no failPlan for the supply input shape.
 */
import { describe, expect, it } from 'vitest'
import {
  bulletsToColumns,
  bulletsToStages,
  composeSlideOnPage,
  PALETTE,
  type ComposeInput,
} from './beautify'

const PAGE = 'SLIDE_CORPUS_01'

interface CorpusSlide {
  slide: number
  intent: string
  input: Omit<ComposeInput, 'pageObjectId'>
}

export const CORPUS: CorpusSlide[] = [
  {
    slide: 1,
    intent: 'COVER',
    input: {
      archetype: 'COVER',
      title: 'Nusantara Growth Labs',
      subtitle: 'Digital Marketing Transformation 2026',
      closing: 'Beautify Benchmark · Sari Wulandari, CEO',
    },
  },
  {
    slide: 2,
    intent: 'EXECUTIVE_SUMMARY',
    input: {
      archetype: 'EXECUTIVE_SUMMARY',
      title: 'Executive Summary',
      bullets: [
        'Rp 4.8B budget transformed digital marketing in 2026',
        '+212 percent ROI delivered',
        '1.4M total reach across all channels',
      ],
    },
  },
  {
    slide: 3,
    intent: 'KPI_DASHBOARD',
    input: {
      archetype: 'KPI_DASHBOARD',
      title: 'KPI Dashboard',
      metrics: [
        { label: 'ROAS', value: '6.4x' },
        { label: 'CAC', value: 'Rp 38.500' },
        { label: 'CTR', value: '3.9 percent' },
        { label: 'Conversion rate', value: '5.2 percent' },
        { label: 'Retention', value: '71 percent' },
        { label: 'YoY growth', value: '+168 percent' },
      ],
    },
  },
  {
    slide: 4,
    intent: 'PROCESS_FUNNEL',
    input: {
      archetype: 'PROCESS_FUNNEL',
      title: 'Growth Funnel',
      stages: [
        { label: 'Awareness', description: '2.4M' },
        { label: 'Consideration', description: '860K' },
        { label: 'Conversion', description: '132K' },
        { label: 'Advocacy', description: '48K' },
      ],
    },
  },
  {
    slide: 5,
    intent: 'COMPARISON',
    input: {
      archetype: 'COMPARISON',
      title: '2025 vs 2026 Comparison',
      columns: [
        { name: '2025', items: ['Ad spend Rp 2.1B', 'ROI 98 percent', 'Reach 520K'] },
        { name: '2026', items: ['Ad spend Rp 4.8B', 'ROI 212 percent', 'Reach 1.4M'] },
      ],
    },
  },
  {
    slide: 6,
    intent: 'TIMELINE_ROADMAP',
    input: {
      archetype: 'TIMELINE_ROADMAP',
      title: '2026 Roadmap',
      stages: [
        { label: 'Q1', description: 'Foundation' },
        { label: 'Q2', description: 'Scale' },
        { label: 'Q3', description: 'Optimize' },
        { label: 'Q4', description: 'Dominate' },
      ],
    },
  },
  {
    slide: 7,
    intent: 'PILLARS_STRATEGY',
    input: {
      archetype: 'PILLARS_STRATEGY',
      title: 'Three Strategic Pillars',
      columns: [
        { name: 'Pillar 1 Content Engine', items: ['Editorial calendar'] },
        { name: 'Pillar 2 Performance Ads', items: ['Paid acquisition'] },
        { name: 'Pillar 3 Community Flywheel', items: ['Advocacy loops'] },
      ],
    },
  },
  {
    slide: 8,
    intent: 'COMPARISON/BREAKDOWN',
    input: {
      archetype: 'COMPARISON',
      title: 'Channel Performance',
      columns: [
        { name: 'TikTok', items: ['41 percent'] },
        { name: 'Instagram', items: ['27 percent'] },
        { name: 'YouTube', items: ['19 percent'] },
        { name: 'Google', items: ['13 percent'] },
      ],
    },
  },
  {
    slide: 9,
    intent: 'BREAKDOWN',
    input: {
      archetype: 'PILLARS_STRATEGY',
      title: 'Budget Allocation Rp 4.8B',
      columns: [
        { name: 'Ads 55 percent', items: ['Rp 2.64B'] },
        { name: 'Content 25 percent', items: ['Rp 1.2B'] },
        { name: 'Tools 12 percent', items: ['Rp 576Jt'] },
        { name: 'Reserve 8 percent', items: ['Rp 384Jt'] },
      ],
    },
  },
  {
    slide: 10,
    intent: 'CLOSING_INSIGHT',
    input: {
      archetype: 'CLOSING_INSIGHT',
      title: 'Grow Where Attention Lives',
      closing: 'Contact halo@nusa-growth.id · Jakarta 2026',
    },
  },
]

describe('adapters: deterministic structure recovery without invention', () => {
  it('bulletsToStages maps ordered bullets verbatim', () => {
    expect(bulletsToStages(['Q1 Foundation', 'Q2 Scale'])).toEqual([
      { label: 'Q1 Foundation' },
      { label: 'Q2 Scale' },
    ])
    expect(bulletsToStages([])).toBeUndefined()
    expect(bulletsToStages(undefined)).toBeUndefined()
  })
  it('bulletsToColumns parses explicit Name: items shape only', () => {
    expect(bulletsToColumns(['2025: spend Rp 2.1B, ROI 98 percent', '2026: spend Rp 4.8B, ROI 212 percent'])).toEqual([
      { name: '2025', items: ['spend Rp 2.1B', 'ROI 98 percent'] },
      { name: '2026', items: ['spend Rp 4.8B', 'ROI 212 percent'] },
    ])
    expect(bulletsToColumns(['plain bullet one', 'plain bullet two'])).toBeUndefined()
    expect(bulletsToColumns(undefined)).toBeUndefined()
  })
  it('PROCESS_FUNNEL accepts bullets input via adapter (no failPlan)', () => {
    const composed = composeSlideOnPage(
      { pageObjectId: PAGE, archetype: 'PROCESS_FUNNEL', title: 'Growth Funnel', bullets: ['Awareness 2.4M', 'Consideration 860K'] },
      { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
    )
    expect(composed.finalStatus).not.toBe('GEOMETRY_FAILED')
  })
  it('COMPARISON with unstructured bullets still fails closed (no silent degradation)', () => {
    expect(() =>
      composeSlideOnPage(
        { pageObjectId: PAGE, archetype: 'COMPARISON', title: 'X vs Y', bullets: ['plain one', 'plain two'] },
        { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
      )
    ).toThrow(/COMPARISON requires 2..4 columns/)
  })
})

describe('corpus benchmark: all 10 slides SUPPORTED (structural + visual QA)', () => {
  it.each(CORPUS.map((c) => [c.slide, c.intent] as [number, string]))(
    'slide %i (%s) composes with BLOCKING-clean structural QA',
    (slide, _intent) => {
      const entry = CORPUS.find((c) => c.slide === slide)
      const composed = composeSlideOnPage(
        { pageObjectId: `${PAGE}_${slide}`, ...entry!.input },
        { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
      )
      expect(composed.finalStatus).not.toBe('GEOMETRY_FAILED')
      const blocking = composed.prewriteQa.filter((f) => !f.pass && f.severity === 'BLOCKING')
      expect(blocking).toEqual([])
      // Visual QA present and never BLOCKING (WARNING-grade evidence only).
      const visualBlocking = (composed.prewriteQa as Array<{ check: string; severity: string }>).filter(
        (f) => f.check.startsWith('VISUAL_') && f.severity === 'BLOCKING'
      )
      expect(visualBlocking).toEqual([])
      // Every slide owns its title region (no title-less composition).
      expect(composed.result.expected.titles.length).toBeGreaterThanOrEqual(1)
      // No slide creation inside composition.
      expect(
        composed.result.requests.map((r) => Object.keys(r)[0]).includes('createSlide')
      ).toBe(false)
    }
  )
})

describe('deck-level coherence: shared visual language', () => {
  it('all corpus slides use palette-only fills and slideTitle typography', () => {
    const allowed = new Set(Object.values(PALETTE).map((h) => h.toUpperCase()))
    const hexOf = (rgb: { red?: number; green?: number; blue?: number }): string => {
      const b = (v: number | undefined): string => Math.round((v ?? 0) * 255).toString(16).padStart(2, '0').toUpperCase()
      return `#${b(rgb.red)}${b(rgb.green)}${b(rgb.blue)}`
    }
    for (const entry of CORPUS) {
      const composed = composeSlideOnPage(
        { pageObjectId: `${PAGE}_${entry.slide}`, ...entry.input },
        { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
      )
      const dump = JSON.stringify(composed.result.requests)
      for (const m of dump.matchAll(/"rgbColor":\{"red":([0-9.]+),"green":([0-9.]+),"blue":([0-9.]+)\}/g)) {
        expect(allowed.has(hexOf({ red: Number(m[1]), green: Number(m[2]), blue: Number(m[3]) }))).toBe(true)
      }
    }
  })
  it('representative intents route to distinct archetype renderers', () => {
    const seen = new Set(CORPUS.map((c) => c.input.archetype))
    expect(seen.size).toBeGreaterThanOrEqual(4)
    expect(seen.has('EXECUTIVE_SUMMARY')).toBe(true)
    expect(seen.has('COMPARISON')).toBe(true)
  })
})

describe.each([
  [4, 'PROCESS_FUNNEL'],
  [5, 'COMPARISON'],
  [8, 'COMPARISON'],
  [9, 'PILLARS_STRATEGY'],
  [1, 'COVER'],
])(
  'TASK-090 §46: slide %i (%s) uses its meaning-driven encoding',
  (slide, _archetype) => {
    it(`slide ${slide} structural + encoding proof`, () => {
      const entry = CORPUS.find((c) => c.slide === slide)
      if (!entry) throw new Error(`corpus slide ${slide} missing`)
      const composed = composeSlideOnPage(
        { pageObjectId: `${PAGE}_${slide}`, ...entry.input },
        { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] }
      )
      expect(composed.finalStatus).not.toBe(`GEOMETRY_FAILED`)
      const dump = JSON.stringify(composed.result.requests)
      if (slide === 4) {
        // Funnel: tapered magnitude bars, one per stage, descending.
        const widths: number[] = []
        for (const r of composed.result.requests) {
          const key = Object.keys(r)[0]
          if (key !== `createShape`) continue
          const body = r[key] as Record<string, unknown>
          if (!/_STG\d/.test(body.objectId as string)) continue
          const props = body.elementProperties as Record<string, Record<string, Record<string, number>>>
          widths.push(props.size.width.magnitude)
        }
        expect(widths.length).toBe(4)
        expect(widths[0]).toBeGreaterThan(widths[1])
        expect(widths[1]).toBeGreaterThan(widths[2])
        expect(widths[2]).toBeGreaterThan(widths[3])
      }
      if (slide === 5) {
        // TASK-096-R5-A: mixed units (Rp miliar, percent, plain) suppress delta bars
        expect(dump).not.toContain(`DLT0_0`)
        expect(dump).not.toContain(`DLT1_2`)
      }
      if (slide === 8) {
        // Channels: ranked bars in source order with descending lengths.
        expect(dump).toContain(`DBB0`)
        expect(dump).not.toContain(`COLBG0`)
      }
      if (slide === 9) {
        // Budget: stacked whole (shares sum to 100), never equal cards.
        expect(dump).toContain(`STKS0`)
        expect(dump).not.toContain(`PILBG0`)
      }
      if (slide === 1) {
        // Cover: motif + explicit behind-text layering.
        expect(dump).toContain(`MOTIF`)
        expect(dump).toContain(`SEND_TO_BACK`)
      }
    })
  }
)
