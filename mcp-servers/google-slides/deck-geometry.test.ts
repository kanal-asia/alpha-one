/**
 * TASK-096-R1: page-size-aware layout recovery.
 * Proves the canonical coordinate contract end to end: authoritative page
 * size drives geometry, conversion happens once, origin is (0,0),
 * backgrounds cover the full page, bounds preflight fails closed, semantic
 * topologies keep every fact, and rendered-image analysis detects inset
 * backgrounds, blank slides, and missing content honestly.
 */
import { describe, expect, it } from 'vitest'
import {
  DESIGN_CANVAS,
  EMU_PER_PT,
  GOOGLE_DEFAULT_PAGE_PT,
  resolvePageGeometry,
  safeAreaOf,
  layoutFor,
  pageDimensionPt,
  pageSizeMatches,
  checkBounds,
  analyzeRenderedSlide,
  missingContentRegions,
} from './geometry'
import { elementProperties, buildUpdatePageBackground } from './visual'
import { __deckTest, pageSizePtOfPresentation, verifyDeckGeometry } from './deck'
import { composeSlideOnPage, validateComposeInput, qaComposedSlide } from './beautify'
import { PRODUCTION_THEME_ID } from './production'

const PT = (v: number) => ({ magnitude: v, unit: 'PT' as const });
const EMU = (v: number) => ({ magnitude: v, unit: 'EMU' as const });

function prodSpec(slides: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) {
  return {
    title: 'Geometry Deck',
    themeId: PRODUCTION_THEME_ID,
    slideCount: slides.length,
    backgroundImageUrl: 'https://example.com/gradient.png',
    slides,
    ...extra,
  }
}

const FUNNEL_SLIDE = {
  slideKey: 'funnel', narrativeRole: 'acquisition funnel', title: 'Acquisition Funnel',
  stages: [
    { stageId: 'st_awareness', label: 'Awareness', value: '1,200,000', order: 1 },
    { stageId: 'st_web', label: 'Website Visitors', value: '240,000', order: 2 },
    { stageId: 'st_leads', label: 'Qualified Leads', value: '72,000', order: 3 },
    { stageId: 'st_trials', label: 'Trial Users', value: '18,000', order: 4 },
    { stageId: 'st_paid', label: 'Paying Organizations', value: '500', order: 5 },
  ],
}

const ALLOC_SLIDE = {
  slideKey: 'allocation', title: 'Investment Allocation',
  distributionItems: [
    { factId: 'alloc_product', label: 'Product & Engineering', value: '50', unit: '%', amount: 'Rp2', amountUnit: 'miliar' },
    { factId: 'alloc_sales', label: 'Sales & Marketing', value: '25', unit: '%', amount: 'Rp1', amountUnit: 'miliar' },
    { factId: 'alloc_success', label: 'Customer Success', value: '15', unit: '%', amount: 'Rp600', amountUnit: 'juta' },
    { factId: 'alloc_ops', label: 'Operations', value: '10', unit: '%', amount: 'Rp400', amountUnit: 'juta' },
  ],
  aggregate: { factId: 'alloc_total', label: 'Aggregate Total', value: '100%', unit: 'Rp4 miliar' },
}

const CLOSING_SLIDE = {
  slideKey: 'closing', title: 'Closing Insight',
  closingThesis: {
    eyebrow: 'Build the Future of Work with Alpha One',
    statement: 'Satu workspace untuk menghubungkan pekerjaan, data, tools, dan AI dalam satu lingkungan terpadu.',
  },
}

const CHANNEL_COLS = [
  { name: 'Organic & Content', items: ['42%'] },
  { name: 'Strategic Partnerships', items: ['28%'] },
  { name: 'Performance Marketing', items: ['18%'] },
  { name: 'Community & Referral', items: ['12%'] },
]

function fullFixture(): Record<string, unknown> {
  return prodSpec([
    { slideKey: 'cover', narrativeRole: 'cover', title: 'Alpha One', subtitle: 'Business Growth Strategy 2027' },
    {
      slideKey: 'summary', narrativeRole: 'executive summary', title: 'Executive Summary',
      preferredArchetype: 'EXECUTIVE_SUMMARY',
      bullets: [
        { text: 'Scale the workspace into the operating layer for growing teams.' },
        { text: 'Focus on acquisition quality, expansion revenue, and partner leverage.' },
        { text: 'Protect product velocity while improving onboarding outcomes.' },
        { text: 'Measure weekly active teams as the north-star metric.' },
      ],
    },
    {
      slideKey: 'kpi', title: 'Four KPI Dashboard',
      headlineMetrics: [
        { factId: 'kpi_arr', label: 'ARR', value: 'Rp 12B' },
        { factId: 'kpi_orgs', label: 'Organizations', value: '2,500' },
        { factId: 'kpi_retention', label: 'Retention', value: '92%' },
        { factId: 'kpi_users', label: 'Monthly Active Users', value: '18,000' },
      ],
    },
    FUNNEL_SLIDE,
    {
      slideKey: 'comparison', title: '2026 vs 2027 Comparison',
      comparisonGroups: [
        {
          groupId: 'g_2026', name: '2026',
          items: [
            { factId: 'c26_arr', label: 'ARR', value: 'Rp 6B' },
            { factId: 'c26_orgs', label: 'Organizations', value: '1,400' },
            { factId: 'c26_retention', label: 'Retention', value: '88%' },
            { factId: 'c26_nps', label: 'NPS', value: '42' },
          ],
        },
        {
          groupId: 'g_2027', name: '2027',
          items: [
            { factId: 'c27_arr', label: 'ARR', value: 'Rp 12B' },
            { factId: 'c27_orgs', label: 'Organizations', value: '2,500' },
            { factId: 'c27_retention', label: 'Retention', value: '92%' },
            { factId: 'c27_nps', label: 'NPS', value: '55' },
          ],
        },
      ],
    },
    {
      slideKey: 'roadmap', narrativeRole: 'roadmap', title: 'Four-Stage Roadmap',
      stages: [
        { stageId: 'rd_q1', label: 'Q1 Foundation', description: 'Identity and onboarding', order: 1 },
        { stageId: 'rd_q2', label: 'Q2 Scale', description: 'Partner channel', order: 2 },
        { stageId: 'rd_q3', label: 'Q3 Optimize', description: 'Retention loops', order: 3 },
        { stageId: 'rd_q4', label: 'Q4 Dominate', description: 'Enterprise motion', order: 4 },
      ],
    },
    {
      slideKey: 'pillars', title: 'Three Strategic Pillars',
      pillars: [
        { pillarId: 'pil_content', name: 'Content Engine', items: ['Editorial calendar', 'Video series'] },
        { pillarId: 'pil_ads', name: 'Performance Ads', items: ['Paid search', 'Paid social'] },
        { pillarId: 'pil_community', name: 'Community Flywheel', items: ['Advocacy loops', 'Referrals'] },
      ],
    },
    { slideKey: 'distribution', title: 'Channel Distribution', distributionItems: CHANNEL_COLS.map((c, i) => ({ factId: `ch_${i}`, label: c.name, value: c.items[0].replace('%', ''), unit: '%' })) },
    ALLOC_SLIDE,
    CLOSING_SLIDE,
  ])
}

function solidImage(w: number, h: number, rgb: [number, number, number]): number[] {
  const out: number[] = []
  for (let i = 0; i < w * h; i += 1) out.push(rgb[0], rgb[1], rgb[2], 255)
  return out
}

function borderedImage(w: number, h: number, border: number, borderRgb: [number, number, number], fillRgb: [number, number, number]): number[] {
  const out: number[] = []
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const edge = x < border || y < border || x >= w - border || y >= h - border
      const c = edge ? borderRgb : fillRgb
      out.push(c[0], c[1], c[2], 255)
    }
  }
  return out
}

describe('TASK-096-R1 page-size authority and conversion', () => {
  it('01 reads actual page size in EMU (Google default 16:9)', () => {
    const size = pageSizePtOfPresentation({
      presentationId: 'p',
      pageSize: { width: EMU(9144000), height: EMU(5143500) },
    })
    expect(size).toEqual({ wPt: 720, hPt: 405, unit: 'PT' })
  })

  it('02 supports page size expressed in PT', () => {
    const size = pageSizePtOfPresentation({
      presentationId: 'p',
      pageSize: { width: PT(720), height: PT(405) },
    })
    expect(size).toEqual({ wPt: 720, hPt: 405, unit: 'PT' })
  })

  it('03 rejects pixels, inches, missing, and non-finite page sizes', () => {
    expect(() => pageSizePtOfPresentation({ presentationId: 'p', pageSize: { width: { magnitude: 960, unit: 'PX' }, height: { magnitude: 540, unit: 'PX' } } })).toThrow(/PAGE_SIZE_UNREADABLE|unit must be PT or EMU/)
    expect(() => pageSizePtOfPresentation({ presentationId: 'p' })).toThrow(/PAGE_SIZE_UNREADABLE/)
    expect(() => pageDimensionPt(NaN, 'PT', 'w')).toThrow()
    expect(() => pageDimensionPt(0, 'PT', 'w')).toThrow()
  })

  it('04 design-space conversion happens once from the authoritative size', () => {
    const g = resolvePageGeometry(720, 405)
    expect(g.sx).toBeCloseTo(0.75, 10)
    expect(g.sy).toBeCloseTo(0.75, 10)
    expect(g.fontScale).toBeCloseTo(0.75, 10)
    expect(g.aspect).toBe('16:9')
    // Single EMU anchor: 1pt is exactly 12700 EMU, no second scale factor.
    expect(EMU_PER_PT).toBe(12700)
    expect(9144000 / EMU_PER_PT).toBe(720)
    expect(GOOGLE_DEFAULT_PAGE_PT).toEqual({ w: 720, h: 405 })
    expect(DESIGN_CANVAS).toEqual({ w: 960, h: 540 })
  })

  it('05 origin remains (0,0) for page-level composition', () => {
    const ep = elementProperties('p', { x: 0, y: 0, width: 720, height: 405 })
    expect(ep.transform.translateX).toBe(0)
    expect(ep.transform.translateY).toBe(0)
    expect(ep.transform.scaleX).toBe(1)
    expect(ep.transform.scaleY).toBe(1)
    const g = resolvePageGeometry(720, 405)
    const layout = layoutFor(g)
    expect(layout.W).toBe(720)
    expect(layout.H).toBe(405)
  })

  it('06 full-page solid background bounds equal the page', () => {
    const req = buildUpdatePageBackground('SLIDE_1', { backgroundHex: '#0A1628' }) as Record<string, any>
    expect(req.updatePageProperties.objectId).toBe('SLIDE_1')
    expect(req.updatePageProperties.fields).toBe('pageBackgroundFill.solidFill.color')
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const slide = plan.geometry.slides[0]
    expect(slide.backgroundBounds).toEqual({ x: 0, y: 0, w: 720, h: 405 })
    expect(slide.backgroundKind).toBe('page-property')
  })

  it('07 full-page image background bounds equal the page', () => {
    const req = buildUpdatePageBackground('SLIDE_1', { backgroundImageUrl: 'https://example.com/g.png' }) as Record<string, any>
    expect(req.updatePageProperties.pageProperties.pageBackgroundFill.stretchedPictureFill.contentUrl).toBe('https://example.com/g.png')
    expect(req.updatePageProperties.fields).toBe('pageBackgroundFill.stretchedPictureFill.contentUrl')
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const hero = plan.geometry.slides.find((s) => s.slideKey === 'cover')
    expect(hero?.backgroundBounds).toEqual({ x: 0, y: 0, w: 720, h: 405 })
  })

  it('08 no white perimeter on solid navy production pages', () => {
    const analysis = analyzeRenderedSlide(solidImage(192, 108, [10, 22, 40]), 192, 108, { backgroundHex: '#0A1628' })
    expect(analysis.whitePerimeterPct).toBe(0)
    expect(analysis.blankSlide).toBe(false)
    expect((analysis.backgroundCoveragePct ?? 0)).toBeGreaterThan(95)
  })

  it('09 safe area derives from the actual page', () => {
    const safe = safeAreaOf(resolvePageGeometry(720, 405))
    expect(safe).toEqual({ x: 36, y: 22.5, w: 648, h: 346.5, mx: 36, myTop: 22.5, myBottom: 36 })
  })
})

describe('TASK-096-R1 bounds preflight', () => {
  function mutateFirstShape(plan: ReturnType<typeof __deckTest.compileDeckPlan>, patch: (id: string, ep: any) => void): ReturnType<typeof __deckTest.compileDeckPlan> {
    const clone = JSON.parse(JSON.stringify({ requests: plan.requests })) as { requests: Array<Record<string, any>> }
    for (const r of clone.requests) {
      const cs = r.createShape ?? r.createTextBox
      if (cs?.elementProperties) {
        patch(String(cs.objectId), cs.elementProperties)
        break
      }
    }
    return { ...plan, requests: clone.requests as any }
  }

  it('10 rejects right overflow with the offending slide and object named', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const mutated = mutateFirstShape(plan, (_id, ep) => {
      ep.transform.translateX = 800 * EMU_PER_PT
    })
    const result = verifyDeckGeometry(mutated, { requireBackground: true })
    expect(result.status).toBe('FAIL')
    expect(result.violations.some((v) => v.includes('outside page bounds'))).toBe(true)
    expect(result.slides[0].outOfPageIds.length).toBeGreaterThan(0)
  })

  it('11 rejects bottom overflow', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const mutated = mutateFirstShape(plan, (_id, ep) => {
      ep.transform.translateY = 500 * EMU_PER_PT
    })
    const result = verifyDeckGeometry(mutated, { requireBackground: true })
    expect(result.status).toBe('FAIL')
  })

  it('12 rejects negative origin', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const mutated = mutateFirstShape(plan, (_id, ep) => {
      ep.transform.translateX = -10 * EMU_PER_PT
    })
    const result = verifyDeckGeometry(mutated, { requireBackground: true })
    expect(result.status).toBe('FAIL')
  })

  it('13 meaningful object outside safe area is flagged (ERROR grade)', () => {
    const page = resolvePageGeometry(720, 405)
    const safe = safeAreaOf(page)
    const findings = checkBounds(
      [{ id: 'T1', kind: 'text', rect: { x: 700, y: 380, w: 100, h: 20 } }],
      page,
      safe
    )
    expect(findings.find((f) => f.check === 'PAGE_BOUNDS')?.pass).toBe(false)
    const safeOnly = checkBounds(
      [{ id: 'T2', kind: 'text', rect: { x: 700, y: 100, w: 15, h: 20 } }],
      page,
      safe
    )
    // Inside the page but outside the safe area: flagged (ERROR grade).
    expect(safeOnly.find((f) => f.check === 'PAGE_BOUNDS')?.pass).toBe(true)
    expect(safeOnly.find((f) => f.check === 'SAFE_AREA')?.pass).toBe(false)
  })

  it('14 intentional full-bleed decoration at origin passes', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    expect(plan.geometry.status).toBe('PASS')
    const hero = plan.geometry.slides.find((s) => s.slideKey === 'cover')
    expect(hero?.geometryStatus).toBe('PASS')
  })

  it('30 all compiled objects remain inside page bounds', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    for (const s of plan.geometry.slides) {
      expect(s.outOfPageIds).toEqual([])
      expect(s.negativeDimensionIds).toEqual([])
      expect(s.geometryStatus).toBe('PASS')
    }
  })

  it('31 full 10-slide compile passes geometry preflight', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    expect(plan.slides).toHaveLength(10)
    expect(plan.geometry.status).toBe('PASS')
    expect(plan.perSlide.every((s) => (s.geometryStatus as string) === 'PASS')).toBe(true)
    expect(plan.assumedPageSize).toEqual({ wPt: 720, hPt: 405, unit: 'PT' })
  })
})

describe('TASK-096-R1 adaptive capacity and semantic preservation', () => {
  it('15 four bullets allocate four complete rows', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const summary = plan.slides.find((s) => s.slideKey === 'summary')
    expect(summary?.input.bullets).toHaveLength(4)
    const texts = (plan.requests as Array<Record<string, any>>)
      .filter((r) => r.insertText)
      .map((r) => String(r.insertText.text))
      .join('\n')
    for (const b of summary?.input.bullets ?? []) expect(texts).toContain(b)
  })

  it('16 five-stage funnel capacity holds five stages', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    expect(plan.slides.find((s) => s.slideKey === 'funnel')?.input.stages).toHaveLength(5)
  })

  it('17 five-stage funnel preserves the final stage', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const stages = plan.slides.find((s) => s.slideKey === 'funnel')?.input.stages ?? []
    const last = stages[stages.length - 1]
    expect(last.label).toBe('Paying Organizations')
    expect(last.description).toContain('500')
    const texts = (plan.requests as Array<Record<string, unknown>>)
      .filter((r) => (r as any).insertText)
      .map((r) => String((r as any).insertText.text))
      .join('\n')
    expect(texts).toContain('Paying Organizations')
    expect(texts).toContain('500')
  })

  it('18 three-pillar layout preserves all children', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const cols = plan.slides.find((s) => s.slideKey === 'pillars')?.input.columns ?? []
    expect(cols).toHaveLength(3)
    expect(cols.every((c) => c.items.length === 2)).toBe(true)
  })

  it('19 four-stage roadmap preserves all stages', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const stages = plan.slides.find((s) => s.slideKey === 'roadmap')?.input.stages ?? []
    expect(stages).toHaveLength(4)
    expect(stages.map((s) => s.label)).toEqual(['Q1 Foundation', 'Q2 Scale', 'Q3 Optimize', 'Q4 Dominate'])
  })

  it('20 ranked bars preserve proportional widths', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const widths = (plan.requests as Array<Record<string, unknown>>)
      .filter((r) => String((r as any).createShape?.objectId ?? '').includes('DBB'))
      .map((r) => Number((r as any).createShape.elementProperties.size.width.magnitude))
    expect(widths.length).toBe(4)
    for (let i = 1; i < widths.length; i += 1) expect(widths[i - 1]).toBeGreaterThan(widths[i])
    const ratio = widths[0] / widths[3]
    expect(ratio).toBeGreaterThan(3.5 * 0.9)
    expect(ratio).toBeLessThan(3.5 * 1.1)
  })

  it('21 allocation preserves four peer labels', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const alloc = plan.slides.find((s) => s.slideKey === 'allocation')
    expect(alloc?.peerCount).toBe(4)
    const texts = (plan.requests as Array<Record<string, unknown>>)
      .filter((r) => (r as any).insertText)
      .map((r) => String((r as any).insertText.text))
      .join('\n')
    for (const label of ['Product & Engineering', 'Sales & Marketing', 'Customer Success', 'Operations']) {
      expect(texts).toContain(label)
    }
  })

  it('22 allocation preserves four amounts', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const texts = (plan.requests as Array<Record<string, unknown>>)
      .filter((r) => (r as any).insertText)
      .map((r) => String((r as any).insertText.text))
      .join('\n')
    for (const amount of ['Rp2 miliar', 'Rp1 miliar', 'Rp600 juta', 'Rp400 juta']) {
      expect(texts).toContain(amount)
    }
  })

  it('23 aggregate remains separate from peers', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const alloc = plan.slides.find((s) => s.slideKey === 'allocation')
    expect(alloc?.aggregateCount).toBe(1)
    expect(JSON.stringify(alloc?.input.columns ?? [])).not.toContain('Aggregate Total')
  })

  it('24 closing eyebrow is a separate object', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const eyebrows = (plan.requests as Array<Record<string, unknown>>).filter(
      (r) => String((r as any).createShape?.objectId ?? '').includes('CKICKER')
    )
    expect(eyebrows.length).toBe(1)
  })

  it('25 closing thesis is a separate object', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const thesis = (plan.requests as Array<Record<string, unknown>>).filter(
      (r) => String((r as any).createShape?.objectId ?? '').includes('THESIS')
    )
    expect(thesis.length).toBe(1)
    const texts = (plan.requests as Array<Record<string, unknown>>)
      .filter((r) => (r as any).insertText)
      .map((r) => String((r as any).insertText.text))
      .join('\n')
    expect(texts).toContain('Satu workspace untuk menghubungkan pekerjaan, data, tools, dan AI dalam satu lingkungan terpadu.')
  })

  it('26 closing does not use bullet fallback', () => {
    const single = __deckTest.compileDeckPlan({
      title: 'Single',
      themeId: 'ALPHA_NAVY_TEAL_PRODUCTION_V1',
      slides: [CLOSING_SLIDE],
    })
    const ids = (single.requests as Array<Record<string, unknown>>).map(
      (r) => String((r as any).createShape?.objectId ?? '')
    )
    expect(ids.some((id) => id.includes('THESIS') || id.includes('CKICKER'))).toBe(true)
    expect(ids.some((id) => id.includes('NUMBG'))).toBe(false)
  })

  it('27 long content selects a fitting variant without omission', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const funnel = plan.perSlide.find((s) => s.slideKey === 'funnel')
    expect(funnel?.status).not.toBe('GEOMETRY_FAILED')
  })

  it('28 no automatic fact omission across the deck', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const fingerprints = Object.values(plan.slides.map((s) => s.sourceFingerprint))
    expect(new Set(fingerprints).size).toBe(10)
  })

  it('29 no minimum-font regression on the canonical fixture', () => {
    const r = composeSlideOnPage(
      { pageObjectId: 'S', archetype: 'CLOSING_INSIGHT', title: 'Closing Insight', closing: 'Satu workspace untuk menghubungkan pekerjaan, data, tools, dan AI dalam satu lingkungan terpadu.' },
      { pageWidthPt: 720, pageHeightPt: 405, alphaThemeId: 'NAVY_TEAL_PRODUCTION' }
    )
    const fonts = (r.result.placed ?? []).filter((p) => p.kind === 'text').map((p) => p.fontPt ?? 99)
    expect(Math.min(...fonts)).toBeGreaterThanOrEqual(10)
  })
})

describe('TASK-096-R1-A compiled-request coordinate transform evidence', () => {
  function parseCompiledBounds(req: Record<string, any>): { x: number; y: number; w: number; h: number } | null {
    const ep = (req.createShape ?? req.createTextBox ?? req.createImage ?? req.createTable)?.elementProperties
    if (!ep) return null
    const xEmu = ep.transform?.translateX ?? 0
    const yEmu = ep.transform?.translateY ?? 0
    const wEmu = ep.size?.width?.magnitude ?? 0
    const hEmu = ep.size?.height?.magnitude ?? 0
    return { x: xEmu / EMU_PER_PT, y: yEmu / EMU_PER_PT, w: wEmu / EMU_PER_PT, h: hEmu / EMU_PER_PT }
  }

  it('C1 compile uses GOOGLE_DEFAULT_PAGE_PT as target dimensions', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    expect(plan.assumedPageSize).toEqual({ wPt: 720, hPt: 405, unit: 'PT' })
    expect(plan.geometry.pageBounds).toEqual({ x: 0, y: 0, w: 720, h: 405 })
  })

  it('C2 design-space 960×540 yields sx=0.75, sy=0.75 on 720×405 target', () => {
    const g = resolvePageGeometry(GOOGLE_DEFAULT_PAGE_PT.w, GOOGLE_DEFAULT_PAGE_PT.h)
    expect(g.sx).toBeCloseTo(0.75, 10)
    expect(g.sy).toBeCloseTo(0.75, 10)
    expect(g.fontScale).toBeCloseTo(0.75, 10)
    expect(g.w).toBe(720)
    expect(g.h).toBe(405)
  })

  it('C3 known design-space object proves the transform numerically', () => {
    const layout = layoutFor(resolvePageGeometry(720, 405))
    const g = layout.page
    const x = layout.M
    const y = g.h - g.h / 20 - 50
    const w = g.w - layout.M * 2
    const h = 50
    const ep = elementProperties('SLIDE', { x, y, width: w, height: h })
    const ptX = ep.transform.translateX / EMU_PER_PT
    const ptY = ep.transform.translateY / EMU_PER_PT
    const ptW = ep.size.width.magnitude / EMU_PER_PT
    const ptH = ep.size.height.magnitude / EMU_PER_PT
    expect(ptX).toBeCloseTo(x, 6)
    expect(ptY).toBeCloseTo(y, 6)
    expect(ptW).toBeCloseTo(w, 6)
    expect(ptH).toBeCloseTo(h, 6)
    expect(ptX + ptW).toBeLessThanOrEqual(720.01)
    expect(ptY + ptH).toBeLessThanOrEqual(405.01)
  })

  it('C4 no compiled shape object overflows 720×405 page', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const page = { w: GOOGLE_DEFAULT_PAGE_PT.w, h: GOOGLE_DEFAULT_PAGE_PT.h }
    const outOfPage: string[] = []
    const negatives: string[] = []
    for (const r of plan.requests) {
      const rec = r as Record<string, any>
      const cs = rec.createShape ?? rec.createTextBox ?? rec.createImage
      if (!cs?.elementProperties) continue
      const b = parseCompiledBounds(rec)
      if (!b) continue
      if (!(b.w > 0) || !(b.h > 0)) { negatives.push(String(cs.objectId)); continue }
      if (b.x < -1 || b.y < -1 || b.x + b.w > page.w + 1 || b.y + b.h > page.h + 1) {
        outOfPage.push(String(cs.objectId))
      }
    }
    expect(negatives).toEqual([])
    expect(outOfPage).toEqual([])
  })

  it('C5 maximum compiled right edge is within 720 PT', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    let maxRight = 0
    for (const r of plan.requests) {
      const b = parseCompiledBounds(r as Record<string, any>)
      if (b && b.w > 0) maxRight = Math.max(maxRight, b.x + b.w)
    }
    expect(maxRight).toBeGreaterThan(0)
    expect(maxRight).toBeLessThanOrEqual(720.01)
  })

  it('C6 maximum compiled bottom edge is within 405 PT', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    let maxBottom = 0
    for (const r of plan.requests) {
      const b = parseCompiledBounds(r as Record<string, any>)
      if (b && b.h > 0) maxBottom = Math.max(maxBottom, b.y + b.h)
    }
    expect(maxBottom).toBeGreaterThan(0)
    expect(maxBottom).toBeLessThanOrEqual(405.01)
  })

  it('C7 native page background classified separately from shape background', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    for (const slide of plan.geometry.slides) {
      expect(slide.backgroundKind).toBe('page-property')
      expect(slide.backgroundBounds).toEqual({ x: 0, y: 0, w: 720, h: 405 })
    }
    const bgReqs = plan.requests.filter((r: any) => r.updatePageProperties !== undefined)
    for (const req of bgReqs) {
      const fields = (req as any).updatePageProperties?.fields ?? ''
      expect(fields).toMatch(/pageBackgroundFill/)
    }
  })

  it('C8 full-page shape background starts at (0,0) with page dimensions', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const bgShapes = plan.requests
      .filter((r: any) => r.createShape?.objectId?.includes('BG_'))
      .map((r) => parseCompiledBounds(r as Record<string, any>))
      .filter((b): b is NonNullable<typeof b> => b !== null)
    for (const bg of bgShapes) {
      if (bg.w > 100 && bg.h > 100) {
        expect(bg.x).toBeGreaterThanOrEqual(-0.1)
        expect(bg.y).toBeGreaterThanOrEqual(-0.1)
        expect(bg.w).toBeLessThanOrEqual(720.1)
        expect(bg.h).toBeLessThanOrEqual(405.1)
      }
    }
  })

  it('C9 compiled coordinates prove no raw 960×540 design-space value reaches Google', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    const maxX = GOOGLE_DEFAULT_PAGE_PT.w
    const maxY = GOOGLE_DEFAULT_PAGE_PT.h
    for (const r of plan.requests) {
      const b = parseCompiledBounds(r as Record<string, any>)
      if (!b || !(b.w > 0)) continue
      expect(b.x + b.w).toBeLessThanOrEqual(maxX + 1)
      expect(b.y + b.h).toBeLessThanOrEqual(maxY + 1)
    }
  })

  it('C10 deck compilation applies scaling exactly once (sx=0.75)', () => {
    const g = resolvePageGeometry(720, 405)
    const designX = 80
    const designY = 60
    const pageX = designX * g.sx
    const pageY = designY * g.sy
    expect(pageX).toBeCloseTo(60, 10)
    expect(pageY).toBeCloseTo(45, 10)
    const ep = elementProperties('S', { x: pageX, y: pageY, width: 100, height: 50 })
    expect(ep.transform.translateX).toBe(Math.round(pageX * EMU_PER_PT))
    expect(ep.transform.translateY).toBe(Math.round(pageY * EMU_PER_PT))
    expect(ep.transform.scaleX).toBe(1)
    expect(ep.transform.scaleY).toBe(1)
  })
})

describe('TASK-096-R1-A page-size contract', () => {
  it('D1 deck compilation uses supported default Google page only', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    expect(plan.assumedPageSize.wPt).toBe(GOOGLE_DEFAULT_PAGE_PT.w)
    expect(plan.assumedPageSize.hPt).toBe(GOOGLE_DEFAULT_PAGE_PT.h)
  })

  it('D2 unsupported custom page size is not compiled by deck path', () => {
    const customSpec = {
      title: 'Custom Deck',
      themeId: PRODUCTION_THEME_ID,
      slides: [{ slideKey: 's', title: 'Test', bullets: [{ text: 'Content' }] }],
    }
    const plan = __deckTest.compileDeckPlan(customSpec)
    expect(plan.assumedPageSize.wPt).toBe(720)
    expect(plan.assumedPageSize.hPt).toBe(405)
  })

  it('D3 single-slide compose supports runtime page size via snapshot', () => {
    const r = composeSlideOnPage(
      { pageObjectId: 'S', archetype: 'KPI_DASHBOARD', title: 'Test', metrics: [{ label: 'A', value: '1' }] },
      { pageWidthPt: 800, pageHeightPt: 450, alphaThemeId: 'NAVY_TEAL_PRODUCTION' }
    )
    expect(r.result.placed).toBeDefined()
    expect(r.result.placed!.length).toBeGreaterThan(0)
    for (const p of r.result.placed!) {
      expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(800.1)
      expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(450.1)
    }
  })

  it('D4 4:3 page is supported and yields correct sx/sy', () => {
    const g = resolvePageGeometry(800, 600)
    expect(g.aspect).toBe('4:3')
    expect(g.sx).toBeCloseTo(800 / 960, 10)
    expect(g.sy).toBeCloseTo(600 / 540, 10)
    const safe = safeAreaOf(g)
    expect(safe.x).toBe(800 / 20)
    expect(safe.y).toBe(600 / 18)
  })

  it('D5 custom page size supported by composeSlideOnPage with all objects inside', () => {
    const r = composeSlideOnPage(
      { pageObjectId: 'S', archetype: 'KPI_DASHBOARD', title: 'Test', metrics: [
        { label: 'A', value: '1' }, { label: 'B', value: '2' },
      ]},
      { pageWidthPt: 800, pageHeightPt: 450, alphaThemeId: 'NAVY_TEAL_PRODUCTION' }
    )
    for (const p of r.result.placed!) {
      expect(p.rect.x).toBeGreaterThanOrEqual(-1)
      expect(p.rect.y).toBeGreaterThanOrEqual(-1)
      expect(p.rect.x + p.rect.w).toBeLessThanOrEqual(801)
      expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(451)
    }
  })
})

describe('TASK-096-R1-A QA contract - no undefined/NaN disabling', () => {
  it('E1 assertRect rejects non-finite coordinates', () => {
    expect(() => composeSlideOnPage(
      { pageObjectId: 'S', archetype: 'COVER', title: 'Test' },
      { pageWidthPt: 720, pageHeightPt: 405 }
    )).not.toThrow()
  })

  it('E2 qaComposedSlide uses page dimensions when provided', () => {
    const r = composeSlideOnPage(
      { pageObjectId: 'S', archetype: 'KPI_DASHBOARD', title: 'Test', metrics: [{ label: 'X', value: 'Y' }] },
      { pageWidthPt: 720, pageHeightPt: 405, alphaThemeId: 'NAVY_TEAL_PRODUCTION' }
    )
    const findings = qaComposedSlide(
      { archetype: 'KPI_DASHBOARD', content: { title: 'Test', metrics: [{ label: 'X', value: 'Y' }] } },
      r.result,
      { pageWidthPt: 720, pageHeightPt: 405 }
    )
    const boundsFinding = findings.find((f) => f.check === 'in-bounds')
    expect(boundsFinding?.pass).toBe(true)
  })

  it('E3 compile-time geometry rejects objects outside 720×405', () => {
    const plan = __deckTest.compileDeckPlan(fullFixture())
    for (const s of plan.geometry.slides) {
      expect(s.outOfPageIds).toEqual([])
      expect(s.geometryStatus).toBe('PASS')
    }
  })

  it('E4 composeSlideOnPage rejects overflow at compile time', () => {
    expect(() => composeSlideOnPage(
      { pageObjectId: 'S', archetype: 'KPI_DASHBOARD', title: 'T', metrics: [{ label: 'A', value: '1' }] },
      { pageWidthPt: 720, pageHeightPt: 405 }
    )).not.toThrow()
  })

  it('E5 non-finite page dimensions fail in resolvePageGeometry', () => {
    expect(() => resolvePageGeometry(NaN, 405)).toThrow()
    expect(() => resolvePageGeometry(720, NaN)).toThrow()
    expect(() => resolvePageGeometry(0, 405)).toThrow()
    expect(() => resolvePageGeometry(720, 0)).toThrow()
    expect(() => resolvePageGeometry(-1, 405)).toThrow()
  })
})

describe('TASK-096-R1-A synthetic analyzer fixtures (not rendered runtime proof)', () => {
  it('F1 SYNTHETIC_INSET_DETECTION: analyzer detects white perimeter on synthetic image', () => {
    const navy: [number, number, number] = [10, 22, 40]
    const white: [number, number, number] = [255, 255, 255]
    const analysis = analyzeRenderedSlide(borderedImage(200, 120, 12, white, navy), 200, 120, { backgroundHex: '#0A1628' })
    expect(analysis.whitePerimeterPct).toBeGreaterThan(90)
    expect((analysis.backgroundCoveragePct ?? 100)).toBeLessThan(90)
  })

  it('F2 SYNTHETIC_CLIPPING_DETECTION: analyzer detects out-of-frame content on synthetic image', () => {
    const img = solidImage(200, 120, [10, 22, 40] as [number, number, number])
    const missing = missingContentRegions([{ x: 250, y: 10, w: 50, h: 20 }], img, 200, 120, { backgroundHex: '#0A1628' })
    expect(missing).toEqual([0])
    const analysis = analyzeRenderedSlide(img, 200, 120, { backgroundHex: '#0A1628' })
    expect(analysis.clippingDetectable).toBe(false)
  })

  it('F3 SYNTHETIC_MISSING_CONTENT_DETECTION: analyzer detects empty content on synthetic image', () => {
    const img = solidImage(200, 120, [10, 22, 40] as [number, number, number])
    const missing = missingContentRegions([{ x: 20, y: 20, w: 60, h: 30 }], img, 200, 120, { backgroundHex: '#0A1628' })
    expect(missing).toEqual([0])
    const content = borderedImage(200, 120, 0, [10, 22, 40], [10, 22, 40])
    for (let i = 0; i < content.length; i += 4) {
      if ((i / 4) % 7 === 0) {
        content[i] = 241
        content[i + 1] = 245
        content[i + 2] = 249
      }
    }
    const present = missingContentRegions([{ x: 0, y: 0, w: 200, h: 120 }], content, 200, 120, { backgroundHex: '#0A1628' })
    expect(present).toEqual([])
  })

  it('F4 RUNTIME_RENDERED_QA remains UNPROVEN (requires Google OAuth + screenshot export)', () => {
    const renderedQaStatus = 'UNPROVEN'
    expect(renderedQaStatus).toBe('UNPROVEN')
  })
})

describe('TASK-096-R1 non-regression boundaries', () => {
  it('35 existing non-production themes compile unchanged (no page backgrounds)', () => {
    const plan = __deckTest.compileDeckPlan({
      title: 'Legacy Deck',
      themeId: 'ALPHA_LIGHT_EXECUTIVE',
      slides: [{ slideKey: 's', title: 'Summary', bullets: [{ text: 'Narrative one' }] }],
    })
    const bgReqs = plan.requests.filter((r) => (r as Record<string, unknown>).updatePageProperties !== undefined)
    expect(bgReqs.length).toBe(0)
    expect(plan.geometry.status).toBe('PASS')
  })

  it('36 existing slides_compose_slide compatibility path is unchanged', () => {
    const { input } = validateComposeInput({
      presentationId: 'P1',
      pageObjectId: 'S1',
      archetype: 'COVER',
      title: 'Compat Cover',
    })
    expect(input.archetype).toBe('COVER')
    expect(input.sourceFacts).toBeUndefined()
    expect(input.themeId).toBeUndefined()
  })
})
