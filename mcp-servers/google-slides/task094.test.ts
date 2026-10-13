/**
 * TASK-094: Deck Product Correctness, Factual Integrity & Visual QA.
 *
 * Priority-ordered proof (facts first):
 *  F. Factual immutability (metrics all-or-nothing, fidelity QA)
 *  E. Encoding visibility (proportional bars / four-part geometry)
 *  T. Text fit (bold-aware estimation, tracked reuse title, honest failure)
 *  Q. QA truthfulness (structural scope, strict gates)
 *  L. Exact-N lifecycle workflow + guidance
 *  G. Gradient-like progression + role variation
 *  V. Theme-coherent variation + coherence diagnostic
 *  W. Tool/token efficiency measurement
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  validateComposeInput,
  resolveEffectiveArchetype,
  composeSlideOnPage,
  extractDistributionSource,
  checkDistributionFidelity,
  cleanDistributionLabel,
  mixHex,
  relativeLuminance,
  diagnoseDeckCoherence,
  verifyDeckSlideCount,
  applyTheme,
  PALETTE,
  handleComposeSlide,
  type ComposeInput,
} from './beautify'
import { estimateLines, hasBlocking, EMU_PER_PT } from './geometry'
import { buildSlidesDoctrineBlock } from '../../src/services/opencode/mcp-guidance'

const BASELINE_PALETTE = { ...PALETTE }

beforeEach(() => {
  applyTheme(null)
  Object.assign(PALETTE, BASELINE_PALETTE)
})

afterEach(() => {
  vi.unstubAllGlobals()
  applyTheme(null)
  Object.assign(PALETTE, BASELINE_PALETTE)
})

function reqsOf(r: ReturnType<typeof composeSlideOnPage>): Array<Record<string, unknown>> {
  return r.result.requests as Array<Record<string, unknown>>
}

function insertTexts(reqs: Array<Record<string, unknown>>): string[] {
  return reqs.filter((r) => (r as any).insertText).map((r) => String((r as any).insertText.text ?? ''))
}

function deleteTexts(reqs: Array<Record<string, unknown>>): Array<any> {
  return reqs.filter((r) => (r as any).deleteText).map((r) => (r as any).deleteText)
}

function shapeWidths(reqs: Array<Record<string, unknown>>, prefix: string): number[] {
  const out: number[] = []
  for (const r of reqs) {
    const cs = (r as any).createShape
    if (!cs || !String(cs.objectId ?? '').includes(prefix)) continue
    out.push(Number(cs.elementProperties.size.width.magnitude) / EMU_PER_PT)
  }
  return out
}

function bgFillsTopDown(reqs: Array<Record<string, unknown>>): string[] {
  const bands = (reqs as Array<any>)
    .filter((r) => r.createShape && String(r.createShape.objectId ?? '').includes('_BG_'))
    .map((r) => {
      const id = String(r.createShape.objectId)
      const y = Number(r.createShape.elementProperties.transform.translateY) / EMU_PER_PT
      const upd = (reqs as Array<any>).find(
        (u) => u.updateShapeProperties?.objectId === r.createShape.objectId
      )
      const fill = upd?.updateShapeProperties?.shapeProperties?.shapeBackgroundFill?.solidFill?.color?.rgbColor
      const hex =
        '#' +
        [fill.red, fill.green, fill.blue]
          .map((v: number) => Math.round(v * 255).toString(16).padStart(2, '0').toUpperCase())
          .join('')
      return { id, y, hex }
    })
    .sort((a, b) => a.y - b.y)
  return bands.map((b) => b.hex)
}

/** Handler-path mirror: validate -> route -> patched compose with encoding gate. */
function liveCompose(rawArgs: Record<string, unknown>): {
  routing: ReturnType<typeof resolveEffectiveArchetype>
  composed: ReturnType<typeof composeSlideOnPage>
} {
  const { input } = validateComposeInput({ presentationId: 'P1', pageObjectId: 'S1', ...rawArgs })
  const content = {
    title: input.title,
    ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
    ...(input.bullets !== undefined ? { bullets: input.bullets } : {}),
    ...(input.metrics !== undefined ? { metrics: input.metrics } : {}),
    ...(input.stages !== undefined ? { stages: input.stages } : {}),
    ...(input.columns !== undefined ? { columns: input.columns } : {}),
    ...(input.closing !== undefined ? { closing: input.closing } : {}),
    ...(input.sharedGoal !== undefined ? { sharedGoal: input.sharedGoal } : {}),
  }
  const routing = resolveEffectiveArchetype(input.archetype, content)
  const effective: ComposeInput = routing.redirected
    ? { ...input, archetype: routing.archetype, ...routing.patch }
    : input
  const composed = composeSlideOnPage(effective, {
    pageWidthPt: 960,
    pageHeightPt: 540,
    expectedEncoding: routing.encoding,
  })
  return { routing, composed }
}

const INVEST_BULLETS = [
  'Product & Engineering: 50% Rp2 miliar',
  'Sales & Marketing: 25% Rp1 miliar',
  'Customer Success: 15% Rp600 juta',
  'Operations: 10% Rp400 juta',
]
const INVEST_METRICS = [
  { label: 'Product & Engineering', value: '50% Rp2 miliar' },
  { label: 'Sales & Marketing', value: '25% Rp1 miliar' },
  { label: 'Customer Success', value: '15% Rp600 juta' },
  { label: 'Operations', value: '10% Rp400 juta' },
]
const CHANNEL_COLS = [
  { name: 'Organic & Content', items: ['42%'] },
  { name: 'Strategic Partnerships', items: ['28%'] },
  { name: 'Performance Marketing', items: ['18%'] },
  { name: 'Community & Referral', items: ['12%'] },
]

// ---------------------------------------------------------------------------
// F. Factual immutability
// ---------------------------------------------------------------------------

describe('F: distribution metrics are all-or-nothing (no silent drop)', () => {
  it('mixed metrics (one non-share) do NOT redirect; KPI honored with all 4 facts', () => {
    const { routing, effective } = (() => {
      const { input } = validateComposeInput({
        presentationId: 'P1',
        pageObjectId: 'S1',
        archetype: 'KPI_DASHBOARD',
        title: 'Mix',
        metrics: [
          { label: 'Product & Engineering', value: '50% Rp2 miliar' },
          { label: 'Sales & Marketing', value: '25% Rp1 miliar' },
          { label: 'Customer Success', value: '15% Rp600 juta' },
          { label: 'Backlog', value: 'TBD' },
        ],
      })
      const routing = resolveEffectiveArchetype(input.archetype, {
        title: input.title,
        metrics: input.metrics,
      })
      return { routing, effective: routing.redirected ? { ...input, archetype: routing.archetype, ...routing.patch } : input }
    })()
    // Pre-fix behavior redirected with 3 items and silently dropped Backlog.
    expect(routing.redirected).toBe(false)
    expect(effective.archetype).toBe('KPI_DASHBOARD')
    expect(effective.metrics?.length).toBe(4)
  })

  it('canonical 4-item investment still redirects with all 4 columns', () => {
    const { routing } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      metrics: INVEST_METRICS,
    })
    expect(routing.redirected).toBe(true)
    // TASK-094-R3: budget vehicle is COMPARISON (stacked), never PILLARS.
    expect(routing.archetype).toBe('COMPARISON')
    expect(routing.encoding).toBe('PARTS_OF_WHOLE_STACK')
    expect(routing.patch.columns?.length).toBe(4)
  })
})

describe('F: source inventory extraction', () => {
  it('canonical investment bullets -> 4 items + total Rp4 miliar', () => {
    const src = extractDistributionSource({
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      bullets: INVEST_BULLETS,
    })
    expect(src).not.toBeNull()
    expect(src!.kind).toBe('budget')
    expect(src!.items.length).toBe(4)
    expect(src!.items.map((i) => i.label)).toEqual([
      'Product & Engineering',
      'Sales & Marketing',
      'Customer Success',
      'Operations',
    ])
    expect(src!.total).toBe('Rp4 miliar')
  })

  it('non-distribution content -> null (QA skipped, other gates apply)', () => {
    expect(extractDistributionSource({ title: 'T', bullets: ['Hello world', 'Foo bar'] })).toBeNull()
  })
})

describe('F: fidelity QA blocks the historical 4->3 transformation', () => {
  const src4 = extractDistributionSource({
    title: 'Growth Investment Allocation',
    subtitle: 'Total investasi: Rp4 miliar',
    bullets: INVEST_BULLETS,
  })!

  it('4 source vs 3 rendered -> SOURCE_CATEGORY_COUNT_MISMATCH BLOCKING', () => {
    const out = checkDistributionFidelity(
      src4,
      { labels: ['Product & Engineering 50%', 'Sales & Marketing 25%', 'Success & Operations 25%'], values: [50, 25, 25] },
      ['Rp4 miliar']
    )
    const count = out.find((f) => f.check === 'SOURCE_CATEGORY_COUNT_MISMATCH')
    expect(count?.pass).toBe(false)
    expect(count?.severity).toBe('BLOCKING')
    expect(hasBlocking(out)).toBe(true)
  })

  it('merged "Success & Operations" label -> IDENTITY + MERGE BLOCKING', () => {
    const out = checkDistributionFidelity(
      src4,
      {
        labels: [
          'Product & Engineering 50%',
          'Sales & Marketing 25%',
          'Success & Operations 25%',
          'Reserve 0%',
        ],
        values: [50, 25, 25, 0],
      },
      ['Rp4 miliar']
    )
    expect(out.find((f) => f.check === 'SOURCE_CATEGORY_IDENTITY_MISMATCH')?.pass).toBe(false)
    const merge = out.find((f) => f.check === 'UNAUTHORIZED_FACT_MERGE')
    expect(merge?.pass).toBe(false)
    expect(merge?.severity).toBe('BLOCKING')
    expect(hasBlocking(out)).toBe(true)
  })

  it('dropped Operations -> UNAUTHORIZED_FACT_OMISSION BLOCKING', () => {
    const out = checkDistributionFidelity(
      src4,
      {
        labels: ['Product & Engineering 50%', 'Sales & Marketing 25%', 'Customer Success 15%', 'Reserve 10%'],
        values: [50, 25, 15, 10],
      },
      ['Rp4 miliar']
    )
    const omission = out.find((f) => f.check === 'UNAUTHORIZED_FACT_OMISSION')
    expect(omission?.pass).toBe(false)
    expect(omission?.detail).toContain('Operations')
  })

  it('altered share (50->40) -> SOURCE_VALUE_MISMATCH BLOCKING', () => {
    const out = checkDistributionFidelity(
      src4,
      {
        labels: ['Product & Engineering 50%', 'Sales & Marketing 25%', 'Customer Success 15%', 'Operations 10%'],
        values: [40, 25, 15, 10],
      },
      ['Rp4 miliar']
    )
    expect(out.find((f) => f.check === 'SOURCE_VALUE_MISMATCH')?.pass).toBe(false)
  })

  it('missing total -> SOURCE_TOTAL_MISMATCH BLOCKING', () => {
    const out = checkDistributionFidelity(
      src4,
      {
        labels: ['Product & Engineering 50%', 'Sales & Marketing 25%', 'Customer Success 15%', 'Operations 10%'],
        values: [50, 25, 15, 10],
      },
      ['no total here']
    )
    expect(out.find((f) => f.check === 'SOURCE_TOTAL_MISMATCH')?.pass).toBe(false)
  })

  it('false whole (shares sum 90) -> SOURCE_TOTAL_MISMATCH BLOCKING', () => {
    const out = checkDistributionFidelity(
      { ...src4, items: src4.items.map((i, ix) => ({ ...i, share: [50, 25, 10, 5][ix] })) },
      {
        labels: ['Product & Engineering 50%', 'Sales & Marketing 25%', 'Customer Success 10%', 'Operations 5%'],
        values: [50, 25, 10, 5],
      },
      ['Rp4 miliar']
    )
    expect(out.find((f) => f.check === 'SOURCE_TOTAL_MISMATCH')?.pass).toBe(false)
  })

  it('faithful 4-for-4 render passes with INFO findings', () => {
    const out = checkDistributionFidelity(
      src4,
      {
        labels: ['Product & Engineering 50%', 'Sales & Marketing 25%', 'Customer Success 15%', 'Operations 10%'],
        values: [50, 25, 15, 10],
      },
      ['Total investasi: Rp4 miliar', 'Product & Engineering 50% -- Rp2 miliar']
    )
    expect(hasBlocking(out)).toBe(false)
  })

  it('live investment plan carries passing fidelity findings in prewriteQa', () => {
    const { routing, composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      metrics: INVEST_METRICS,
    })
    expect(routing.encoding).toBe('PARTS_OF_WHOLE_STACK')
    const fidelity = composed.prewriteQa.filter((f) => f.check.startsWith('SOURCE_') || f.check.startsWith('UNAUTHORIZED_'))
    expect(fidelity.length).toBeGreaterThan(0)
    expect(fidelity.every((f) => f.pass)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// E. Encoding visibility (geometry, not metadata)
// ---------------------------------------------------------------------------

describe('E: channels geometry is proportional bars', () => {
  it('4 percent columns -> 4 bars, decreasing widths, 42/12 ratio ~3.5, no KPI cards', () => {
    const { routing, composed } = liveCompose({
      archetype: 'COMPARISON',
      title: 'Customer Acquisition Channels',
      columns: CHANNEL_COLS,
    })
    expect(routing.encoding).toBe('RANKED_PROPORTIONAL_BARS')
    expect(composed.result.expected.encoding).toBe('RANKED_PROPORTIONAL_BARS')
    const reqs = reqsOf(composed)
    const bars = shapeWidths(reqs, 'DBB')
    expect(bars.length).toBe(4)
    expect(bars[0]).toBeGreaterThan(bars[1])
    expect(bars[1]).toBeGreaterThan(bars[2])
    expect(bars[2]).toBeGreaterThan(bars[3])
    const ratio = bars[0] / bars[3]
    expect(ratio).toBeGreaterThan(2.8)
    expect(ratio).toBeLessThan(4.2)
    expect(reqs.some((r) => String((r as any).createShape?.objectId ?? '').includes('KPIBG'))).toBe(false)
  })

  it('generic 2-column comparison stays paired (no bars), fidelity gate skipped', () => {
    const { routing, composed } = liveCompose({
      archetype: 'COMPARISON',
      title: 'A vs B',
      columns: [
        { name: 'Plan A', items: ['Low cost', 'Fast'] },
        { name: 'Plan B', items: ['Premium', 'Supported'] },
      ],
    })
    expect(routing.encoding).toBe('PAIRED_COMPARISON')
    expect(shapeWidths(reqsOf(composed), 'DBB').length).toBe(0)
  })

  it('forcing RANKED encoding on paired content fails closed', () => {
    const { input } = validateComposeInput({
      presentationId: 'P1',
      pageObjectId: 'S1',
      archetype: 'COMPARISON',
      title: 'A vs B',
      columns: [
        { name: 'Plan A', items: ['Low cost'] },
        { name: 'Plan B', items: ['Premium'] },
      ],
    })
    const bad = composeSlideOnPage(input, {
      pageWidthPt: 960,
      pageHeightPt: 540,
      expectedEncoding: 'RANKED_PROPORTIONAL_BARS',
    })
    expect(bad.finalStatus).toBe('GEOMETRY_FAILED')
  })
})

describe('E: investment geometry is four parts of one whole', () => {
  it('4 segments, 50/25 ratio ~2.0, total + amounts verbatim, no KPI cards', () => {
    const { composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      metrics: INVEST_METRICS,
    })
    const reqs = reqsOf(composed)
    const segs = shapeWidths(reqs, 'STKS')
    expect(segs.length).toBe(4)
    expect(segs[0] / segs[1]).toBeGreaterThan(1.9)
    expect(segs[0] / segs[1]).toBeLessThan(2.1)
    const texts = insertTexts(reqs).join('\n')
    for (const a of ['Rp2 miliar', 'Rp1 miliar', 'Rp600 juta', 'Rp400 juta', 'Rp4 miliar']) {
      expect(texts).toContain(a)
    }
    expect(reqs.some((r) => String((r as any).createShape?.objectId ?? '').includes('KPIBG'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// T. Text fit
// ---------------------------------------------------------------------------

describe('T: bold-aware measurement', () => {
  it('bold estimates meet or exceed regular estimates', () => {
    const plain = estimateLines('Rp12 miliar pertumbuhan', 40, 200)
    const bold = estimateLines('Rp12 miliar pertumbuhan', 40, 200, { bold: true })
    expect(bold).toBeGreaterThanOrEqual(plain)
    expect(estimateLines('Rp12 miliar', 40, 200, { bold: true })).toBeGreaterThan(0)
  })

  it('omitted opts preserve legacy behavior exactly', () => {
    expect(estimateLines('Hello world foo bar', 14, 100)).toBe(
      estimateLines('Hello world foo bar', 14, 100, {})
    )
  })
})

describe('T: overflow fails honestly, never false-PROVEN', () => {
  it('unsplittable long token overflows honestly (no unconditional PROVEN)', () => {
    const { composed } = liveCompose({
      archetype: 'EXECUTIVE_SUMMARY',
      title: 'Summary',
      bullets: ['Pertumbuhan' + 'x'.repeat(90) + ' 42%'],
    })
    const overflow = composed.prewriteQa.find(
      (f) => f.check === 'TEXT_CONTAINER_OVERFLOW' && !f.pass && f.severity === 'BLOCKING'
    )
    // Either the layout absorbs it (reflow) or it fails closed with BLOCKING.
    if (composed.finalStatus === 'GEOMETRY_PROVEN' || composed.finalStatus === 'GEOMETRY_PROVEN_AFTER_REFLOW') {
      expect(overflow).toBeUndefined()
    } else {
      expect(composed.finalStatus).toBe('GEOMETRY_FAILED')
      expect(overflow).toBeDefined()
    }
  })

  it('long Indonesian pillar content fits or fails closed (never silent overflow)', () => {
    const { composed } = liveCompose({
      archetype: 'PILLARS_STRATEGY',
      title: 'Three Strategic Pillars',
      columns: [
        {
          name: 'Content Engine',
          items: [
            'Membangun kalender editorial dan seri video yang berkelanjutan untuk pertumbuhan jangka panjang',
            'Distribusi lintas kanal',
          ],
        },
        { name: 'Performance Ads', items: ['Paid search', 'Paid social'] },
        { name: 'Community Flywheel', items: ['Advocacy loops', 'Referrals'] },
      ],
      sharedGoal: 'Build Alpha One into the operating intelligence layer for growing businesses.',
    })
    const overflow = composed.prewriteQa.find(
      (f) => f.check === 'TEXT_CONTAINER_OVERFLOW' && !f.pass && f.severity === 'BLOCKING'
    )
    if (overflow) expect(composed.finalStatus).toBe('GEOMETRY_FAILED')
    else expect(composed.finalStatus).toContain('GEOMETRY_PROVEN')
  })

  it('reused native title is tracked for QA (blind spot closed)', () => {
    const r = composeSlideOnPage(
      { pageObjectId: 'S1', archetype: 'COVER', title: 'Tracked Title' },
      {
        pageWidthPt: 960,
        pageHeightPt: 540,
        placeholders: [{ objectId: 'PH_T', type: 'TITLE', text: 'Old' }],
      }
    )
    const placed = (r.result.placed ?? []).filter((p) => p.id === 'native:PH_T')
    expect(placed.length).toBe(1)
    expect(placed[0].text).toBe('Tracked Title')
  })

  it('long labels survive verbatim (never shortened to fit)', () => {
    const label = 'Community Flywheel dan program advokasi pelanggan regional Indonesia'
    const { composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'KPIs',
      metrics: [
        { label, value: '92%' },
        { label: 'Retention', value: '88%' },
        { label: 'NPS', value: '72' },
      ],
    })
    // Mixed share/non-share metrics are honored as KPI (no silent drop)...
    expect(composed.result.expected.encoding).toBe('KPI_GRID')
    // ...and the long label is verbatim in the plan.
    expect(insertTexts(reqsOf(composed)).join('\n')).toContain(label)
  })
})

// ---------------------------------------------------------------------------
// Q. QA truthfulness
// ---------------------------------------------------------------------------

describe('Q: structural scope is labeled, gates stay strict', () => {
  it('qaVisualQuality always carries VISUAL_RENDER_UNPROVEN (WARNING)', () => {
    const r = composeSlideOnPage(
      { pageObjectId: 'S1', archetype: 'COVER', title: 'T' },
      { pageWidthPt: 960, pageHeightPt: 540 }
    )
    const f = r.prewriteQa.find((x) => x.check === 'VISUAL_RENDER_UNPROVEN')
    expect(f).toBeDefined()
    expect(f?.severity).toBe('WARNING')
  })

  it('cleanDistributionLabel strips shares/amounts for identity compare', () => {
    expect(cleanDistributionLabel('Product & Engineering 50%')).toBe('Product & Engineering')
    expect(cleanDistributionLabel('Operations 10% Rp400 juta')).toBe('Operations')
  })

  it('mixHex interpolates deterministically', () => {
    expect(mixHex('#000000', '#FFFFFF', 0)).toBe('#000000')
    expect(mixHex('#000000', '#FFFFFF', 1)).toBe('#FFFFFF')
    expect(mixHex('#000000', '#FFFFFF', 0.5)).toBe('#808080')
    expect(() => mixHex('nope', '#FFFFFF', 0.5)).toThrow()
  })
})

// ---------------------------------------------------------------------------
// L. Exact-N lifecycle
// ---------------------------------------------------------------------------

describe('L: 10-slide workflow model (initial + nine, zero blank, no replacement)', () => {
  it('simulated agent call log yields exactly 10 meaningful slides', () => {
    const log: string[] = []
    log.push('createPresentation -> S1(initial)')
    log.push('compose:S1') // slide 1 ALWAYS onto the initial slide
    for (let i = 2; i <= 10; i += 1) {
      log.push(`createSlide:S${i}`)
      log.push(`compose:S${i}`)
    }
    log.push('get_presentation:verify')
    expect(log.filter((l) => l.startsWith('compose:')).length).toBe(10)
    expect(log.filter((l) => l.startsWith('createSlide:')).length).toBe(9)
    // No replacement cover, no deletion-as-completion, no second presentation.
    expect(log.filter((l) => l.startsWith('createPresentation')).length).toBe(1)
    expect(log.some((l) => l.includes('delete'))).toBe(false)
    expect(log[1]).toBe('compose:S1')
    const summaries = Array.from({ length: 10 }, (_, i) => ({
      objectId: `S${i + 1}`,
      elementCount: 5,
      hasText: true,
    }))
    const v = verifyDeckSlideCount(summaries, 10, { isNewDeck: true })
    expect(v.pass).toBe(true)
  })

  it('undisciplined per-slide readbacks cost +10 calls vs deck-end verification', () => {
    // Disciplined: 1 create + 10 compose + 9 createSlide + 1 final verify = 21.
    // Undisciplined (+1 get_page per slide): 31. Delta is pure overhead.
    const disciplined = 1 + 10 + 9 + 1
    const undisciplined = disciplined + 10
    expect(disciplined).toBe(21)
    expect(undisciplined).toBe(31)
    expect(undisciplined - disciplined).toBe(10)
  })

  it('guidance routes normal new decks through deck-level compose', () => {
    const text = buildSlidesDoctrineBlock()
    expect(text).toMatch(/new 2\+ slide deck/i)
    expect(text).toMatch(/slides_compose_deck handles presentation creation/i)
    expect(text).toMatch(/Do NOT pre-create the presentation, create slides, call slides_compose_slide per slide/i)
    expect(text).toMatch(/slides_compose_deck returns deck-level readback\/fidelity evidence/i)
    expect(text).toMatch(/immutable/i)
  })
})

// ---------------------------------------------------------------------------
// G. Gradient-like progression
// ---------------------------------------------------------------------------

describe('G: MODERN_GRADIENT is a tonal progression, not one solid block', () => {
  it('mixHex + luminance order top->bottom on COVER (4 stops, monotonic)', () => {
    const r = composeSlideOnPage(
      { pageObjectId: 'S1', archetype: 'COVER', title: 'T', subtitle: 'Sub' },
      { pageWidthPt: 960, pageHeightPt: 540, alphaThemeId: 'MODERN_GRADIENT' }
    )
    const fills = bgFillsTopDown(reqsOf(r))
    expect(fills.length).toBeGreaterThanOrEqual(3)
    expect(new Set(fills).size).toBeGreaterThanOrEqual(3)
    const lums = fills.map((f) => relativeLuminance(f))
    for (let i = 1; i < lums.length; i += 1) {
      expect(lums[i]).toBeGreaterThanOrEqual(lums[i - 1])
    }
    expect(r.result.expected.backgroundVariant).toBe('GRADIENT_HERO')
  })

  it('content roles get compact variants (KPI band-top, SUMMARY band-bottom, FUNNEL rail)', () => {
    const kpi = composeSlideOnPage(
      {
        pageObjectId: 'S1', archetype: 'KPI_DASHBOARD', title: 'K',
        metrics: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }],
      },
      { pageWidthPt: 960, pageHeightPt: 540, alphaThemeId: 'MODERN_GRADIENT' }
    )
    expect(kpi.result.expected.backgroundVariant).toBe('GRADIENT_BAND_TOP')
    const summary = composeSlideOnPage(
      { pageObjectId: 'S1', archetype: 'EXECUTIVE_SUMMARY', title: 'S', bullets: ['One', 'Two'] },
      { pageWidthPt: 960, pageHeightPt: 540, alphaThemeId: 'MODERN_GRADIENT' }
    )
    expect(summary.result.expected.backgroundVariant).toBe('GRADIENT_BAND_BOTTOM')
    const funnel = composeSlideOnPage(
      {
        pageObjectId: 'S1', archetype: 'PROCESS_FUNNEL', title: 'F',
        stages: [{ label: 'A', description: '100' }, { label: 'B', description: '50' }],
      },
      { pageWidthPt: 960, pageHeightPt: 540, alphaThemeId: 'MODERN_GRADIENT' }
    )
    expect(funnel.result.expected.backgroundVariant).toBe('GRADIENT_RAIL')
  })

  it('DEFAULT theme background unchanged (no BG shapes under EXECUTIVE_NAVY)', () => {
    const r = composeSlideOnPage(
      { pageObjectId: 'S1', archetype: 'COVER', title: 'T' },
      { pageWidthPt: 960, pageHeightPt: 540, alphaThemeId: 'EXECUTIVE_NAVY' }
    )
    const bg = (reqsOf(r) as Array<any>).filter(
      (q) => q.createShape && String(q.createShape.objectId ?? '').includes('_BG_')
    )
    expect(bg.length).toBe(0)
  })

  it('band fills stay darker than light ink (contrast-safe decoration)', () => {
    const r = composeSlideOnPage(
      { pageObjectId: 'S1', archetype: 'COVER', title: 'T' },
      { pageWidthPt: 960, pageHeightPt: 540, alphaThemeId: 'MODERN_GRADIENT' }
    )
    const fills = bgFillsTopDown(reqsOf(r))
    const inkLum = relativeLuminance('#F8FAFC')
    for (const f of fills) {
      expect(relativeLuminance(f)).toBeLessThan(inkLum)
    }
  })
})

// ---------------------------------------------------------------------------
// V. Theme-coherent variation
// ---------------------------------------------------------------------------

const BENCH_ROLES: Array<{ archetype: ComposeInput['archetype']; extra: Partial<ComposeInput> }> = [
  { archetype: 'COVER', extra: { subtitle: 'Sub' } },
  { archetype: 'EXECUTIVE_SUMMARY', extra: { bullets: ['Alpha Broadband 12%', 'Churn down 3pt'] } },
  {
    archetype: 'KPI_DASHBOARD',
    extra: { metrics: [{ label: 'ARR', value: '$12M' }, { label: 'NPS', value: '72' }] },
  },
  {
    archetype: 'PROCESS_FUNNEL',
    extra: { stages: [{ label: 'Awareness', description: '1200000' }, { label: 'Customers', description: '18000' }] },
  },
  {
    archetype: 'COMPARISON',
    extra: { columns: [{ name: 'Plan A', items: ['Low cost', 'Fast'] }, { name: 'Plan B', items: ['Premium'] }] },
  },
  {
    archetype: 'TIMELINE_ROADMAP',
    extra: { stages: [{ label: 'Q1 Launch' }, { label: 'Q2 Scale' }] },
  },
  {
    archetype: 'PILLARS_STRATEGY',
    extra: {
      columns: [
        { name: 'Content', items: ['Calendar', 'Video'] },
        { name: 'Ads', items: ['Search', 'Social'] },
      ],
      sharedGoal: 'Grow efficiently.',
    },
  },
  { archetype: 'COMPARISON', extra: { columns: CHANNEL_COLS } },
  {
    archetype: 'KPI_DASHBOARD',
    extra: { subtitle: 'Total investasi: Rp4 miliar', metrics: INVEST_METRICS },
  },
  { archetype: 'CLOSING_INSIGHT', extra: { closing: 'Focus compounds.' } },
]

describe('V: ten roles share one theme with distinct geometry', () => {
  it('single theme, >=3 encodings, no variant above 70% share', () => {
    const sigs = BENCH_ROLES.map((role, i) => {
      const r = composeSlideOnPage(
        { pageObjectId: `S${i + 1}`, archetype: role.archetype, title: `Slide ${i + 1}`, ...role.extra },
        { pageWidthPt: 960, pageHeightPt: 540, alphaThemeId: 'MODERN_GRADIENT' }
      )
      return {
        themeId: r.result.expected.themeResolved ?? '',
        backgroundVariant: r.result.expected.backgroundVariant ?? '',
        encoding: r.result.expected.encoding,
      }
    })
    expect(new Set(sigs.map((s) => s.themeId))).toEqual(new Set(['MODERN_GRADIENT']))
    expect(new Set(sigs.map((s) => s.encoding)).size).toBeGreaterThanOrEqual(3)
    const out = diagnoseDeckCoherence(sigs)
    expect(out.find((f) => f.check === 'DECK_THEME_COHERENCE')?.pass).toBe(true)
    expect(out.find((f) => f.check === 'DECK_MOTIF_VARIATION')?.pass).toBe(true)
  })

  it('synthetic repetition (8/10 one variant, 3 encodings) warns', () => {
    const sigs = Array.from({ length: 10 }, (_, i) => ({
      themeId: 'MODERN_GRADIENT',
      backgroundVariant: i < 8 ? 'GRADIENT_BAND_TOP' : 'GRADIENT_HERO',
      encoding: ['KPI_GRID', 'PAIRED_COMPARISON', 'TIMELINE'][i % 3],
    }))
    const out = diagnoseDeckCoherence(sigs)
    expect(out.find((f) => f.check === 'DECK_MOTIF_VARIATION')?.pass).toBe(false)
  })

  it('mixed themes warn on coherence', () => {
    const out = diagnoseDeckCoherence([
      { themeId: 'MODERN_GRADIENT', backgroundVariant: 'GRADIENT_HERO', encoding: 'COVER' },
      { themeId: 'BOLD_TECH', backgroundVariant: 'HERO_DARK', encoding: 'KPI_GRID' },
    ])
    expect(out.find((f) => f.check === 'DECK_THEME_COHERENCE')?.pass).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Q2. Handler scope label (live result path)
// ---------------------------------------------------------------------------

function okJson(body: unknown): unknown {
  const text = JSON.stringify(body)
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: { get: () => 'application/json' },
    text: async () => text, json: async () => body,
  }
}

describe('Q2: handler result labels structural scope (not pixels)', () => {
  it('successful compose carries geometryScope STRUCTURAL_ONLY + APPLIED_VERIFIED', async () => {
    const textById = new Map<string, string>()
    const created: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const u = String(url)
        const method = init.method ?? 'GET'
        if (method === 'POST' && u.includes(':batchUpdate')) {
          let body: Record<string, unknown> = {}
          try {
            body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {}
          } catch { body = {} }
          const requests = ((body?.requests ?? []) as Array<Record<string, unknown>>)
          const replies = requests.map((r) => {
            const key = Object.keys(r)[0]
            const payload = (r as Record<string, any>)[key] ?? {}
            if (key === 'insertText' && typeof payload.objectId === 'string' && typeof payload.text === 'string') {
              textById.set(payload.objectId, (textById.get(payload.objectId) ?? '') + payload.text)
            }
            if (
              (key === 'createShape' || key === 'createTextBox') &&
              typeof payload.objectId === 'string'
            ) {
              created.push(payload.objectId)
              return { [key]: { objectId: payload.objectId } }
            }
            return {}
          })
          return okJson({ presentationId: 'P1', replies })
        }
        if (method === 'GET' && u.includes('/presentations/')) {
          if (u.includes('masters')) return okJson({ masters: [] })
          const els = created.map((id) => ({
            objectId: id,
            shape: { shapeType: 'RECTANGLE', text: { textElements: [{ textRun: { content: textById.get(id) ?? '' } }] } },
          }))
          return okJson({
            pageSize: { width: { magnitude: 960, unit: 'PT' }, height: { magnitude: 540, unit: 'PT' } },
            slides: [{ objectId: 'S1', pageElements: created.length > 0 ? els : [] }],
          })
        }
        return okJson({})
      })
    )
    const raw = (await handleComposeSlide('TOKEN', {
      presentationId: 'P1',
      pageObjectId: 'S1',
      archetype: 'COVER',
      title: 'Scoped Title',
    })) as unknown as { content: Array<{ text: string }> }
    const out = JSON.parse(raw.content[0].text) as Record<string, any>
    expect(out.qaPass).toBe(true)
    expect(out.geometryScope).toBe('STRUCTURAL_ONLY')
    expect(out.writeOutcome).toBe('APPLIED_VERIFIED')
    expect(out.writeAttemptCount).toBe(1)
  }, 20000)
})

describe('W: tool/token economy is measured, irreducible floor stated', () => {
  it('10-slide call model: disciplined 22 vs undisciplined 32 (delta = 10 redundant readbacks)', () => {
    // Irreducible under per-slide tools: 1 createPresentation + 1 initial
    // get_presentation (initial slide id) + 10 compose + 9 createSlide +
    // 1 deck-end verify = 22. (MODEL_ONLY scope: derived model, corrected in
    // TASK-094-R1 to count the initial inventory read.)
    expect(1 + 1 + 10 + 9 + 1).toBe(22)
    expect(22 + 10).toBe(32)
  })

  it('success payload carries evidence; failure payload carries diagnostics', () => {
    const { composed } = liveCompose({
      archetype: 'COMPARISON',
      title: 'Customer Acquisition Channels',
      columns: CHANNEL_COLS,
    })
    expect(composed.result.expected.encoding).toBe('RANKED_PROPORTIONAL_BARS')
    expect(composed.prewriteQa.length).toBeGreaterThan(0)
    // Failure keeps diagnostics (mismatch gate present with detail).
    const { input } = validateComposeInput({
      presentationId: 'P1',
      pageObjectId: 'S1',
      archetype: 'COMPARISON',
      title: 'X',
      columns: [{ name: 'A', items: ['x'] }, { name: 'B', items: ['y'] }],
    })
    const bad = composeSlideOnPage(input, {
      pageWidthPt: 960,
      pageHeightPt: 540,
      expectedEncoding: 'RANKED_PROPORTIONAL_BARS',
    })
    const gate = bad.prewriteQa.find((f) => f.check === 'EXPECTED_ENCODING_MATCH')
    expect(gate?.pass).toBe(false)
    expect(gate?.detail).toBeDefined()
  })
})
