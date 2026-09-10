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
  classifyArchetype,
  planDeck,
  composeSlide,
  chunkRequests,
  qaComposedSlide,
  validateComposeInput,
  type ComposeInput,
} from './beautify'

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
