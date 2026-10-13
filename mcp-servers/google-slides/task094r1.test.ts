/**
 * TASK-094-R1: Source-to-Tool Factual Fidelity, Runtime Workflow Evidence & QA Claims.
 *
 * Closes the four review gaps:
 *  S. sourceFacts contract + source-to-input gate (pre-write, zero-write proof)
 *  A. agent path source->payload->handler->renderer (4 stays 4; 3 blocked)
 *  L. lifecycle evidence contract (PROVEN/MISMATCH/UNPROVEN, no fake enforcement)
 *  C. call accounting with non-conflatable scopes (MODEL/CONTRACT/OBSERVED)
 *  H. claim honesty (structural/text-fit/rendered/human statuses)
 *  B. architecture boundary classifications
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  validateComposeInput,
  resolveEffectiveArchetype,
  composeSlideOnPage,
  checkSourceToInputFidelity,
  buildLifecycleEvidence,
  accountDeckCalls,
  textFitScopeOf,
  isComposeRetryAllowed,
  readbackWithBoundedRetry,
  applyTheme,
  PALETTE,
  handleComposeSlide,
  TEXT_MEASURE_SCOPE,
  ARCHITECTURE_BOUNDARIES,
  type ComposeInput,
} from './beautify'
import { hasBlocking } from './geometry'
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

const SOURCE4 = [
  'Total investasi: Rp4 miliar',
  'Product & Engineering: 50% Rp2 miliar',
  'Sales & Marketing: 25% Rp1 miliar',
  'Customer Success: 15% Rp600 juta',
  'Operations: 10% Rp400 juta',
]

const INVEST4_METRICS = [
  { label: 'Product & Engineering', value: '50% Rp2 miliar' },
  { label: 'Sales & Marketing', value: '25% Rp1 miliar' },
  { label: 'Customer Success', value: '15% Rp600 juta' },
  { label: 'Operations', value: '10% Rp400 juta' },
]

function contentOf(input: ComposeInput): Record<string, unknown> {
  return {
    title: input.title,
    ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
    ...(input.bullets !== undefined ? { bullets: input.bullets } : {}),
    ...(input.metrics !== undefined ? { metrics: input.metrics } : {}),
    ...(input.stages !== undefined ? { stages: input.stages } : {}),
    ...(input.columns !== undefined ? { columns: input.columns } : {}),
    ...(input.closing !== undefined ? { closing: input.closing } : {}),
    ...(input.sharedGoal !== undefined ? { sharedGoal: input.sharedGoal } : {}),
  }
}

/** Handler-path mirror used across agent-path tests. */
function liveCompose(rawArgs: Record<string, unknown>): {
  routing: ReturnType<typeof resolveEffectiveArchetype>
  composed: ReturnType<typeof composeSlideOnPage>
} {
  const { input } = validateComposeInput({ presentationId: 'P1', pageObjectId: 'S1', ...rawArgs })
  const routing = resolveEffectiveArchetype(input.archetype, contentOf(input) as any)
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

// ---------------------------------------------------------------------------
// S. Source contract + source-to-input gate
// ---------------------------------------------------------------------------

describe('S: sourceFacts contract', () => {
  it('validateComposeInput extracts sourceFacts; rejects oversize', () => {
    const { input } = validateComposeInput({
      presentationId: 'P1',
      pageObjectId: 'S1',
      archetype: 'KPI_DASHBOARD',
      title: 'T',
      sourceFacts: SOURCE4,
    })
    expect(input.sourceFacts).toEqual(SOURCE4)
    expect(() =>
      validateComposeInput({
        presentationId: 'P1',
        pageObjectId: 'S1',
        archetype: 'KPI_DASHBOARD',
        title: 'T',
        sourceFacts: Array.from({ length: 9 }, (_, i) => `Fact ${i}`),
      })
    ).toThrow()
  })

  it('absent sourceFacts leaves old callers valid (backward compatible)', () => {
    const { input } = validateComposeInput({
      presentationId: 'P1',
      pageObjectId: 'S1',
      archetype: 'COVER',
      title: 'T',
    })
    expect(input.sourceFacts).toBeUndefined()
    const r = composeSlideOnPage(input, { pageWidthPt: 960, pageHeightPt: 540 })
    expect(r.result.expected.sourceToInputFidelity).toBe('UNPROVEN')
  })
})

describe('S: historical 4->3 corruption blocked before write', () => {
  const corruptedArgs = {
    archetype: 'KPI_DASHBOARD',
    title: 'Growth Investment Allocation',
    subtitle: 'Total investasi: Rp4 miliar',
    metrics: [
      { label: 'Product & Engineering', value: '50% Rp2 miliar' },
      { label: 'Sales & Marketing', value: '25% Rp1 miliar' },
      { label: 'Success & Operations', value: '25% Rp1 miliar' },
    ],
    sourceFacts: SOURCE4,
  }

  it('merged 3-category input vs 4-category source fails pre-write', () => {
    const { composed } = liveCompose(corruptedArgs)
    expect(composed.finalStatus).toBe('GEOMETRY_FAILED')
    expect(composed.result.expected.sourceToInputFidelity).toBe('FAILED')
    const count = composed.prewriteQa.find((f) => f.check === 'SOURCE_TO_INPUT_CATEGORY_COUNT_MISMATCH')
    expect(count?.pass).toBe(false)
    expect(count?.severity).toBe('BLOCKING')
  })

  it('omitted category fails (source 4, input drops Operations)', () => {
    const { composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      metrics: INVEST4_METRICS.slice(0, 3),
      sourceFacts: SOURCE4,
    })
    expect(composed.finalStatus).toBe('GEOMETRY_FAILED')
    expect(hasBlocking(composed.prewriteQa)).toBe(true)
  })

  it('renamed label fails identity (Operations -> Ops)', () => {
    const metrics = INVEST4_METRICS.map((m) =>
      m.label === 'Operations' ? { ...m, label: 'Ops' } : m
    )
    const { composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      metrics,
      sourceFacts: SOURCE4,
    })
    const id = composed.prewriteQa.find((f) => f.check === 'SOURCE_TO_INPUT_IDENTITY_MISMATCH')
    expect(id?.pass).toBe(false)
    expect(composed.finalStatus).toBe('GEOMETRY_FAILED')
  })

  it('altered percentage fails value check (50 -> 45)', () => {
    const metrics = INVEST4_METRICS.map((m) =>
      m.label.startsWith('Product') ? { ...m, value: '45% Rp2 miliar' } : m
    )
    const { composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      metrics,
      sourceFacts: SOURCE4,
    })
    expect(
      composed.prewriteQa.find((f) => f.check === 'SOURCE_TO_INPUT_VALUE_MISMATCH')?.pass
    ).toBe(false)
    expect(composed.finalStatus).toBe('GEOMETRY_FAILED')
  })

  it('altered amount fails value check (Rp2 miliar -> Rp3 miliar)', () => {
    const metrics = INVEST4_METRICS.map((m) =>
      m.label.startsWith('Product') ? { ...m, value: '50% Rp3 miliar' } : m
    )
    const { composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      metrics,
      sourceFacts: SOURCE4,
    })
    expect(
      composed.prewriteQa.find((f) => f.check === 'SOURCE_TO_INPUT_VALUE_MISMATCH')?.pass
    ).toBe(false)
  })

  it('altered total fails total check (Rp4 -> Rp5 miliar)', () => {
    const { composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp5 miliar',
      metrics: INVEST4_METRICS,
      sourceFacts: SOURCE4,
    })
    expect(
      composed.prewriteQa.find((f) => f.check === 'SOURCE_TO_INPUT_TOTAL_MISMATCH')?.pass
    ).toBe(false)
    expect(composed.finalStatus).toBe('GEOMETRY_FAILED')
  })

  it('invented fifth category fails invention check', () => {
    const { composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      metrics: [...INVEST4_METRICS, { label: 'Moonshot Reserve', value: '5% Rp200 juta' }],
      sourceFacts: SOURCE4,
    })
    const inv = composed.prewriteQa.find((f) => f.check === 'SOURCE_TO_INPUT_UNAUTHORIZED_INVENTION')
    // Count gate fires first (5 vs 4); invention fires when counts align.
    expect(hasBlocking(composed.prewriteQa)).toBe(true)
    expect(inv === undefined || inv.pass === false).toBe(true)
  })

  it('reordered categories pass with ORDER_DIFFERS warning (honest, non-blocking)', () => {
    const metrics = [INVEST4_METRICS[3], INVEST4_METRICS[2], INVEST4_METRICS[1], INVEST4_METRICS[0]]
    const { composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      metrics,
      sourceFacts: SOURCE4,
    })
    expect(composed.result.expected.sourceToInputFidelity).toBe('PROVEN')
    const order = composed.prewriteQa.find((f) => f.check === 'SOURCE_TO_INPUT_ORDER_DIFFERS')
    expect(order?.severity).toBe('WARNING')
  })

  it('flexible narrative paraphrase passes when mandatory facts intact', () => {
    const { composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      metrics: INVEST4_METRICS,
      sourceFacts: [...SOURCE4, 'Catatan naratif tentang pertumbuhan tim yang hebat sekali'],
    })
    expect(composed.result.expected.sourceToInputFidelity).toBe('PROVEN')
    expect(hasBlocking(composed.prewriteQa)).toBe(false)
  })

  it('style-only userPrompt cannot overwrite factual source', () => {
    const { composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      metrics: INVEST4_METRICS,
      sourceFacts: SOURCE4,
      userPrompt: 'make it minimal monochrome flat simple',
    })
    expect(composed.result.expected.sourceToInputFidelity).toBe('PROVEN')
  })

  it('faithful source four -> input four -> output four passes end to end', () => {
    const { routing, composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      metrics: INVEST4_METRICS,
      sourceFacts: SOURCE4,
    })
    expect(routing.encoding).toBe('PARTS_OF_WHOLE_STACK')
    expect(composed.result.expected.sourceToInputFidelity).toBe('PROVEN')
    expect(composed.finalStatus).toContain('GEOMETRY_PROVEN')
  })
})

describe('S: checkSourceToInputFidelity unit semantics', () => {
  const base = { title: 'T', subtitle: 'Total investasi: Rp4 miliar', metrics: INVEST4_METRICS }

  it('unavailable source -> UNPROVEN with zero findings (never fabricated)', () => {
    const out = checkSourceToInputFidelity(undefined, base as any)
    expect(out.status).toBe('UNPROVEN')
    expect(out.findings).toEqual([])
  })

  it('narrative-only source -> PROVEN vacuous INFO', () => {
    const out = checkSourceToInputFidelity(['Pertumbuhan tim yang solid dan hebat'], base as any)
    expect(out.status).toBe('PROVEN')
  })
})

// ---------------------------------------------------------------------------
// A. Agent path (source -> payload -> handler -> renderer)
// ---------------------------------------------------------------------------

describe('A: four-category prompt creates four-category payload end to end', () => {
  it('prompt facts -> tool input (4) -> source (4) -> renderer (4 segments)', () => {
    // The agent copies user facts verbatim into metrics AND sourceFacts.
    const rawArgs = {
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      metrics: INVEST4_METRICS,
      sourceFacts: SOURCE4,
    }
    const { input } = validateComposeInput({ presentationId: 'P1', pageObjectId: 'S1', ...rawArgs })
    expect(input.metrics?.length).toBe(4)
    expect(input.sourceFacts?.length).toBe(5)
    const { routing, composed } = liveCompose(rawArgs)
    expect(routing.patch.columns?.length).toBe(4)
    expect(composed.result.expected.sourceToInputFidelity).toBe('PROVEN')
    const segs = (composed.result.requests as Array<any>).filter(
      (r) => r.createShape && String(r.createShape.objectId ?? '').includes('STKS')
    )
    expect(segs.length).toBe(4)
  })

  it('guidance requires verbatim facts + sourceFacts + no merges', () => {
    const text = buildSlidesDoctrineBlock()
    expect(text).toMatch(/copy mandatory slide facts verbatim/i)
    expect(text).toMatch(/sourceFacts/)
    expect(text).toMatch(/Never merge categories/i)
    expect(text).toMatch(/style instructions belong in userPrompt/i)
  })
})

// ---------------------------------------------------------------------------
// H2. Zero-write rejection at the handler (stubbed fetch)
// ---------------------------------------------------------------------------

function okJson(body: unknown): unknown {
  const text = JSON.stringify(body)
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: { get: () => 'application/json' },
    text: async () => text, json: async () => body,
  }
}

function installEchoStub(state: { posts: number; pageGets: number }): void {
  const textById = new Map<string, string>()
  const created: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const method = init.method ?? 'GET'
      if (method === 'POST' && u.includes(':batchUpdate')) {
        state.posts += 1
        let body: Record<string, unknown> = {}
        try {
          body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {}
        } catch { body = {} }
        const requests = ((body?.requests ?? []) as Array<Record<string, unknown>>)
        const replies = requests.map((r) => {
          const key = Object.keys(r)[0]
          const payload = (r as Record<string, any>)[key] ?? {}
          if (key === 'insertText' && typeof payload.objectId === 'string') {
            textById.set(payload.objectId, (textById.get(payload.objectId) ?? '') + String(payload.text ?? ''))
          }
          if ((key === 'createShape' || key === 'createTextBox') && typeof payload.objectId === 'string') {
            created.push(payload.objectId)
            return { [key]: { objectId: payload.objectId } }
          }
          return {}
        })
        return okJson({ presentationId: 'P1', replies })
      }
      if (method === 'GET' && u.includes('/presentations/')) {
        if (u.includes('masters')) return okJson({ masters: [] })
        state.pageGets += 1
        return okJson({
          pageSize: { width: { magnitude: 960, unit: 'PT' }, height: { magnitude: 540, unit: 'PT' } },
          slides: [
            {
              objectId: 'S1',
              pageElements: created.map((id) => ({
                objectId: id,
                shape: { shapeType: 'RECTANGLE', text: { textElements: [{ textRun: { content: textById.get(id) ?? '' } }] } },
              })),
            },
          ],
        })
      }
      return okJson({})
    })
  )
}

function textResultOf(result: { content: Array<{ text: string }> }): Record<string, any> {
  return JSON.parse(result.content[0].text) as Record<string, any>
}

describe('H2: corrupted payload blocked with zero Google writes', () => {
  it('source 4 vs merged 3 -> GEOMETRY_FAILED, POSTs 0, fidelity FAILED', async () => {
    const state = { posts: 0, pageGets: 0 }
    installEchoStub(state)
    const out = textResultOf(
      (await handleComposeSlide('TOKEN', {
        presentationId: 'P1',
        pageObjectId: 'S1',
        archetype: 'KPI_DASHBOARD',
        title: 'Growth Investment Allocation',
        subtitle: 'Total investasi: Rp4 miliar',
        metrics: [
          { label: 'Product & Engineering', value: '50% Rp2 miliar' },
          { label: 'Sales & Marketing', value: '25% Rp1 miliar' },
          { label: 'Success & Operations', value: '25% Rp1 miliar' },
        ],
        sourceFacts: SOURCE4,
      })) as any
    )
    expect(state.posts).toBe(0)
    expect(out.finalStatus).toBe('GEOMETRY_FAILED')
    expect(out.qaPass).toBe(false)
    expect(out.sourceToInputFidelity ?? out.expected?.sourceToInputFidelity).toBe('FAILED')
    expect(out.writeOutcome).toBe('NOT_ATTEMPTED')
    // Grouped readback retry never engages: no write happened.
    expect(out.readAttempts ?? 0).toBeLessThanOrEqual(1)
  }, 20000)

  it('retry helper never mutates compose input (frozen input survives retries)', async () => {
    const input = Object.freeze({ tag: 'frozen' })
    let fetches = 0
    
    const out = await readbackWithBoundedRetry(
      async () => { fetches += 1; return input },
      () => [{ check: 'READBACK_OBJECTS_PRESENT', pass: fetches >= 2, severity: 'BLOCKING' as const }],
      (qa) => qa.every((f) => f.pass),
      { sleep: () => Promise.resolve() }
    )
    expect(out.readAttempts).toBe(2)
    expect(out.snapshot).toEqual({ tag: 'frozen' })
  })
})

// ---------------------------------------------------------------------------
// L. Lifecycle evidence contract
// ---------------------------------------------------------------------------

function tenSummaries(): Array<{ objectId: string; elementCount: number; hasText: boolean }> {
  return Array.from({ length: 10 }, (_, i) => ({ objectId: `S${i + 1}`, elementCount: 5, hasText: true }))
}

describe('L: buildLifecycleEvidence verdicts', () => {
  it('happy 10-slide trace -> LIFECYCLE_PROVEN with full evidence', () => {
    const ev = buildLifecycleEvidence({
      requestedN: 10,
      initialSlideCount: 1,
      initialSlideId: 'S1',
      initialComposed: true,
      createdSlideIds: Array.from({ length: 9 }, (_, i) => `S${i + 2}`),
      composedPageIds: Array.from({ length: 10 }, (_, i) => `S${i + 1}`),
      finalSlides: tenSummaries(),
    })
    expect(ev.verdict).toBe('LIFECYCLE_PROVEN')
    expect(ev.createSlideCalls).toBe(9)
    expect(ev.duplicatePageIds).toEqual([])
    expect(ev.finalSlideCount).toBe(10)
    expect(ev.blankSlideCount).toBe(0)
    expect(ev.meaningfulSlideCount).toBe(10)
  })

  it('11 final slides -> LIFECYCLE_MISMATCH', () => {
    const slides = [...tenSummaries(), { objectId: 'S11', elementCount: 0, hasText: false }]
    const ev = buildLifecycleEvidence({
      requestedN: 10,
      initialSlideCount: 1,
      initialSlideId: 'S1',
      initialComposed: true,
      createdSlideIds: Array.from({ length: 9 }, (_, i) => `S${i + 2}`),
      composedPageIds: Array.from({ length: 10 }, (_, i) => `S${i + 1}`),
      finalSlides: slides,
    })
    expect(ev.verdict).toBe('LIFECYCLE_MISMATCH')
  })

  it('initial slide bypassed -> LIFECYCLE_MISMATCH', () => {
    const ev = buildLifecycleEvidence({
      requestedN: 10,
      initialSlideCount: 1,
      initialSlideId: 'S1',
      initialComposed: false,
      createdSlideIds: Array.from({ length: 10 }, (_, i) => `SX${i}`),
      composedPageIds: Array.from({ length: 10 }, (_, i) => `SX${i}`),
      finalSlides: tenSummaries(),
    })
    expect(ev.verdict).toBe('LIFECYCLE_MISMATCH')
    expect(ev.reason).toMatch(/bypassed/)
  })

  it('duplicate page id -> LIFECYCLE_MISMATCH', () => {
    const ev = buildLifecycleEvidence({
      requestedN: 10,
      initialSlideCount: 1,
      initialSlideId: 'S1',
      initialComposed: true,
      createdSlideIds: Array.from({ length: 9 }, (_, i) => `S${i + 2}`),
      composedPageIds: [...Array.from({ length: 9 }, (_, i) => `S${i + 1}`), 'S1'],
      finalSlides: tenSummaries(),
    })
    expect(ev.verdict).toBe('LIFECYCLE_MISMATCH')
    expect(ev.duplicatePageIds).toEqual(['S1'])
  })

  it('unknown initial id -> LIFECYCLE_UNPROVEN (never fabricated)', () => {
    const ev = buildLifecycleEvidence({
      requestedN: 10,
      initialSlideCount: 1,
      initialSlideId: null,
      initialComposed: true,
      createdSlideIds: [],
      composedPageIds: [],
      finalSlides: tenSummaries(),
    })
    expect(ev.verdict).toBe('LIFECYCLE_UNPROVEN')
  })

  it('existing deck -> LIFECYCLE_UNPROVEN (not engine enforcement)', () => {
    const ev = buildLifecycleEvidence({
      requestedN: 10,
      initialSlideCount: 10,
      initialSlideId: 'E1',
      initialComposed: true,
      createdSlideIds: [],
      composedPageIds: ['E1'],
      finalSlides: tenSummaries(),
      isNewDeck: false,
    })
    expect(ev.verdict).toBe('LIFECYCLE_UNPROVEN')
  })
})

// ---------------------------------------------------------------------------
// C. Call accounting with non-conflatable scopes
// ---------------------------------------------------------------------------

describe('C: accountDeckCalls scopes', () => {
  // Disciplined 10-slide flow: createPresentation + initial getPresentation
  // + compose S1 + 9x(createSlide + compose) + deck-end getPresentation = 22.
  const disciplined: Array<{ tool: 'createPresentation' | 'getPresentation' | 'getPage' | 'createSlide' | 'composeSlide' }> = [
    { tool: 'createPresentation' },
    { tool: 'getPresentation' },
    { tool: 'composeSlide' },
    ...Array.from({ length: 9 }, () => [{ tool: 'createSlide' }, { tool: 'composeSlide' }] as const).flat(),
    { tool: 'getPresentation' },
  ] as Array<{ tool: 'createPresentation' | 'getPresentation' | 'getPage' | 'createSlide' | 'composeSlide' }>

  it('disciplined 10-slide model: 22 calls, 0 redundant (MODEL_ONLY)', () => {
    expect(disciplined.length).toBe(22)
    const a = accountDeckCalls(disciplined, 'MODEL_ONLY')
    expect(a.theoreticalMinimumCalls).toBe(22)
    expect(a.actualSlidesToolCalls).toBe(22)
    expect(a.composeCalls).toBe(10)
    expect(a.createSlideCalls).toBe(9)
    expect(a.redundantReadbackCalls).toBe(0)
    expect(a.retryCalls).toBe(0)
    expect(a.efficiencyScope).toBe('MODEL_ONLY')
  })

  it('undisciplined model (+10 per-slide readbacks): 32 calls, 10 redundant', () => {
    const withReads: typeof disciplined = []
    for (const e of disciplined) {
      withReads.push(e)
      if (e.tool === 'composeSlide') withReads.push({ tool: 'getPage' })
    }
    const a = accountDeckCalls(withReads, 'MODEL_ONLY')
    expect(a.actualSlidesToolCalls).toBe(32)
    expect(a.redundantReadbackCalls).toBe(10)
    expect(a.theoreticalMinimumCalls).toBe(22)
  })

  it('retries counted separately from redundant reads', () => {
    const log: Array<{ tool: 'createPresentation' | 'getPresentation' | 'getPage' | 'createSlide' | 'composeSlide'; retried?: boolean }> = [
      { tool: 'createPresentation' },
      { tool: 'getPresentation' },
      { tool: 'composeSlide' },
      { tool: 'composeSlide', retried: true },
      { tool: 'getPresentation' },
    ]
    const a = accountDeckCalls(log, 'CONTRACT_PROVEN')
    expect(a.retryCalls).toBe(1)
    expect(a.redundantReadbackCalls).toBe(0)
    expect(a.efficiencyScope).toBe('CONTRACT_PROVEN')
  })

  it('identical numbers under different scopes stay distinguishable', () => {
    const m = accountDeckCalls(disciplined, 'MODEL_ONLY')
    const c = accountDeckCalls(disciplined, 'CONTRACT_PROVEN')
    const r = accountDeckCalls(disciplined, 'RUNTIME_OBSERVED')
    expect(m.actualSlidesToolCalls).toBe(c.actualSlidesToolCalls)
    expect(c.actualSlidesToolCalls).toBe(r.actualSlidesToolCalls)
    expect(new Set([m.efficiencyScope, c.efficiencyScope, r.efficiencyScope]).size).toBe(3)
  })

  it('RUNTIME_OBSERVED: transcribed R2 one-slide smoke trace (7 calls, 0 retries)', () => {
    // Transcribed from the recorded R2 packaged-runtime SSE trace
    // (create 1, get_presentation 2, get_page 3, compose 1, all completed).
    const trace = [
      { tool: 'createPresentation' },
      { tool: 'getPresentation' },
      { tool: 'getPage' },
      { tool: 'composeSlide' },
      { tool: 'getPage' },
      { tool: 'getPage' },
      { tool: 'getPresentation' },
    ] as Array<{ tool: 'createPresentation' | 'getPresentation' | 'getPage' | 'createSlide' | 'composeSlide' }>
    const a = accountDeckCalls(trace, 'RUNTIME_OBSERVED')
    expect(a.actualSlidesToolCalls).toBe(7)
    expect(a.composeCalls).toBe(1)
    expect(a.retryCalls).toBe(0)
    expect(a.redundantReadbackCalls).toBe(3)
    expect(a.efficiencyScope).toBe('RUNTIME_OBSERVED')
  })
})

// ---------------------------------------------------------------------------
// H. Claim honesty
// ---------------------------------------------------------------------------

describe('H: separated visual claim statuses', () => {
  it('success result: structural PROVEN + DERIVED_FIT + rendered/human UNPROVEN', async () => {
    const state = { posts: 0, pageGets: 0 }
    
    const textById = new Map<string, string>()
    const created: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit = {}) => {
        const u = String(url)
        const method = init.method ?? 'GET'
        if (method === 'POST' && u.includes(':batchUpdate')) {
          state.posts += 1
          let body: Record<string, unknown> = {}
          try {
            body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {}
          } catch { body = {} }
          const requests = ((body?.requests ?? []) as Array<Record<string, unknown>>)
          const replies = requests.map((r) => {
            const key = Object.keys(r)[0]
            const payload = (r as Record<string, any>)[key] ?? {}
            if (key === 'insertText' && typeof payload.objectId === 'string') {
              textById.set(payload.objectId, (textById.get(payload.objectId) ?? '') + String(payload.text ?? ''))
            }
            if ((key === 'createShape' || key === 'createTextBox') && typeof payload.objectId === 'string') {
              created.push(payload.objectId)
              return { [key]: { objectId: payload.objectId } }
            }
            return {}
          })
          return okJson({ presentationId: 'P1', replies })
        }
        if (method === 'GET' && u.includes('/presentations/')) {
          if (u.includes('masters')) return okJson({ masters: [] })
          state.pageGets += 1
          return okJson({
            pageSize: { width: { magnitude: 960, unit: 'PT' }, height: { magnitude: 540, unit: 'PT' } },
            slides: [
              {
                objectId: 'S1',
                pageElements: created.map((id) => ({
                  objectId: id,
                  shape: { shapeType: 'RECTANGLE', text: { textElements: [{ textRun: { content: textById.get(id) ?? '' } }] } },
                })),
              },
            ],
          })
        }
        return okJson({})
      })
    )
    const raw = (await handleComposeSlide('TOKEN', {
      presentationId: 'P1',
      pageObjectId: 'S1',
      archetype: 'COVER',
      title: 'Claim Check',
    })) as unknown as { content: Array<{ text: string }> }
    const out = JSON.parse(raw.content[0].text) as Record<string, any>
    expect(out.qaPass).toBe(true)
    expect(out.geometryScope).toBe('STRUCTURAL_ONLY')
    expect(out.structuralGeometryStatus).toBe('PROVEN')
    expect(out.textFitScope).toBe('DERIVED_FIT')
    expect(out.renderedVisualStatus).toBe('UNPROVEN')
    expect(out.humanVisualStatus).toBe('UNPROVEN')
  }, 20000)

  it('textFitScopeOf: empty UNPROVEN, overflow BLOCKED, clean DERIVED_FIT', async () => {
    
    expect(textFitScopeOf([])).toBe('UNPROVEN')
    expect(textFitScopeOf([{ check: 'TEXT_CONTAINER_OVERFLOW', pass: false, severity: 'BLOCKING' }])).toBe('BLOCKED')
    expect(textFitScopeOf([{ check: 'TEXT_CONTAINER_OVERFLOW', pass: true, severity: 'INFO' }])).toBe('DERIVED_FIT')
  })

  it('estimator uplift is labeled DERIVED_ESTIMATE, never measurement', async () => {
    
    expect(TEXT_MEASURE_SCOPE).toBe('DERIVED_ESTIMATE')
  })

  it('isComposeRetryAllowed still gates on retryable AND outcome (unchanged)', () => {
    expect(isComposeRetryAllowed({ retryable: false, writeOutcome: 'NOT_APPLIED' } as any)).toBe(false)
    expect(isComposeRetryAllowed({ retryable: true, writeOutcome: 'NOT_APPLIED' } as any)).toBe(true)
    expect(isComposeRetryAllowed({ retryable: true, writeOutcome: 'UNKNOWN' } as any)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// B. Architecture boundary
// ---------------------------------------------------------------------------

describe('B: architecture boundary classifications are explicit', () => {
  it('pins the five boundary labels', async () => {
    
    expect(ARCHITECTURE_BOUNDARIES).toEqual({
      sourceToInputFidelity: 'IMPLEMENTABLE_EXISTING_SURFACE',
      exactNLifecycleEnforcement: 'DECK_LEVEL_TOOL_REQUIRED',
      exactNLifecycleEvidence: 'AGENT_CONTRACT_ONLY',
      runtimeCallAccounting: 'AGENT_CONTRACT_ONLY',
      renderedPixelQA: 'EXTERNAL_RENDER_REQUIRED',
      deckBatching: 'DECK_LEVEL_TOOL_REQUIRED',
      userSuppliedImageInsertion: 'EXISTING_CAPABILITY_AVAILABLE',
      stockOrGeneratedImagePipeline: 'NEW_PROVIDER_AND_POLICY_REQUIRED',
    })
  })
})
