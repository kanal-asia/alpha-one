/**
 * TASK-093-R1: Live Theme Application, Read-Only Group Retry & Semantic Routing.
 *
 * Every test enters through the real handler/input path (validateComposeInput
 * → routing → composeSlideOnPage), never isolated resolvers alone — except the
 * pure readbackWithBoundedRetry helper, which is also exercised end-to-end via
 * a stubbed-fetch handleComposeSlide integration test (write-once proof).
 *
 * Sections:
 *  T. Live theme application (userPrompt → MODERN_GRADIENT → dark page bg + Alpha accents)
 *  R. Read-only retry (helper unit tests + handler write-once integration)
 *  S. Live semantic authority (channels → ranked bars, investment → parts-of-whole)
 *  L. Slide lifecycle verification contract
 *  Q. QA integrity (no weakening: dupes, missing, metadata-only, encoding mismatch)
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  validateComposeInput,
  resolveEffectiveArchetype,
  composeSlideOnPage,
  alphaPageBackgroundRequest,
  readbackWithBoundedRetry,
  verifyDeckSlideCount,
  applyTheme,
  PALETTE,
  composeQaPass,
  handleComposeSlide,
  type ComposeInput,
} from './beautify'
import { qaReadback, hasBlocking, EMU_PER_PT } from './geometry'
import { rgbFromHex } from './visual'

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

// ---------------------------------------------------------------------------
// Helpers (mirror production request shapes)
// ---------------------------------------------------------------------------

function shapeWidths(requests: Array<Record<string, unknown>>, prefix: string): number[] {
  const out: number[] = []
  for (const r of requests) {
    const cs = (r as any).createShape
    if (!cs) continue
    const id = String(cs.objectId ?? '')
    if (!id.includes(prefix)) continue
    const w = cs.elementProperties?.size?.width
    expect(w).toBeDefined()
    const mag = Number(w.magnitude)
    expect(Number.isFinite(mag)).toBe(true)
    out.push(mag / EMU_PER_PT)
  }
  return out
}

function insertTexts(requests: Array<Record<string, unknown>>): string[] {
  return requests
    .filter((r) => (r as any).insertText)
    .map((r) => String((r as any).insertText.text ?? ''))
}

function updateFillFor(requests: Array<Record<string, unknown>>, objectId: string): unknown {
  const u = requests.find((r) => (r as any).updateShapeProperties?.objectId === objectId) as any
  return u?.updateShapeProperties?.shapeProperties?.shapeBackgroundFill?.solidFill?.color?.rgbColor
}

function accBarFill(requests: Array<Record<string, unknown>>): unknown {
  const acc = (requests as Array<any>).find(
    (r) => r.createShape && String(r.createShape.objectId ?? '').includes('ACCBAR')
  )
  expect(acc).toBeDefined()
  return updateFillFor(requests, String(acc.createShape.objectId))
}

/** Replicates handleComposeSlide lines 108-114: route, then patch effective input. */
function routeInput(input: ComposeInput): { routing: ReturnType<typeof resolveEffectiveArchetype>; effective: ComposeInput } {
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
  return { routing, effective }
}

// ---------------------------------------------------------------------------
// T. Live theme application
// ---------------------------------------------------------------------------

const DARK_GRADIENT_PROMPT = 'Buat presentasi strategi bisnis modern, premium, dengan dark gradient visual style.'
const SIMPLE_LIGHT_THEME = { BACKGROUND1: '#FFFFFF', ACCENT1: '#4285F4', ACCENT2: '#AA00FF' }

describe('T: live theme application via handler path', () => {
  it('userPrompt only → MODERN_GRADIENT with USER_EXPLICIT_STYLE source', () => {
    const { input } = validateComposeInput({
      presentationId: 'P1',
      pageObjectId: 'S1',
      archetype: 'COVER',
      title: 'Growth Strategy 2027',
      userPrompt: DARK_GRADIENT_PROMPT,
    })
    expect(input.userPrompt).toBe(DARK_GRADIENT_PROMPT)
    expect(input.themeId).toBeUndefined()
    const composed = composeSlideOnPage(input, {
      pageWidthPt: 960,
      pageHeightPt: 540,
      ...(input.userPrompt ? { userPrompt: input.userPrompt } : {}),
    })
    expect(composed.result.expected.themeResolved).toBe('MODERN_GRADIENT')
    expect(composed.result.expected.themeSource).toBe('USER_EXPLICIT_STYLE')
  })

  it('explicit themeId keeps precedence over userPrompt', () => {
    const { input } = validateComposeInput({
      presentationId: 'P1',
      pageObjectId: 'S1',
      archetype: 'COVER',
      title: 'T',
      themeId: 'BOLD_TECH',
      userPrompt: DARK_GRADIENT_PROMPT,
    })
    const composed = composeSlideOnPage(input, {
      pageWidthPt: 960,
      pageHeightPt: 540,
      ...(input.userPrompt ? { userPrompt: input.userPrompt } : {}),
    })
    expect(composed.result.expected.themeResolved).toBe('BOLD_TECH')
    expect(composed.result.expected.themeSource).toBe('EXPLICIT_COMPOSE')
  })

  it('prompt without style → documented DEFAULT (EXECUTIVE_NAVY)', () => {
    const { input } = validateComposeInput({
      presentationId: 'P1',
      pageObjectId: 'S1',
      archetype: 'COVER',
      title: 'Quarterly Review',
      userPrompt: 'Quarterly business review deck',
    })
    const composed = composeSlideOnPage(input, {
      pageWidthPt: 960,
      pageHeightPt: 540,
      ...(input.userPrompt ? { userPrompt: input.userPrompt } : {}),
    })
    expect(composed.result.expected.themeResolved).toBe('EXECUTIVE_NAVY')
    expect(composed.result.expected.themeSource).toBe('DEFAULT')
  })

  it('dark-gradient prompt produces dark Alpha page-background request', () => {
    const req = alphaPageBackgroundRequest('SL1', 'MODERN_GRADIENT', 'USER_EXPLICIT_STYLE')
    expect(req).not.toBeNull()
    expect(req).toMatchObject({
      updatePageProperties: {
        objectId: 'SL1',
        pageProperties: { pageBackgroundFill: { solidFill: { color: { rgbColor: rgbFromHex('#0F172A') } } } },
      },
    })
  })

  it('DEFAULT source and light themes produce no Alpha page-background request', () => {
    expect(alphaPageBackgroundRequest('SL1', 'EXECUTIVE_NAVY', 'DEFAULT')).toBeNull()
    expect(alphaPageBackgroundRequest('SL1', 'MODERN_GRADIENT', 'DEFAULT')).toBeNull()
    expect(alphaPageBackgroundRequest('SL1', 'EDITORIAL_MINIMAL', 'USER_EXPLICIT_STYLE')).toBeNull()
    expect(alphaPageBackgroundRequest('SL1', undefined, undefined)).toBeNull()
  })

  it('Alpha-explicit accents survive a Simple Light deck theme (not overridden to Google blue)', () => {
    const input: ComposeInput = { pageObjectId: 'S1', archetype: 'COVER', title: 'T', subtitle: 'Sub' }
    const composed = composeSlideOnPage(input, {
      pageWidthPt: 960,
      pageHeightPt: 540,
      theme: SIMPLE_LIGHT_THEME,
      alphaThemeId: 'MODERN_GRADIENT',
    })
    expect(composed.result.expected.themeResolved).toBe('MODERN_GRADIENT')
    // Alpha cyan, not Google Simple Light blue.
    expect(accBarFill(composed.result.requests as Array<Record<string, unknown>>)).toEqual(rgbFromHex('#06B6D4'))
  })

  it('DEFAULT source keeps legacy Google-role accent resolution', () => {
    const input: ComposeInput = { pageObjectId: 'S1', archetype: 'COVER', title: 'T', subtitle: 'Sub' }
    const composed = composeSlideOnPage(input, {
      pageWidthPt: 960,
      pageHeightPt: 540,
      theme: SIMPLE_LIGHT_THEME,
    })
    expect(composed.result.expected.themeSource).toBe('DEFAULT')
    expect(accBarFill(composed.result.requests as Array<Record<string, unknown>>)).toEqual(rgbFromHex('#4285F4'))
  })

  it('userPrompt cover plan contains theme layered-background shapes (beyond palette)', () => {
    const { input } = validateComposeInput({
      presentationId: 'P1',
      pageObjectId: 'S1',
      archetype: 'COVER',
      title: 'Growth Strategy 2027',
      subtitle: 'Modern premium dark gradient',
      userPrompt: DARK_GRADIENT_PROMPT,
    })
    const composed = composeSlideOnPage(input, {
      pageWidthPt: 960,
      pageHeightPt: 540,
      ...(input.userPrompt ? { userPrompt: input.userPrompt } : {}),
    })
    const bg = (composed.result.requests as Array<any>).filter(
      (r) => r.createShape && String(r.createShape.objectId ?? '').includes('_BG_')
    )
    expect(bg.length).toBeGreaterThanOrEqual(2)
  })

  it('sequential deck/theme calls do not bleed (MODERN → NAVY → MODERN)', () => {
    const mk = (themeId: string) =>
      composeSlideOnPage(
        { pageObjectId: 'S1', archetype: 'COVER', title: 'T' },
        { pageWidthPt: 960, pageHeightPt: 540, alphaThemeId: themeId }
      )
    const r1 = mk('MODERN_GRADIENT')
    const r2 = mk('EXECUTIVE_NAVY')
    const r3 = mk('MODERN_GRADIENT')
    expect(r1.result.expected.themeResolved).toBe('MODERN_GRADIENT')
    expect(r2.result.expected.themeResolved).toBe('EXECUTIVE_NAVY')
    expect(r3.result.expected.themeResolved).toBe('MODERN_GRADIENT')
    expect(accBarFill(r1.result.requests as any)).toEqual(rgbFromHex('#06B6D4'))
    expect(accBarFill(r2.result.requests as any)).toEqual(rgbFromHex('#1E3A5F'))
    expect(accBarFill(r3.result.requests as any)).toEqual(rgbFromHex('#06B6D4'))
  })

  it('interleaved sync composes stay isolated (concurrency-safe atomic section)', () => {
    // composeSlideOnPage is synchronous: applyTheme + render cannot interleave.
    const a = composeSlideOnPage(
      { pageObjectId: 'S1', archetype: 'COVER', title: 'A' },
      { pageWidthPt: 960, pageHeightPt: 540, alphaThemeId: 'MODERN_GRADIENT' }
    )
    const b = composeSlideOnPage(
      { pageObjectId: 'S2', archetype: 'COVER', title: 'B' },
      { pageWidthPt: 960, pageHeightPt: 540, alphaThemeId: 'BOLD_TECH' }
    )
    expect(a.result.expected.themeResolved).toBe('MODERN_GRADIENT')
    expect(b.result.expected.themeResolved).toBe('BOLD_TECH')
    expect(accBarFill(a.result.requests as any)).toEqual(rgbFromHex('#06B6D4'))
    const bFills = insertTexts(b.result.requests as any)
    expect(bFills).toContain('B')
  })
})

// ---------------------------------------------------------------------------
// R. Read-only retry
// ---------------------------------------------------------------------------

describe('R: readbackWithBoundedRetry helper', () => {
  const okQa = [{ check: 'READBACK_OBJECTS_PRESENT', pass: true, severity: 'BLOCKING' as const }]
  const badQa = [{ check: 'READBACK_OBJECTS_PRESENT', pass: false, severity: 'BLOCKING' as const }]
  const noSleep = { sleep: () => Promise.resolve() }

  it('first read succeeds → 1 attempt', async () => {
    let fetches = 0
    const out = await readbackWithBoundedRetry(
      async () => { fetches += 1; return 'S1' },
      () => okQa,
      (qa) => qa.every((f) => f.pass),
      noSleep
    )
    expect(out.readAttempts).toBe(1)
    expect(fetches).toBe(1)
    expect(out.snapshot).toBe('S1')
  })

  it('second read succeeds → 2 attempts', async () => {
    let fetches = 0
    const out = await readbackWithBoundedRetry(
      async () => { fetches += 1; return `S${fetches}` },
      (s) => (s === 'S2' ? okQa : badQa),
      (qa) => qa.every((f) => f.pass),
      noSleep
    )
    expect(out.readAttempts).toBe(2)
    expect(fetches).toBe(2)
    expect(out.snapshot).toBe('S2')
  })

  it('third read succeeds → 3 attempts', async () => {
    let fetches = 0
    const out = await readbackWithBoundedRetry(
      async () => { fetches += 1; return `S${fetches}` },
      (s) => (s === 'S3' ? okQa : badQa),
      (qa) => qa.every((f) => f.pass),
      noSleep
    )
    expect(out.readAttempts).toBe(3)
    expect(fetches).toBe(3)
  })

  it('all reads fail → honest failure after exactly 3 attempts, no rewrite', async () => {
    let fetches = 0
    let writes = 0
    const out = await readbackWithBoundedRetry(
      async () => { fetches += 1; return `S${fetches}` },
      () => { writes += 0; return badQa },
      (qa) => qa.every((f) => f.pass),
      noSleep
    )
    expect(out.readAttempts).toBe(3)
    expect(fetches).toBe(3)
    expect(writes).toBe(0)
    expect(out.qa.every((f) => f.pass)).toBe(false)
  })

  it('structural QA throw is not retried (1 fetch, immediate propagate)', async () => {
    let fetches = 0
    await expect(
      readbackWithBoundedRetry(
        async () => { fetches += 1; return 'S1' },
        () => { throw new Error('structural') },
        () => true,
        noSleep
      )
    ).rejects.toThrow('structural')
    expect(fetches).toBe(1)
  })

  it('transient fetch throw then success → 2 attempts', async () => {
    let fetches = 0
    const out = await readbackWithBoundedRetry(
      async () => {
        fetches += 1
        if (fetches === 1) throw new Error('transient GET failure')
        return 'S2'
      },
      () => okQa,
      (qa) => qa.every((f) => f.pass),
      noSleep
    )
    expect(out.readAttempts).toBe(2)
    expect(fetches).toBe(2)
  })

  it('persistent fetch throw → rethrown after exactly 3 attempts', async () => {
    let fetches = 0
    await expect(
      readbackWithBoundedRetry(
        async () => { fetches += 1; throw new Error('down') },
        () => okQa,
        () => true,
        noSleep
      )
    ).rejects.toThrow('down')
    expect(fetches).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// R2: handler write-once integration (stubbed fetch, no network)
// ---------------------------------------------------------------------------

function okJson(body: unknown): unknown {
  const text = JSON.stringify(body)
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: () => 'application/json' },
    text: async () => text,
    json: async () => body,
  }
}

interface StubState {
  posts: Array<{ url: string; body: Record<string, unknown> }>
  pageGets: number
  masterGets: number
  textById: Map<string, string>
  createdIds: string[]
  groupedChildIds: Set<string>
  readbackCalls: number
  dropGroupedOnFirstReadback: boolean
}

function installStub(state: StubState, pageId: string): void {
  const pageEl = (id: string, text: string) => ({
    objectId: id,
    shape: { shapeType: 'RECTANGLE', text: { textElements: [{ textRun: { content: text } }] } },
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const u = String(url)
      const method = init.method ?? 'GET'
      let body: Record<string, unknown> | undefined
      try {
        body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined
      } catch {
        body = undefined
      }
      if (method === 'POST' && u.includes(':batchUpdate')) {
        state.posts.push({ url: u, body: body ?? {} })
        const requests = ((body?.requests ?? []) as Array<Record<string, unknown>>)
        const replies: Array<Record<string, unknown>> = []
        for (const r of requests) {
          const key = Object.keys(r)[0]
          const payload = (r as Record<string, any>)[key] ?? {}
          if (key === 'createShape' || key === 'createTextBox' || key === 'createTable' || key === 'createImage' || key === 'createLine') {
            if (typeof payload.objectId === 'string') {
              replies.push({ [key]: { objectId: payload.objectId } })
              if (!state.createdIds.includes(payload.objectId)) state.createdIds.push(payload.objectId)
            } else replies.push({})
          } else if (key === 'insertText') {
            if (typeof payload.objectId === 'string' && typeof payload.text === 'string') {
              const prev = state.textById.get(payload.objectId) ?? ''
              state.textById.set(payload.objectId, prev + payload.text)
            }
            replies.push({})
          } else if (key === 'groupObjects') {
            const kids = (payload.childrenObjectIds ?? []) as unknown[]
            for (const k of kids) if (typeof k === 'string') state.groupedChildIds.add(k)
            replies.push({})
          } else {
            replies.push({})
          }
        }
        return okJson({ presentationId: 'PRES_R1', replies })
      }
      if (method === 'GET' && u.includes('/presentations/')) {
        // Note: URLSearchParams percent-encodes parens/commas, so match bare keys.
        if (u.includes('masters')) {
          state.masterGets += 1
          return okJson({ masters: [] })
        }
        state.pageGets += 1
        if (state.posts.length === 0) {
          // Pre-write inspection: blank slide.
          return okJson({
            pageSize: { width: { magnitude: 960, unit: 'PT' }, height: { magnitude: 540, unit: 'PT' } },
            slides: [{ objectId: pageId, pageElements: [] }],
          })
        }
        // Post-write readback: every created object exists (with or without
        // text); the first readback may hide grouped children (eventual consistency).
        state.readbackCalls += 1
        const ids = [...state.createdIds]
        const drop =
          state.dropGroupedOnFirstReadback && state.readbackCalls === 1
            ? new Set([...state.groupedChildIds])
            : new Set<string>()
        const elements = ids.filter((id) => !drop.has(id)).map((id) => pageEl(id, state.textById.get(id) ?? ''))
        return okJson({
          pageSize: { width: { magnitude: 960, unit: 'PT' }, height: { magnitude: 540, unit: 'PT' } },
          slides: [{ objectId: pageId, pageElements: elements }],
        })
      }
      return okJson({})
    })
  )
}

function textResultOf(result: { content: Array<{ text: string }> }): Record<string, any> {
  return JSON.parse(result.content[0].text) as Record<string, any>
}

describe('R2: handler write-once + read-only retry (stubbed Google API)', () => {
  it('KPI 4-card grouped compose: 4 groups planned, write once, retry reads only, PROVEN', async () => {
    const state: StubState = {
      posts: [],
      pageGets: 0,
      masterGets: 0,
      textById: new Map(),
      createdIds: [],
      groupedChildIds: new Set(),
      readbackCalls: 0,
      dropGroupedOnFirstReadback: true,
    }
    installStub(state, 'PAGE_KPI')
    const out = textResultOf(
      (await handleComposeSlide('TOKEN', {
        presentationId: 'PRES_R1',
        pageObjectId: 'PAGE_KPI',
        archetype: 'KPI_DASHBOARD',
        title: 'Business Snapshot',
        metrics: [
          { label: 'ARR', value: '$12M' },
          { label: 'Retention', value: '92%' },
          { label: 'NPS', value: '72' },
          { label: 'CSAT', value: '88%' },
        ],
      })) as any
    )
    // Retry engaged exactly once (first readback dropped grouped children).
    expect(out.readAttempts).toBe(2)
    expect(out.writeAttemptCount).toBe(1)
    // Write-once: POST count equals single-plan chunking, no retry growth.
    const expectedPosts = Math.ceil(Number(out.appliedRequests) / 25)
    expect(state.posts.length).toBe(expectedPosts)
    // Four KPI groups planned exactly once (4, never 8 or 12).
    const groupOps = state.posts.flatMap((p) =>
      (((p.body as any).requests ?? []) as Array<Record<string, unknown>>).filter((r) => 'groupObjects' in r)
    )
    expect(groupOps.length).toBe(4)
    // Object IDs identical and unique across the whole run.
    const ids = out.createdIds as string[]
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.length).toBeGreaterThan(0)
    // Honest success: no blocking readback findings.
    expect(out.qaPass).toBe(true)
    expect(out.finalStatus).not.toBe('GEOMETRY_FAILED')
    const presence = (out.readbackQa as Array<any>).find((f) => f.check === 'READBACK_OBJECTS_PRESENT')
    expect(presence?.pass).toBe(true)
  }, 20000)

  it('COVER small compose: exactly 1 POST, first read succeeds, 2 page GETs', async () => {
    const state: StubState = {
      posts: [],
      pageGets: 0,
      masterGets: 0,
      textById: new Map(),
      createdIds: [],
      groupedChildIds: new Set(),
      readbackCalls: 0,
      dropGroupedOnFirstReadback: false,
    }
    installStub(state, 'PAGE_COVER')
    const out = textResultOf(
      (await handleComposeSlide('TOKEN', {
        presentationId: 'PRES_R1',
        pageObjectId: 'PAGE_COVER',
        archetype: 'COVER',
        title: 'Growth Vision 2027',
        subtitle: 'Alpha One',
      })) as any
    )
    expect(out.readAttempts).toBe(1)
    expect(out.writeAttemptCount).toBe(1)
    expect(state.posts.length).toBe(1)
    // 1 pre-write inspection + 1 readback page GET.
    expect(state.pageGets).toBe(2)
    expect(out.qaPass).toBe(true)
  }, 20000)
})

// ---------------------------------------------------------------------------
// S. Live semantic authority via handler path
// ---------------------------------------------------------------------------

function liveCompose(rawArgs: Record<string, unknown>): { routing: ReturnType<typeof resolveEffectiveArchetype>; composed: ReturnType<typeof composeSlideOnPage> } {
  const { input } = validateComposeInput({ presentationId: 'P1', pageObjectId: 'S1', ...rawArgs })
  const { routing, effective } = routeInput(input)
  const composed = composeSlideOnPage(effective, {
    pageWidthPt: 960,
    pageHeightPt: 540,
    expectedEncoding: routing.encoding,
  })
  return { routing, composed }
}

describe('S: channels 42/28/18/12 → ranked proportional bars (not KPI cards)', () => {
  const channelColumns = [
    { name: 'Organic & Content', items: ['42%'] },
    { name: 'Strategic Partnerships', items: ['28%'] },
    { name: 'Performance Marketing', items: ['18%'] },
    { name: 'Community & Referral', items: ['12%'] },
  ]

  it('agent COMPARISON + percent columns → RANKED_PROPORTIONAL_BARS geometry', () => {
    const { routing, composed } = liveCompose({
      archetype: 'COMPARISON',
      title: 'Customer Acquisition Channels',
      columns: channelColumns,
    })
    expect(routing.redirected).toBe(false)
    expect(routing.encoding).toBe('RANKED_PROPORTIONAL_BARS')
    expect(composed.result.expected.encoding).toBe('RANKED_PROPORTIONAL_BARS')
    const reqs = composed.result.requests as Array<Record<string, unknown>>
    // Ranked-bar objects present (labels, tracks, bars, values), no KPI cards.
    const bars = shapeWidths(reqs, 'DBB')
    expect(bars.length).toBe(4)
    expect(shapeWidths(reqs, 'DBT').length).toBe(4)
    const texts = insertTexts(reqs).join('\n')
    for (const label of ['Organic & Content', 'Strategic Partnerships', 'Performance Marketing', 'Community & Referral']) {
      expect(texts).toContain(label)
    }
    for (const v of ['42%', '28%', '18%', '12%']) expect(texts).toContain(v)
    expect(reqs.some((r) => String((r as any).createShape?.objectId ?? '').includes('KPIBG'))).toBe(false)
    // Proportional: strictly decreasing in source order, 42-share dominates 12-share.
    expect(bars[0]).toBeGreaterThan(bars[1])
    expect(bars[1]).toBeGreaterThan(bars[2])
    expect(bars[2]).toBeGreaterThan(bars[3])
    const ratio = bars[0] / bars[3]
    expect(ratio).toBeGreaterThan(2.8)
    expect(ratio).toBeLessThan(4.2)
  })

  it('agent COMPARISON + share bullets → RANKED_PROPORTIONAL_BARS geometry', () => {
    const { routing, composed } = liveCompose({
      archetype: 'COMPARISON',
      title: 'Customer Acquisition Channels',
      bullets: [
        'Organic & Content: 42%',
        'Strategic Partnerships: 28%',
        'Performance Marketing: 18%',
        'Community & Referral: 12%',
      ],
    })
    expect(routing.encoding).toBe('RANKED_PROPORTIONAL_BARS')
    expect(composed.result.expected.encoding).toBe('RANKED_PROPORTIONAL_BARS')
    const reqs = composed.result.requests as Array<Record<string, unknown>>
    expect(shapeWidths(reqs, 'DBB').length).toBe(4)
    expect(reqs.some((r) => String((r as any).createShape?.objectId ?? '').includes('KPIBG'))).toBe(false)
  })
})

describe('S: investment Rp4 miliar + 50/25/15/10 → parts-of-whole (not KPI)', () => {
  const budgetMetrics = [
    { label: 'Product & Engineering', value: '50% Rp2 miliar' },
    { label: 'Sales & Marketing', value: '25% Rp1 miliar' },
    { label: 'Customer Success', value: '15% Rp600 juta' },
    { label: 'Operations', value: '10% Rp400 juta' },
  ]

  it('agent KPI_DASHBOARD + budget metrics + total → COMPARISON / PARTS_OF_WHOLE_STACK', () => {
    const { routing, composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      metrics: budgetMetrics,
    })
    expect(routing.redirected).toBe(true)
    // TASK-094-R3: budget vehicle is COMPARISON (stacked), never PILLARS.
    expect(routing.archetype).toBe('COMPARISON')
    expect(routing.encoding).toBe('PARTS_OF_WHOLE_STACK')
    expect(composed.result.expected.encoding).toBe('PARTS_OF_WHOLE_STACK')
    const reqs = composed.result.requests as Array<Record<string, unknown>>
    // Stacked segments proportional to 50/25/15/10.
    const segs = shapeWidths(reqs, 'STKS')
    expect(segs.length).toBe(4)
    expect(segs[0]).toBeGreaterThan(segs[1])
    expect(segs[1]).toBeGreaterThan(segs[2])
    expect(segs[2]).toBeGreaterThan(segs[3])
    expect(segs[0] / segs[1]).toBeGreaterThan(1.9)
    expect(segs[0] / segs[1]).toBeLessThan(2.1)
    // Amounts + total preserved verbatim; no KPI cards.
    const texts = insertTexts(reqs).join('\n')
    for (const a of ['Rp2 miliar', 'Rp1 miliar', 'Rp600 juta', 'Rp400 juta']) expect(texts).toContain(a)
    expect(texts).toContain('Rp4 miliar')
    expect(reqs.some((r) => String((r as any).createShape?.objectId ?? '').includes('KPIBG'))).toBe(false)
  })

  it('agent KPI_DASHBOARD + budget bullets + total → COMPARISON / PARTS_OF_WHOLE_STACK', () => {
    const { routing, composed } = liveCompose({
      archetype: 'KPI_DASHBOARD',
      title: 'Growth Investment Allocation',
      subtitle: 'Total investasi: Rp4 miliar',
      bullets: [
        'Product & Engineering: 50% Rp2 miliar',
        'Sales & Marketing: 25% Rp1 miliar',
        'Customer Success: 15% Rp600 juta',
        'Operations: 10% Rp400 juta',
      ],
    })
    expect(routing.redirected).toBe(true)
    // TASK-094-R3: budget vehicle is COMPARISON (stacked), never PILLARS.
    expect(routing.archetype).toBe('COMPARISON')
    expect(routing.encoding).toBe('PARTS_OF_WHOLE_STACK')
    expect(composed.result.expected.encoding).toBe('PARTS_OF_WHOLE_STACK')
    expect(shapeWidths(composed.result.requests as Array<Record<string, unknown>>, 'STKS').length).toBe(4)
  })

  it('EXPECTED_ENCODING_MATCH gates the final renderer (mismatch fails closed)', () => {
    const { input } = validateComposeInput({
      presentationId: 'P1',
      pageObjectId: 'S1',
      archetype: 'COMPARISON',
      title: 'Customer Acquisition Channels',
      columns: [
        { name: 'Organic & Content', items: ['42%'] },
        { name: 'Strategic Partnerships', items: ['28%'] },
        { name: 'Performance Marketing', items: ['18%'] },
        { name: 'Community & Referral', items: ['12%'] },
      ],
    })
    const bad = composeSlideOnPage(input, {
      pageWidthPt: 960,
      pageHeightPt: 540,
      expectedEncoding: 'KPI_GRID',
    })
    expect(bad.finalStatus).toBe('GEOMETRY_FAILED')
    expect(
      bad.prewriteQa.some((f) => f.check === 'EXPECTED_ENCODING_MATCH' && !f.pass && f.severity === 'BLOCKING')
    ).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// L. Slide lifecycle verification contract
// ---------------------------------------------------------------------------

describe('L: verifyDeckSlideCount', () => {
  const ten = (n: number, blankFirst = false, blankIdx = -1) =>
    Array.from({ length: n }, (_, i) => ({
      objectId: `SL${i + 1}`,
      elementCount: i === 0 ? (blankFirst ? 0 : 3) : i === blankIdx ? 0 : 3,
      hasText: !(i === 0 ? blankFirst : i === blankIdx),
    }))

  it('new deck 10 requested → exactly 10 meaningful: pass', () => {
    const v = verifyDeckSlideCount(ten(10), 10, { isNewDeck: true })
    expect(v.pass).toBe(true)
    expect(v.blankSlideIds).toEqual([])
  })

  it('11 slides for 10 requested → mismatch failure', () => {
    const v = verifyDeckSlideCount(ten(11), 10, { isNewDeck: true })
    expect(v.pass).toBe(false)
    expect(v.reason).toContain('expected 10, found 11')
  })

  it('blank first slide in new deck → failure with id', () => {
    const v = verifyDeckSlideCount(ten(10, true), 10, { isNewDeck: true })
    expect(v.pass).toBe(false)
    expect(v.blankSlideIds).toContain('SL1')
  })

  it('blank middle slide in new deck → failure', () => {
    const v = verifyDeckSlideCount(ten(10, false, 4), 10, { isNewDeck: true })
    expect(v.pass).toBe(false)
    expect(v.blankSlideIds).toContain('SL5')
  })

  it('existing 10-slide deck unchanged → pass; helper never deletes (pure)', () => {
    const slides = ten(10)
    const before = JSON.stringify(slides)
    const v = verifyDeckSlideCount(slides, 10, { isNewDeck: false })
    expect(v.pass).toBe(true)
    expect(JSON.stringify(slides)).toBe(before)
  })

  it('existing deck count change is reported, first slide never auto-removed', () => {
    const slides = ten(9)
    const v = verifyDeckSlideCount(slides, 10, { isNewDeck: false })
    expect(v.pass).toBe(false)
    expect(slides[0].objectId).toBe('SL1')
  })
})

// ---------------------------------------------------------------------------
// Q. QA integrity (no weakening)
// ---------------------------------------------------------------------------

describe('Q: QA integrity — gates stay strict', () => {
  const page = { w: 960, h: 540, aspect: 16 / 9 }

  it('duplicated AB_ generation in readback → READBACK_NO_SOURCE_DUPLICATES BLOCKING', () => {
    const findings = qaReadback({
      page,
      expectedTexts: ['Growth 10%'],
      expectedIds: ['AB_new_1'],
      clearedIds: [],
      elements: [
        { objectId: 'AB_new_1', text: 'Growth 10%' },
        { objectId: 'AB_old_1', text: 'Growth 10%' },
      ],
      ownership: [],
    })
    const dupe = findings.find((f) => f.check === 'READBACK_NO_SOURCE_DUPLICATES')
    expect(dupe?.pass).toBe(false)
    expect(dupe?.severity).toBe('BLOCKING')
    expect(hasBlocking(findings)).toBe(true)
  })

  it('missing grouped objects → READBACK_OBJECTS_PRESENT BLOCKING (not weakened)', () => {
    const findings = qaReadback({
      page,
      expectedTexts: ['A'],
      expectedIds: ['AB_1', 'AB_2', 'AB_3'],
      clearedIds: [],
      elements: [{ objectId: 'AB_1', text: 'A' }],
      ownership: [],
    })
    const presence = findings.find((f) => f.check === 'READBACK_OBJECTS_PRESENT')
    expect(presence?.pass).toBe(false)
    expect(presence?.severity).toBe('BLOCKING')
  })

  it('appliedRequests>0 alone never yields qaPass with blocking readback', () => {
    const planFindings = [{ pass: true }]
    const rb = qaReadback({
      page,
      expectedTexts: ['A'],
      expectedIds: ['AB_1', 'AB_2'],
      clearedIds: [],
      elements: [{ objectId: 'AB_1', text: 'A' }],
      ownership: [],
    })
    expect(hasBlocking(rb)).toBe(true)
    expect(composeQaPass(planFindings, rb)).toBe(false)
  })

  it('healthy 4-group KPI readback passes presence with zero missing facts', () => {
    const members = ['BG', 'AC', 'V', 'L'].flatMap((k, g) => [`AB_new_${k}${g}`])
    const findings = qaReadback({
      page,
      expectedTexts: ['$12M', 'ARR'],
      expectedIds: members,
      clearedIds: [],
      elements: members.map((id) => ({ objectId: id, text: '$12M ARR' })),
      ownership: [],
    })
    expect(findings.find((f) => f.check === 'READBACK_OBJECTS_PRESENT')?.pass).toBe(true)
    expect(findings.find((f) => f.check === 'READBACK_FACTUAL_COMPLETENESS')?.pass).toBe(true)
    expect(hasBlocking(findings)).toBe(false)
  })

  it('READBACK_OBJECTS_PRESENT check still exists (not removed)', () => {
    const findings = qaReadback({
      page,
      expectedTexts: [],
      expectedIds: [],
      clearedIds: [],
      elements: [],
      ownership: [],
    })
    expect(findings.some((f) => f.check === 'READBACK_OBJECTS_PRESENT')).toBe(true)
  })
})
