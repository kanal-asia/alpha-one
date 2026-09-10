/**
 * TASK-086 Phase 17/18/19: targeted regression fixtures reproducing the
 * human-observed failures, aspect-ratio coverage, and the numeric-integrity
 * guard. Pure construction + QA (no Google traffic).
 */
import { describe, expect, it } from 'vitest'
import {
  checkHierarchy,
  classifyTextFit,
  decideOwnership,
  estimateLines,
  findFabricatedNumbers,
  fitGrid,
  fitRowItems,
  hasBlocking,
  isBodyPlaceholderType,
  isOrphanPlaceholderText,
  isTitlePlaceholderType,
  layoutFor,
  qaReadback,
  rectContains,
  rectsOverlap,
  resolvePageGeometry,
  runPrewriteQa,
  numericTokens,
  type PlacedElement,
} from './geometry'
import { composeSlideOnPage, type ComposeInput } from './beautify'

const PAGE = 'SLIDE_FIXTURE_01'

function blockingOf(input: ComposeInput, opts: { w: number; h: number; placeholders?: Parameters<typeof composeSlideOnPage>[1]['placeholders'] }) {
  const composed = composeSlideOnPage(
    { pageObjectId: PAGE, ...input },
    { pageWidthPt: opts.w, pageHeightPt: opts.h, ...(opts.placeholders ? { placeholders: opts.placeholders } : {}) }
  )
  return { composed, blocking: composed.prewriteQa.filter((f) => !f.pass && f.severity === 'BLOCKING') }
}

describe('page geometry (Phase 2)', () => {
  it('recognizes 16:9 in two absolute sizes with proportional scale', () => {
    const a = resolvePageGeometry(960, 540)
    const b = resolvePageGeometry(720, 405)
    expect(a.aspect).toBe('16:9')
    expect(b.aspect).toBe('16:9')
    expect(a.fontScale).toBe(1)
    expect(b.fontScale).toBe(0.75)
  })
  it('recognizes 4:3 and custom without rejecting', () => {
    expect(resolvePageGeometry(720, 540).aspect).toBe('4:3')
    expect(resolvePageGeometry(1000, 500).aspect).toBe('custom')
  })
  it('rejects non-finite and non-positive dimensions', () => {
    expect(() => resolvePageGeometry(NaN, 540)).toThrow()
    expect(() => resolvePageGeometry(960, 0)).toThrow()
  })
  it('safe area reproduces v1 margins on the design canvas', () => {
    const layout = layoutFor(resolvePageGeometry(960, 540))
    expect(layout.M).toBe(48)
    expect(layout.TITLE).toMatchObject({ x: 48, y: 30, w: 864, h: 84 })
    expect(layout.CONTENT_TOP).toBe(150)
    expect(layout.GUTTER).toBe(24)
  })
})

describe('placeholder ownership (Phases 4/10)', () => {
  const titleEmpty = { objectId: 'T1', type: 'TITLE', text: '' }
  const bodyEmpty = { objectId: 'B1', type: 'BODY', text: 'Click to add text' }
  it('type predicates classify TITLE/CENTER_TITLE and BODY/SUBTITLE', () => {
    expect(isTitlePlaceholderType('TITLE')).toBe(true)
    expect(isTitlePlaceholderType('CENTER_TITLE')).toBe(true)
    expect(isTitlePlaceholderType('BODY')).toBe(false)
    expect(isBodyPlaceholderType('BODY')).toBe(true)
    expect(isBodyPlaceholderType('SUBTITLE')).toBe(true)
    expect(isBodyPlaceholderType('FOOTER')).toBe(false)
  })
  it('orphan detection covers empty and Click-to-add prompts', () => {
    expect(isOrphanPlaceholderText('')).toBe(true)
    expect(isOrphanPlaceholderText('Click to add title')).toBe(true)
    expect(isOrphanPlaceholderText('Q3 Review')).toBe(false)
  })
  it('fixture A: custom composition clears orphan title+body explicitly', () => {
    const decisions = decideOwnership([titleEmpty, bodyEmpty], { reuseTitle: false, reuseBody: false })
    expect(decisions).toEqual([
      expect.objectContaining({ objectId: 'T1', decision: 'CLEAR' }),
      expect.objectContaining({ objectId: 'B1', decision: 'CLEAR' }),
    ])
  })
  it('reuses an empty title when the plan asks for it', () => {
    const decisions = decideOwnership([titleEmpty], { reuseTitle: true, reuseBody: false })
    expect(decisions[0]?.decision).toBe('REUSE')
  })
  it('preserves content-carrying and non-title/body placeholders', () => {
    const decisions = decideOwnership(
      [
        { objectId: 'T2', type: 'TITLE', text: 'Template headline' },
        { objectId: 'F1', type: 'FOOTER', text: '' },
        { objectId: 'S1', type: 'SLIDE_NUMBER', text: '' },
      ],
      { reuseTitle: false, reuseBody: false }
    )
    expect(decisions.map((d) => d.decision)).toEqual(['PRESERVE', 'PRESERVE', 'PRESERVE'])
  })
})

describe('text fit estimation (Phase 6)', () => {
  it('short labels fit; long theses overflow fixed boxes', () => {
    // A 40pt value in a 60pt box is snug by design (TIGHT, not blocking).
    expect(classifyTextFit('ROAS', 40, { w: 240, h: 60 }).fit).toBe('TIGHT')
    expect(estimateLines('Impressions', 20, 110)).toBeGreaterThan(1)
    const long = 'Growth compounds when acquisition, activation, retention, referral and revenue loops reinforce each other across every channel and cohort quarter after quarter without pause.'
    expect(classifyTextFit(long, 44, { w: 784, h: 180 }).fit).toBe('OVERFLOW')
  })
  it('single unbreakable words flag pathological wrap risk', () => {
    expect(estimateLines('Impressions', 20, 60)).toBe(Number.POSITIVE_INFINITY)
    expect(classifyTextFit('Impressions', 20, { w: 60, h: 100 }).fit).toBe('OVERFLOW')
  })
  it('tight boxes report TIGHT/OVERFLOW_RISK without failing', () => {
    const verdict = classifyTextFit('Repeat Purchase loyalty loop', 14, { w: 200, h: 40 })
    expect(['TIGHT', 'OVERFLOW_RISK', 'FIT']).toContain(verdict.fit)
  })
})

describe('collision + containment + hierarchy (Phases 7/8/9/10)', () => {
  const box = (id: string, x: number, y: number, w: number, h: number): PlacedElement => ({ id, kind: 'shape', rect: { x, y, w, h } })
  const text = (id: string, x: number, y: number, w: number, h: number, parentId?: string): PlacedElement => ({
    id, kind: 'text', rect: { x, y, w, h }, text: 'Hi', fontPt: 14, role: 'body', ...(parentId ? { parentId } : {}),
  })
  it('touching edges are not collisions; overlaps are', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 100, h: 100 }, { x: 100, y: 0, w: 100, h: 100 })).toBe(false)
    expect(rectsOverlap({ x: 0, y: 0, w: 100, h: 100 }, { x: 50, y: 50, w: 100, h: 100 })).toBe(true)
  })
  it('containment respects tolerance', () => {
    expect(rectContains({ x: 0, y: 0, w: 100, h: 100 }, { x: 10, y: 10, w: 50, h: 50 })).toBe(true)
    expect(rectContains({ x: 0, y: 0, w: 100, h: 100 }, { x: 10, y: 10, w: 95, h: 50 })).toBe(false)
  })
  it('prewrite QA flags text/text overlap but exempts parent/child + decoration', () => {
    const card = box('card', 0, 0, 200, 200)
    const label = text('label', 10, 10, 100, 30, 'card')
    const stray = text('stray', 50, 20, 100, 30)
    const bg = { ...box('bg', 0, 0, 960, 540), kind: 'background' as const }
    const findings = runPrewriteQa({
      page: resolvePageGeometry(960, 540),
      elements: [card, label, stray, bg],
      placeholders: [],
      ownership: [],
      hierarchy: [],
    })
    expect(findings.find((f) => f.check === 'TEXT_COLLISION')?.pass).toBe(false)
    const clean = runPrewriteQa({
      page: resolvePageGeometry(960, 540),
      elements: [card, label, bg],
      placeholders: [],
      ownership: [],
      hierarchy: [],
    })
    expect(clean.find((f) => f.check === 'TEXT_COLLISION')?.pass).toBe(true)
  })
  it('hierarchy fails when body equals the title size', () => {
    expect(
      checkHierarchy([
        { role: 'slideTitle', fontPt: 20, id: 't' },
        { role: 'body', fontPt: 20, id: 'b' },
      ]).pass
    ).toBe(false)
    expect(
      checkHierarchy([
        { role: 'slideTitle', fontPt: 32, id: 't' },
        { role: 'body', fontPt: 14, id: 'b' },
        { role: 'caption', fontPt: 11, id: 'c' },
      ]).pass
    ).toBe(true)
  })
})

describe('layout allocation helpers (Phase 5)', () => {
  it('fitRowItems rejects unreadable narrow boxes', () => {
    expect(fitRowItems(6, 864, 16, 150)).toBeNull()
    expect(fitRowItems(3, 864, 24, 150)?.itemW).toBeCloseTo(272, 5)
  })
  it('fitGrid prefers the widest feasible column count', () => {
    const fit = fitGrid(6, 864, 302, 200, 120, 24, 3)
    expect(fit).toMatchObject({ cols: 3, rows: 2 })
    expect(fitGrid(6, 200, 100, 200, 120, 24, 3)).toBeNull()
  })
})

describe('fixture B: six-stage funnel reflows to two rows (Phase 11/18)', () => {
  const stages = [
    { label: 'Impressions', description: 'Top of funnel reach' },
    { label: 'Clicks', description: 'Ad engagement' },
    { label: 'Landing Page', description: 'Visit the offer' },
    { label: 'Add to Cart', description: 'Consideration' },
    { label: 'Purchases', description: 'Conversion' },
    { label: 'Repeat Purchase', description: 'Loyalty loop' },
  ]
  it('single-row geometry would collide; composed slide reflows and passes', () => {
    const { composed, blocking } = blockingOf(
      { archetype: 'PROCESS_FUNNEL', title: 'Funnel', stages },
      { w: 960, h: 540 }
    )
    expect(composed.reflowAttempts).toBeGreaterThan(1)
    expect(composed.finalStatus).toBe('GEOMETRY_PROVEN_AFTER_REFLOW')
    expect(blocking).toEqual([])
    expect(composed.prewriteQa.find((f) => f.check === 'TEXT_COLLISION')?.pass).toBe(true)
  })
  it('no pathological word splits or card overlap on 720×405 either', () => {
    const { composed, blocking } = blockingOf(
      { archetype: 'PROCESS_FUNNEL', title: 'Funnel', stages },
      { w: 720, h: 405 }
    )
    expect(blocking).toEqual([])
    expect(composed.finalStatus).not.toBe('GEOMETRY_FAILED')
  })
})

describe('fixture C: four-channel comparison fits with hierarchy (Phase 17)', () => {
  const columns = [
    { name: 'Meta Ads', items: ['Facebook/Instagram reach', 'ROAS 4.0x'] },
    { name: 'Google Ads', items: ['Search intent', 'CAC Rp82K'] },
    { name: 'TikTok Ads', items: ['Short video', 'CTR 2.1%'] },
    { name: 'Email Marketing', items: ['Newsletter', 'Open 31%'] },
  ]
  it('headings clear metrics; cards stay in page with passing gaps', () => {
    const { composed, blocking } = blockingOf(
      { archetype: 'COMPARISON', title: 'Channels', columns },
      { w: 960, h: 540 }
    )
    expect(blocking).toEqual([])
    expect(composed.finalStatus).toBe('GEOMETRY_PROVEN')
  })
})

describe('fixture D: roadmap stays inside the safe region (Phase 17)', () => {
  const stages = [
    { label: 'Q1 Launch', description: 'Ship the MVP to early adopters' },
    { label: 'Q2 Scale', description: 'Grow to ten thousand users' },
    { label: 'Q3 Monetize', description: 'Launch paid tiers' },
    { label: 'Q4 Expand', description: 'Open two new regions' },
  ]
  it('timeline labels and descriptions clear each other and the page edge', () => {
    const { composed, blocking } = blockingOf(
      { archetype: 'TIMELINE_ROADMAP', title: 'Roadmap', stages },
      { w: 960, h: 540 }
    )
    expect(blocking).toEqual([])
  })
})

describe('fixture E: closing thesis adapts, then fails closed honestly (Phases 6/14)', () => {
  it('a fittable thesis reflows typography and passes', () => {
    const closing = 'System beats tactics when every channel compounds.'
    const { composed, blocking } = blockingOf(
      { archetype: 'CLOSING_INSIGHT', title: 'Takeaway', closing },
      { w: 960, h: 540 }
    )
    expect(blocking).toEqual([])
    expect(composed.finalStatus).toContain('GEOMETRY_PROVEN')
  })
  it('an unrenderable 300-char thesis fails closed instead of clipping', () => {
    const closing =
      'Growth compounds when acquisition, activation, retention, referral and revenue loops reinforce each other across every channel and cohort quarter after quarter without pause while teams execute with discipline and focus on what matters most for durable advantage over multi-year horizons together.'
    const { composed } = blockingOf(
      { archetype: 'CLOSING_INSIGHT', title: 'Takeaway', closing },
      { w: 960, h: 540 }
    )
    expect(composed.finalStatus).toBe('GEOMETRY_FAILED')
    expect(hasBlocking(composed.prewriteQa)).toBe(true)
  })
})

describe('fixture F: dense KPI dashboard keeps hierarchy readable (Phase 17)', () => {
  const metrics = [
    { label: 'ROAS', value: '4.0x' },
    { label: 'CAC', value: 'Rp82K' },
    { label: 'CTR', value: '2.1%' },
    { label: 'Revenue', value: 'Rp480M' },
    { label: 'Growth', value: '31%' },
    { label: 'NPS', value: '62' },
  ]
  it('six tiles fit 3×2 with consistent hierarchy and no collisions', () => {
    const { composed, blocking } = blockingOf(
      { archetype: 'KPI_DASHBOARD', title: 'Snapshot', metrics },
      { w: 960, h: 540 }
    )
    expect(blocking).toEqual([])
    expect(composed.finalStatus).toBe('GEOMETRY_PROVEN')
  })
})

describe('aspect-ratio matrix (Phase 18)', () => {
  const kpi = {
    archetype: 'KPI_DASHBOARD' as const,
    title: 'Snapshot',
    metrics: [
      { label: 'ROAS', value: '4.0x' },
      { label: 'CAC', value: 'Rp82K' },
    ],
  }
  it.each([
    [960, 540, '16:9'],
    [720, 405, '16:9'],
    [720, 540, '4:3'],
    [1000, 500, 'custom'],
  ])('%dx%d resolves %s and composes without blocking findings', (w, h, aspect) => {
    const { composed, blocking } = blockingOf(kpi, { w, h })
    expect(composed.layout.page.aspect).toBe(aspect)
    expect(blocking).toEqual([])
  })
})

describe('readback QA (Phase 13)', () => {
  const page = resolvePageGeometry(960, 540)
  it('flags missing objects, orphans, and surviving cleared placeholders', () => {
    const findings = qaReadback({
      page,
      expectedTexts: ['Hello'],
      expectedIds: ['AB_X_0', 'AB_X_1'],
      clearedIds: ['PH_B1'],
      elements: [
        { objectId: 'AB_X_0', rectPt: { x: 48, y: 30, w: 100, h: 40 }, text: 'Hello' },
        { objectId: 'PH_B1', rectPt: { x: 48, y: 200, w: 100, h: 40 }, text: '', placeholderType: 'BODY' },
      ],
      ownership: [],
    })
    expect(findings.find((f) => f.check === 'READBACK_OBJECTS_PRESENT')?.pass).toBe(false)
    expect(findings.find((f) => f.check === 'READBACK_CLEARED_GONE')?.pass).toBe(false)
    expect(findings.find((f) => f.check === 'READBACK_NO_ORPHAN_PLACEHOLDERS')?.pass).toBe(false)
    expect(hasBlocking(findings)).toBe(true)
  })
  it('passes a clean readback', () => {
    const findings = qaReadback({
      page,
      expectedTexts: ['Hello'],
      expectedIds: ['AB_X_0'],
      clearedIds: [],
      elements: [{ objectId: 'AB_X_0', rectPt: { x: 48, y: 30, w: 100, h: 40 }, text: 'Hello' }],
      ownership: [],
    })
    expect(findings.filter((f) => !f.pass)).toEqual([])
  })
})

describe('content-integrity guard (Phase 19)', () => {
  it('detects fabricated numeric facts', () => {
    expect(numericTokens(['Growth 31% in Q3'])).toEqual(expect.arrayContaining(['31%', 'q3']))
    expect(findFabricatedNumbers(['Growth 31%'], ['Growth 31%', 'plus 12% lift'])).toEqual(['12%'])
    expect(findFabricatedNumbers(['Growth 31%'], ['Growth 31%'])).toEqual([])
  })
})
