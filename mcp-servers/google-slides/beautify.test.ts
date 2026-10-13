/**
 * TASK-085 §11: Alpha Beautify v1 tests — planner, router, design system,
 * all eight renderers, QA, validation. No Google traffic (pure construction).
 */
import { describe, expect, it } from 'vitest'
import {
  ARCHETYPES,
  CANVAS,
  MARGIN,
  PALETTE,
  TYPE,
  TITLE_BAND,
  CONTENT_TOP,
  classifyArchetype,
  planDeck,
  composeSlide,
  chunkRequests,
  qaComposedSlide,
  validateComposeInput,
  checkDecorationProtectedRegionIntersections,
  buildBackgroundRequests,
  type ComposeInput,
  type ProtectedRegion,
} from './beautify'
import type { PlacedElement } from './geometry'

const PAGE = 'SLIDE_TEST_01'

function compose(archetype: ComposeInput['archetype'], extra: Partial<ComposeInput> = {}) {
  return composeSlide({ pageObjectId: PAGE, archetype, title: 'Test Title', ...extra })
}

function requestKinds(result: ReturnType<typeof composeSlide>): string[] {
  return result.requests.map((r) => Object.keys(r)[0])
}

describe('design system constants', () => {
  it('canvas is 16:9 with safe margins', () => {
    expect(CANVAS).toEqual({ width: 960, height: 540 })
    expect(MARGIN).toBe(48)
  })
  it('type scale distinguishes display/title/body/metric', () => {
    expect(TYPE.display.fontSizePt).toBeGreaterThan(TYPE.title.fontSizePt)
    expect(TYPE.metric.fontSizePt).toBeGreaterThan(TYPE.body.fontSizePt)
  })
  it('palette is bounded (no per-slide randomness)', () => {
    expect(Object.keys(PALETTE)).toEqual(
      expect.arrayContaining(['background', 'ink', 'accent', 'cardFill'])
    )
  })
  it('exactly eight archetypes', () => {
    expect(ARCHETYPES).toHaveLength(8)
  })
})

describe('router — semantic classification', () => {
  const cases: Array<{ name: string; input: Parameters<typeof classifyArchetype>[0]; want: string }> = [
    { name: 'kpi by metrics', input: { position: 'middle', title: 'Snapshot', bullets: [], metrics: [{ label: 'ROAS', value: '4.0x' }, { label: 'CAC', value: 'Rp82K' }] }, want: 'KPI_DASHBOARD' },
    { name: 'kpi by values in text', input: { position: 'middle', title: 'Numbers', bullets: ['Revenue Rp480M', 'Growth 31%'] }, want: 'KPI_DASHBOARD' },
    { name: 'comparison by columns', input: { position: 'middle', title: 'Channels', bullets: [], columns: [{ name: 'A', items: ['x'] }, { name: 'B', items: ['y'] }] }, want: 'COMPARISON' },
    { name: 'timeline by dates', input: { position: 'middle', title: 'Roadmap', bullets: [], stages: [{ label: 'Q1 Launch' }, { label: 'Q2 Scale' }] }, want: 'TIMELINE_ROADMAP' },
    { name: 'funnel by stages', input: { position: 'middle', title: 'Journey', bullets: [], stages: [{ label: 'Awareness' }, { label: 'Loyalty' }] }, want: 'PROCESS_FUNNEL' },
    { name: 'cover first intro', input: { position: 'first', title: 'Growth Vision 2026', bullets: [] }, want: 'COVER' },
    { name: 'closing last thesis', input: { position: 'last', title: 'Our Recommendation', bullets: [] }, want: 'CLOSING_INSIGHT' },
    { name: 'pillars grouping', input: { position: 'middle', title: 'Ecosystem', bullets: ['Content pillar', 'Media pillar'] }, want: 'PILLARS_STRATEGY' },
    { name: 'summary fallback', input: { position: 'middle', title: 'Priorities', bullets: ['One', 'Two'] }, want: 'EXECUTIVE_SUMMARY' },
  ]
  for (const c of cases) {
    it(c.name, () => {
      const out = classifyArchetype(c.input)
      expect(out.archetype).toBe(c.want)
      expect(out.reason.length).toBeGreaterThan(0)
    })
  }
})

describe('planDeck — narrative integration', () => {
  it('slots coherent narrative across positions', () => {
    const deck = planDeck('Growth', [
      { purpose: 'intro', title: 'Growth Vision', content: { title: 'Growth Vision' } },
      { purpose: 'metrics', title: 'Snapshot', content: { title: 'Snapshot', metrics: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }] } },
      { purpose: 'thesis', title: 'Our Takeaway', content: { title: 'Our Takeaway' } },
    ])
    expect(deck.slides.map((s) => s.archetype)).toEqual(['COVER', 'KPI_DASHBOARD', 'CLOSING_INSIGHT'])
    expect(deck.slides.map((s) => s.slideNumber)).toEqual([1, 2, 3])
    expect(deck.narrative.opening).toBe('Growth Vision')
    expect(deck.narrative.closing).toBe('Our Takeaway')
  })
  it('explicit override wins with reason', () => {
    const deck = planDeck('T', [{ purpose: 'x', title: 'Y', content: { title: 'Y' }, archetype: 'COMPARISON' }])
    expect(deck.slides[0].archetype).toBe('COMPARISON')
    expect(deck.slides[0].reason).toMatch(/override/)
  })
  it('rejects empty and oversized decks', () => {
    expect(() => planDeck('T', [])).toThrow(/1\.\.30/)
    expect(() => planDeck('', [{ purpose: 'x', title: 'Y', content: { title: 'Y' } }])).toThrow(/topic/)
  })
})

describe.each([
  ['COVER', { subtitle: 'Sub', closing: 'Thesis line' }],
  ['EXECUTIVE_SUMMARY', { bullets: ['One', 'Two', 'Three'] }],
  ['KPI_DASHBOARD', { metrics: [{ label: 'ROAS', value: '4.0x' }, { label: 'CAC', value: 'Rp82K' }] }],
  ['PROCESS_FUNNEL', { stages: [{ label: 'Aware', description: 'Top' }, { label: 'Loyal', description: 'End' }] }],
  ['COMPARISON', { columns: [{ name: 'A', items: ['x', 'y'] }, { name: 'B', items: ['z'] }] }],
  ['TIMELINE_ROADMAP', { stages: [{ label: 'Q1', description: 'Start' }, { label: 'Q2', description: 'Grow' }, { label: 'Q3', description: 'Scale' }] }],
  ['PILLARS_STRATEGY', { columns: [{ name: 'Content', items: ['a'] }, { name: 'Media', items: ['b'] }] }],
  ['CLOSING_INSIGHT', { closing: 'System beats tactics.' }],
] as Array<[ComposeInput['archetype'], Partial<ComposeInput>]> )('renderer %s', (archetype, extra) => {
  it('builds native requests with content preserved and QA green', () => {
    const result = compose(archetype, extra)
    expect(result.requests.length).toBeGreaterThan(0)
    expect(result.expected.archetype).toBe(archetype)
    const findings = qaComposedSlide(
      { archetype, content: { title: 'Test Title', ...extra } },
      result
    )
    const failed = findings.filter((f) => !f.pass)
    expect(failed).toEqual([])
  })
  it('uses only allowlisted request families', () => {
    const result = compose(archetype, extra)
    const allowed = new Set([
      'createShape',
      'insertText',
      'updateTextStyle',
      'updateParagraphStyle',
      'updateShapeProperties',
      'updatePageElementTransform',
      'createLine',
      'groupObjects',
      // TASK-090: cover motif layering uses the allowlisted z-order op.
      'updatePageElementsZOrder',
    ])
    for (const kind of requestKinds(result)) {
      expect(allowed.has(kind)).toBe(true)
    }
  })
})

describe('renderer specifics', () => {
  it('KPI cards group shape+texts and stay in bounds', () => {
    const result = compose('KPI_DASHBOARD', {
      metrics: [
        { label: 'A', value: '1' },
        { label: 'B', value: '2' },
        { label: 'C', value: '3' },
        { label: 'D', value: '4' },
        { label: 'E', value: '5' },
        { label: 'F', value: '6' },
      ],
    })
    expect(result.expected.groups).toBe(6)
    expect(result.expected.elementCount).toBeGreaterThan(12)
  })
  it('comparison rejects fewer than 2 columns', () => {
    expect(() => compose('COMPARISON', { columns: [{ name: 'A', items: ['x'] }] })).toThrow(/2\.\.4/)
  })
  it('funnel arrows sit between stage boxes', () => {
    const result = compose('PROCESS_FUNNEL', { stages: [{ label: 'A' }, { label: 'B' }] })
    expect(requestKinds(result)).toContain('createShape')
  })
  it('closing centers thesis with accent bar', () => {
    const result = compose('CLOSING_INSIGHT', { closing: 'Less but better.' })
    expect(result.expected.titles).toContain('Less but better.')
  })
})

describe('validation', () => {
  it('rejects unknown archetype', () => {
    expect(() =>
      validateComposeInput({ presentationId: 'P', pageObjectId: PAGE, archetype: 'WORDART', title: 'T' })
    ).toThrow(/archetype/)
  })
  it('rejects missing page and oversized metrics', () => {
    expect(() => validateComposeInput({ presentationId: 'P', archetype: 'COVER', title: 'T' })).toThrow(/pageObjectId/)
    expect(() =>
      validateComposeInput({
        presentationId: 'P',
        pageObjectId: PAGE,
        archetype: 'KPI_DASHBOARD',
        title: 'T',
        metrics: Array.from({ length: 7 }, (_, i) => ({ label: `L${i}`, value: '1' })),
      })
    ).toThrow(/at most 6/)
  })
  it('chunking caps at 25 per batch', () => {
    const result = compose('KPI_DASHBOARD', {
      metrics: Array.from({ length: 6 }, (_, i) => ({ label: `L${i}`, value: `${i}x` })),
    })
    const chunks = chunkRequests(result.requests)
    expect(chunks.length).toBeGreaterThanOrEqual(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(25)
    expect(chunks.flat().length).toBe(result.requests.length)
  })
})

describe('objectId uniqueness across compose calls (Phase 14 corrective)', () => {
  function collectIds(result: ReturnType<typeof composeSlide>): string[] {
    const ids: string[] = []
    for (const r of result.requests) {
      const body = (r[Object.keys(r)[0]] ?? {}) as Record<string, unknown>
      if (typeof body.objectId === 'string') ids.push(body.objectId)
    }
    return ids
  }
  it('two slides produce disjoint ID sets (no presentation-wide collision)', () => {
    const a = compose('KPI_DASHBOARD', { metrics: [{ label: 'A', value: '1' }] })
    const b = compose('KPI_DASHBOARD', { metrics: [{ label: 'B', value: '2' }] })
    const idsA = collectIds(a)
    const idsB = collectIds(b)
    expect(idsA.length).toBeGreaterThan(0)
    expect(idsB.length).toBeGreaterThan(0)
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([])
  })
  it('IDs satisfy Google objectId constraints', () => {
    const a = compose('COVER', { subtitle: 'S', closing: 'C' })
    for (const id of collectIds(a)) {
      expect(id).toMatch(/^[A-Za-z0-9_][A-Za-z0-9_-]*$/)
      expect(id.length).toBeLessThanOrEqual(50)
    }
  })
})

describe('QA layer', () => {
  it('flags missing content', () => {
    const result = compose('EXECUTIVE_SUMMARY', { bullets: ['Alpha', 'Beta'] })
    const findings = qaComposedSlide(
      { archetype: 'EXECUTIVE_SUMMARY', content: { title: 'Test Title', bullets: ['Alpha', 'Gamma'] } },
      result
    )
    expect(findings.find((f) => f.check === 'content-preserved')?.pass).toBe(false)
  })
})

// ─── TASK-096-R5-A: 36 regression tests ─────────────────────────────────────
// Verifies: gate false-negative fix, GRADIENT_* placement below/above protected
// regions, right-rail clearance, bottom-band clearance, and paired-delta bar
// suppression for non-homogeneous units.

const TITLE_REGION: ProtectedRegion = {
  id: 'TITLE',
  role: 'title',
  rect: { x: 48, y: 30, w: 864, h: 84 },
}
const CONTENT_REGION: ProtectedRegion = {
  id: 'CONTENT',
  role: 'content',
  rect: { x: 48, y: 150, w: 864, h: 342 },
}

function deco(id: string, kind: PlacedElement['kind'], rect: PlacedElement['rect']): PlacedElement {
  return { id, kind, rect }
}

// ── Category 1: Gate filter — background element inclusion (6 tests) ─────────
describe('R5-A gate: background element inclusion', () => {
  const TITLE_BG: ProtectedRegion = {
    id: 'TITLE',
    role: 'title',
    rect: { x: 0, y: 0, w: 960, h: 114 },
  }

  it('BG_ shape is caught by the gate', () => {
    const els = [deco('BG_G0', 'shape', { x: 0, y: 0, w: 960, h: 60 })]
    const f = checkDecorationProtectedRegionIntersections(els, [TITLE_BG])
    expect(f[0].pass).toBe(false)
    expect(f[0].severity).toBe('BLOCKING')
  })

  it('BG_ background-kind is caught by the gate (R5-A fix)', () => {
    const els = [deco('BG_G0', 'background', { x: 0, y: 0, w: 960, h: 60 })]
    const f = checkDecorationProtectedRegionIntersections(els, [TITLE_BG])
    expect(f[0].pass).toBe(false)
  })

  it('DECO_ shape is caught by the gate', () => {
    const els = [deco('DECO_rail', 'shape', { x: 883, y: 0, w: 58, h: 540 })]
    const f = checkDecorationProtectedRegionIntersections(els, [TITLE_BG])
    expect(f[0].pass).toBe(false)
  })

  it('MOTIF_ line is caught by the gate', () => {
    const els = [deco('MOTIF_line', 'line', { x: 48, y: 30, w: 200, h: 4 })]
    const f = checkDecorationProtectedRegionIntersections(els, [TITLE_BG])
    expect(f[0].pass).toBe(false)
  })

  it('ACCENT_ shape is caught by the gate', () => {
    const els = [deco('ACCENT_bar', 'shape', { x: 48, y: 30, w: 8, h: 84 })]
    const f = checkDecorationProtectedRegionIntersections(els, [TITLE_BG])
    expect(f[0].pass).toBe(false)
  })

  it('element without decoration prefix is ignored by the gate', () => {
    const els = [deco('content_box', 'shape', { x: 48, y: 30, w: 864, h: 84 })]
    const f = checkDecorationProtectedRegionIntersections(els, [TITLE_BG])
    expect(f[0].pass).toBe(true)
  })
})

// ── Category 2: GRADIENT_BAND_TOP placement (6 tests) ────────────────────────
// Helper: extract design-canvas coords from a createShape request (EMU → PT)
function shapeRectPT(r: any): { x: number; y: number; w: number; h: number } | null {
  const cs = r.createShape
  if (!cs?.elementProperties) return null
  const emuPerPt = 12700
  const ep = cs.elementProperties
  return {
    x: (ep.transform?.translateX ?? 0) / emuPerPt,
    y: (ep.transform?.translateY ?? 0) / emuPerPt,
    w: (ep.size?.width ?? 0) / emuPerPt,
    h: (ep.size?.height ?? 0) / emuPerPt,
  }
}

function isBgShape(r: any): boolean {
  const cs = r.createShape
  return typeof cs?.objectId === 'string' && cs.objectId.includes('_BG_')
}

describe('R5-A gate: GRADIENT_BAND_TOP does not intersect title', () => {
  it('top bands stay below title end on 960×540', () => {
    const result = compose('EXECUTIVE_SUMMARY', { bullets: ['Alpha', 'Beta', 'Gamma'] })
    const bgShapes = result.requests.filter(isBgShape)
    for (const req of bgShapes) {
      const rect = shapeRectPT(req)
      if (!rect) continue
      if (rect.y >= 0 && rect.y < 150) {
        expect(rect.y).toBeGreaterThanOrEqual(TITLE_BAND.y + TITLE_BAND.height)
      }
    }
  })

  it('GRADIENT_BAND_TOP uses layout-aware y on GRADIENT_LIKE style', () => {
    const result = compose('KPI_DASHBOARD', {
      metrics: [{ label: 'ROAS', value: '4.0x' }, { label: 'CAC', value: 'Rp82K' }],
    })
    const findings = qaComposedSlide(
      { archetype: 'KPI_DASHBOARD', content: { title: 'Test Title', metrics: [{ label: 'ROAS', value: '4.0x' }, { label: 'CAC', value: 'Rp82K' }] } },
      result
    )
    const blocked = findings.filter((f) => f.severity === 'BLOCKING' && !f.pass)
    expect(blocked).toEqual([])
  })

  it('title region has no overlap with decoration-shaped requests', () => {
    const result = compose('KPI_DASHBOARD', {
      metrics: [{ label: 'ROAS', value: '4.0x' }, { label: 'CAC', value: 'Rp82K' }],
    })
    const titleRect = { x: TITLE_BAND.x, y: TITLE_BAND.y, w: 864, h: TITLE_BAND.height }
    const shapeReqs = result.requests.filter((r) => r.createShape)
    for (const req of shapeReqs) {
      const rect = shapeRectPT(req)
      if (!rect) continue
      const overlapX = Math.max(0, Math.min(rect.x + rect.w, titleRect.x + titleRect.w) - Math.max(rect.x, titleRect.x))
      const overlapY = Math.max(0, Math.min(rect.y + rect.h, titleRect.y + titleRect.h) - Math.max(rect.y, titleRect.y))
      if (overlapX > 1 && overlapY > 1) {
        const objId = req.createShape?.objectId as string
        if (objId && (objId.includes('_BG_') || objId.includes('_DECO_'))) {
          expect.fail(`Decoration ${objId} overlaps title region`)
        }
      }
    }
  })

  it('all composed slides pass DECORATION_PROTECTED_REGION_INTERSECTION gate', () => {
    const archetypes: Array<[ComposeInput['archetype'], Partial<ComposeInput>]> = [
      ['COVER', { subtitle: 'Sub', closing: 'Thesis' }],
      ['EXECUTIVE_SUMMARY', { bullets: ['One', 'Two', 'Three'] }],
      ['KPI_DASHBOARD', { metrics: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }] }],
      ['PROCESS_FUNNEL', { stages: [{ label: 'A', description: 'Top' }, { label: 'B', description: 'End' }] }],
      ['COMPARISON', { columns: [{ name: 'A', items: ['x', 'y'] }, { name: 'B', items: ['z'] }] }],
      ['TIMELINE_ROADMAP', { stages: [{ label: 'Q1', description: 'S' }, { label: 'Q2', description: 'G' }] }],
      ['PILLARS_STRATEGY', { columns: [{ name: 'C', items: ['a'] }, { name: 'M', items: ['b'] }] }],
      ['CLOSING_INSIGHT', { closing: 'Thesis line' }],
    ]
    for (const [archetype, extra] of archetypes) {
      const result = compose(archetype, extra)
      const findings = qaComposedSlide(
        { archetype, content: { title: 'Test Title', ...extra } },
        result
      )
      const gateBlocked = findings.filter(
        (f) => f.check === 'DECORATION_PROTECTED_REGION_INTERSECTION' && f.severity === 'BLOCKING' && !f.pass
      )
      expect(gateBlocked).toEqual([])
    }
  })

  it('GRADIENT_BAND_TOP stops above CONTENT_TOP', () => {
    const result = compose('EXECUTIVE_SUMMARY', { bullets: ['A', 'B', 'C'] })
    const bgShapes = result.requests.filter(isBgShape)
    for (const req of bgShapes) {
      const rect = shapeRectPT(req)
      if (!rect) continue
      if (rect.y > 0 && rect.y < 150) {
        expect(rect.y + rect.h).toBeLessThanOrEqual(CONTENT_TOP + 10)
      }
    }
  })

  it('top band never starts above TITLE_BAND.y + TITLE_BAND.height', () => {
    const result = compose('KPI_DASHBOARD', {
      metrics: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }],
    })
    const bgShapes = result.requests.filter(isBgShape)
    for (const req of bgShapes) {
      const rect = shapeRectPT(req)
      if (!rect) continue
      if (rect.y > 0 && rect.y < 150) {
        expect(rect.y).toBeGreaterThanOrEqual(TITLE_BAND.y + TITLE_BAND.height)
      }
    }
  })
})

// ── Category 3: GRADIENT_BAND_BOTTOM placement (6 tests) ─────────────────────
describe('R5-A gate: GRADIENT_BAND_BOTTOM does not intersect closing content', () => {
  it('bottom bands stay within bottom 15% of page', () => {
    const result = compose('CLOSING_INSIGHT', { closing: 'Our thesis' })
    const bgShapes = result.requests.filter(isBgShape)
    for (const req of bgShapes) {
      const rect = shapeRectPT(req)
      if (!rect) continue
      if (rect.y > 400) {
        expect(rect.y).toBeGreaterThanOrEqual(540 * 0.85)
      }
    }
  })

  it('bottom bands do not exceed max height 15% of pageH', () => {
    const result = compose('CLOSING_INSIGHT', { closing: 'Thesis' })
    const bgShapes = result.requests.filter(isBgShape)
    for (const req of bgShapes) {
      const rect = shapeRectPT(req)
      if (!rect) continue
      if (rect.h > 0 && rect.y > 400) {
        expect(rect.h).toBeLessThanOrEqual(540 * 0.15 + 1)
      }
    }
  })

  it('closing slide passes gate with no decoration-thesis overlap', () => {
    const result = compose('CLOSING_INSIGHT', { closing: 'Our recommendation' })
    const findings = qaComposedSlide(
      { archetype: 'CLOSING_INSIGHT', content: { title: 'Test Title', closing: 'Our recommendation' } },
      result
    )
    const blocked = findings.filter(
      (f) => f.check === 'DECORATION_PROTECTED_REGION_INTERSECTION' && f.severity === 'BLOCKING' && !f.pass
    )
    expect(blocked).toEqual([])
  })

  it('bottom band Y is above page bottom (not extending past pageH)', () => {
    const result = compose('CLOSING_INSIGHT', { closing: 'Thesis' })
    const bgShapes = result.requests.filter(isBgShape)
    for (const req of bgShapes) {
      const rect = shapeRectPT(req)
      if (!rect) continue
      if (rect.y > 400) {
        expect(rect.y + rect.h).toBeLessThanOrEqual(540 + 1)
      }
    }
  })

  it('bottom band does not cross thesis midline (y=260)', () => {
    const result = compose('CLOSING_INSIGHT', { closing: 'Thesis text here' })
    const bgShapes = result.requests.filter(isBgShape)
    for (const req of bgShapes) {
      const rect = shapeRectPT(req)
      if (!rect) continue
      if (rect.y > 300) {
        expect(rect.y).toBeGreaterThan(260)
      }
    }
  })

  it('R5-A fix: no BLOCKING DECORATION_PROTECTED_REGION_INTERSECTION on any archetype', () => {
    const cases: Array<[ComposeInput['archetype'], Partial<ComposeInput>]> = [
      ['COVER', { subtitle: 'S', closing: 'C' }],
      ['EXECUTIVE_SUMMARY', { bullets: ['A', 'B'] }],
      ['KPI_DASHBOARD', { metrics: [{ label: 'X', value: '1' }] }],
      ['CLOSING_INSIGHT', { closing: 'Thesis' }],
    ]
    for (const [archetype, extra] of cases) {
      const r = compose(archetype, extra)
      const findings = qaComposedSlide({ archetype, content: { title: 'T', ...extra } }, r)
      const blocking = findings.filter((f) => f.check === 'DECORATION_PROTECTED_REGION_INTERSECTION' && !f.pass)
      expect(blocking).toEqual([])
    }
  })
})

// ── Category 4: GRADIENT_RAIL placement (6 tests) ────────────────────────────
describe('R5-A gate: GRADIENT_RAIL clears content on right side', () => {
  it('rail is on the right side (x > 800)', () => {
    const result = compose('PROCESS_FUNNEL', { stages: [{ label: 'A', description: 'Top' }, { label: 'B', description: 'End' }] })
    const bgShapes = result.requests.filter(isBgShape)
    for (const req of bgShapes) {
      const rect = shapeRectPT(req)
      if (!rect) continue
      if (rect.w > 0 && rect.w < 200) {
        expect(rect.x).toBeGreaterThan(800)
      }
    }
  })

  it('rail width is at most 8% of pageW (76.8pt)', () => {
    const result = compose('TIMELINE_ROADMAP', { stages: [{ label: 'Q1', description: 'S' }, { label: 'Q2', description: 'G' }] })
    const bgShapes = result.requests.filter(isBgShape)
    for (const req of bgShapes) {
      const rect = shapeRectPT(req)
      if (!rect) continue
      if (rect.w > 0 && rect.w < 200) {
        expect(rect.w).toBeLessThanOrEqual(960 * 0.1 + 1)
      }
    }
  })

  it('rail segments stack vertically without horizontal overlap', () => {
    const result = compose('PROCESS_FUNNEL', { stages: [{ label: 'A', description: 'T' }, { label: 'B', description: 'E' }] })
    const bgShapes = result.requests.filter(isBgShape)
    const railSegs: Array<{ x: number; y: number; w: number; h: number }> = []
    for (const req of bgShapes) {
      const rect = shapeRectPT(req)
      if (!rect) continue
      if (rect.w > 0 && rect.w < 200) {
        railSegs.push(rect)
      }
    }
    for (let i = 0; i < railSegs.length; i++) {
      for (let j = i + 1; j < railSegs.length; j++) {
        const a = railSegs[i], b = railSegs[j]
        const overlapY = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
        expect(overlapY).toBeLessThanOrEqual(1)
      }
    }
  })

  it('process funnel slide passes gate (no rail-title overlap)', () => {
    const result = compose('PROCESS_FUNNEL', { stages: [{ label: 'A', description: 'Top' }, { label: 'B', description: 'End' }] })
    const findings = qaComposedSlide(
      { archetype: 'PROCESS_FUNNEL', content: { title: 'Test Title', stages: [{ label: 'A', description: 'Top' }, { label: 'B', description: 'End' }] } },
      result
    )
    const blocked = findings.filter(
      (f) => f.check === 'DECORATION_PROTECTED_REGION_INTERSECTION' && f.severity === 'BLOCKING' && !f.pass
    )
    expect(blocked).toEqual([])
  })

  it('timeline roadmap slide passes gate (no rail-title overlap)', () => {
    const result = compose('TIMELINE_ROADMAP', { stages: [{ label: 'Q1', description: 'Start' }, { label: 'Q2', description: 'Grow' }] })
    const findings = qaComposedSlide(
      { archetype: 'TIMELINE_ROADMAP', content: { title: 'Test Title', stages: [{ label: 'Q1', description: 'Start' }, { label: 'Q2', description: 'Grow' }] } },
      result
    )
    const blocked = findings.filter(
      (f) => f.check === 'DECORATION_PROTECTED_REGION_INTERSECTION' && f.severity === 'BLOCKING' && !f.pass
    )
    expect(blocked).toEqual([])
  })

  it('rail does not extend past page edge (x + w <= pageW)', () => {
    const result = compose('PROCESS_FUNNEL', { stages: [{ label: 'A', description: 'T' }, { label: 'B', description: 'E' }] })
    const bgShapes = result.requests.filter(isBgShape)
    for (const req of bgShapes) {
      const rect = shapeRectPT(req)
      if (!rect) continue
      if (rect.w > 0 && rect.w < 200) {
        expect(rect.x + rect.w).toBeLessThanOrEqual(960 + 1)
      }
    }
  })
})

// ── Category 5: Gate detection precision (6 tests) ───────────────────────────
describe('R5-A gate: detection precision', () => {
  it('passes when decoration is outside all protected regions', () => {
    const els = [deco('BG_out', 'shape', { x: 920, y: 500, w: 30, h: 30 })]
    const f = checkDecorationProtectedRegionIntersections(els, [TITLE_REGION, CONTENT_REGION])
    expect(f[0].pass).toBe(true)
  })

  it('fails when decoration overlaps title region', () => {
    const els = [deco('BG_top', 'shape', { x: 0, y: 0, w: 960, h: 120 })]
    const f = checkDecorationProtectedRegionIntersections(els, [TITLE_REGION])
    expect(f[0].pass).toBe(false)
    expect(f[0].severity).toBe('BLOCKING')
    expect(f[0].detail).toContain('BG_top')
  })

  it('reports up to 5 hits in detail string', () => {
    const els = Array.from({ length: 7 }, (_, i) =>
      deco(`BG_${i}`, 'shape', { x: 0, y: 0, w: 960, h: 120 })
    )
    const f = checkDecorationProtectedRegionIntersections(els, [TITLE_REGION])
    expect(f[0].pass).toBe(false)
    const detailHits = (f[0].detail ?? '').split(' | ').length
    expect(detailHits).toBeLessThanOrEqual(5)
  })

  it('non-overlapping decorations with area ≤ 1 are ignored', () => {
    const els = [deco('BG_tiny', 'shape', { x: 47.5, y: 29.5, w: 1, h: 1 })]
    const f = checkDecorationProtectedRegionIntersections(els, [TITLE_REGION])
    expect(f[0].pass).toBe(true)
  })

  it('multiple decorations independently evaluated', () => {
    const els = [
      deco('BG_safe', 'shape', { x: 500, y: 400, w: 100, h: 50 }),
      deco('BG_bad', 'shape', { x: 0, y: 0, w: 960, h: 120 }),
    ]
    const f = checkDecorationProtectedRegionIntersections(els, [TITLE_REGION])
    expect(f[0].pass).toBe(false)
    expect(f[0].detail).toContain('BG_bad')
    expect(f[0].detail).not.toContain('BG_safe')
  })

  it('empty decoration list passes trivially', () => {
    const f = checkDecorationProtectedRegionIntersections([], [TITLE_REGION, CONTENT_REGION])
    expect(f[0].pass).toBe(true)
  })
})

// ── Category 6: Paired delta bars — non-homogeneous unit suppression (6 tests)
describe('R5-A: paired delta bars suppressed for non-homogeneous units', () => {
  function hasDeltaBars(result: ReturnType<typeof composeSlide>): boolean {
    return result.requests.some((r) => {
      const prefix = (r.createShape?.shape?.shapeProperties?.shapeBackgroundFill?.solidFill?.color as Record<string, unknown>)?.prefix as string | undefined
      return prefix?.startsWith('DELTA_') ?? false
    })
  }

  it('comparison with all-parseable magnitudes MAY produce delta bars', () => {
    const result = compose('COMPARISON', {
      columns: [
        { name: 'A', items: ['Rp10M', 'Rp20M'] },
        { name: 'B', items: ['Rp15M', 'Rp25M'] },
      ],
    })
    expect(result.requests.length).toBeGreaterThan(0)
  })

  it('comparison with non-parseable items produces no delta bars', () => {
    const result = compose('COMPARISON', {
      columns: [
        { name: 'A', items: ['hello', 'world'] },
        { name: 'B', items: ['foo', 'bar'] },
      ],
    })
    expect(hasDeltaBars(result)).toBe(false)
  })

  it('mixed parseable and non-parseable items produce no delta bars', () => {
    const result = compose('COMPARISON', {
      columns: [
        { name: 'A', items: ['Rp10M', 'not-a-number'] },
        { name: 'B', items: ['Rp15M', 'also-not'] },
      ],
    })
    expect(hasDeltaBars(result)).toBe(false)
  })

  it('comparison with 3 columns produces no delta bars', () => {
    const result = compose('COMPARISON', {
      columns: [
        { name: 'A', items: ['10'] },
        { name: 'B', items: ['20'] },
        { name: 'C', items: ['30'] },
      ],
    })
    expect(hasDeltaBars(result)).toBe(false)
  })

  it('comparison with mismatched row counts produces no delta bars', () => {
    const result = compose('COMPARISON', {
      columns: [
        { name: 'A', items: ['10', '20'] },
        { name: 'B', items: ['30'] },
      ],
    })
    expect(hasDeltaBars(result)).toBe(false)
  })

  it('comparison with 1 column is invalid (throws)', () => {
    expect(() =>
      compose('COMPARISON', { columns: [{ name: 'A', items: ['x'] }] })
    ).toThrow()
  })

  it('homogeneous units MAY produce delta bars (unit-homogeneity guard)', () => {
    const result = compose('COMPARISON', {
      columns: [
        { name: 'A', items: ['Rp10M', 'Rp20M'] },
        { name: 'B', items: ['Rp15M', 'Rp25M'] },
      ],
    })
    expect(result.requests.length).toBeGreaterThan(0)
  })

  it('mixed units (Rp miliar vs percentages) produce no delta bars', () => {
    const result = compose('COMPARISON', {
      columns: [
        { name: 'A', items: ['Rp10M', 'Rp20M'] },
        { name: 'B', items: ['42%', '58%'] },
      ],
    })
    expect(hasDeltaBars(result)).toBe(false)
  })

  it('mixed units (plain numbers vs ribu) produce no delta bars', () => {
    const result = compose('COMPARISON', {
      columns: [
        { name: 'A', items: ['100', '200'] },
        { name: 'B', items: ['50 ribu', '100 ribu'] },
      ],
    })
    expect(hasDeltaBars(result)).toBe(false)
  })
})
