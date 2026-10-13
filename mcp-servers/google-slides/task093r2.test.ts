/**
 * TASK-093-R2: Empty Placeholder DeleteText Guard & Non-Retryable Compose Errors.
 *
 * Live trigger: COVER compose on a fresh deck (empty TITLE/SUBTITLE
 * placeholders) emitted `deleteText ALL` against an empty span; Google
 * rejected it with HTTP 400 (startIndex 0 must be < endIndex 0), and the
 * agent repeated the identical call four times.
 *
 * Sections:
 *  G. Central guard unit cases (buildSafeDeleteText / deletableTextLength /
 *     buildTextMutation set+existingText and delete-branch preservation)
 *  P. Compose-path plans (empty/non-empty placeholders, title-only, both
 *     empty, custom-box, subtitle variants, no hint leakage)
 *  E. Terminal/translation classification (classifyComposeError all phases)
 *  H. Handler 400/500 integration (stubbed fetch: single POST, terminal
 *     result, no readback retry, no second write, no fallback advice)
 *  A. Agent retry-allowance predicate (isComposeRetryAllowed: one attempt on
 *     terminal 400)
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  buildTextMutation,
  buildSafeDeleteText,
  deletableTextLength,
} from './visual'
import {
  validateComposeInput,
  composeSlideOnPage,
  classifyComposeError,
  isComposeRetryAllowed,
  handleComposeSlide,
  applyTheme,
  PALETTE,
  type ComposeInput,
} from './beautify'

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

function deleteTexts(requests: Array<Record<string, unknown>>): Array<any> {
  return requests.filter((r) => (r as any).deleteText).map((r) => (r as any).deleteText)
}

function insertTexts(requests: Array<Record<string, unknown>>): string[] {
  return requests
    .filter((r) => (r as any).insertText)
    .map((r) => String((r as any).insertText.text ?? ''))
}

function requestKinds(requests: Array<Record<string, unknown>>): string[] {
  return requests.map((r) => Object.keys(r)[0])
}

// ---------------------------------------------------------------------------
// G. Central guard
// ---------------------------------------------------------------------------

describe('G: deletableTextLength (terminal-newline semantics)', () => {
  it("'' → 0 (empty placeholder has no deletable span)", () => {
    expect(deletableTextLength('')).toBe(0)
  })
  it('null/undefined → 0', () => {
    expect(deletableTextLength(null)).toBe(0)
    expect(deletableTextLength(undefined)).toBe(0)
  })
  it("'\\n' (terminal newline only) → 0", () => {
    expect(deletableTextLength('\n')).toBe(0)
  })
  it("'Hello' → 5", () => {
    expect(deletableTextLength('Hello')).toBe(5)
  })
  it("'Hello\\n' → 5 (newline is not extra deletable span)", () => {
    expect(deletableTextLength('Hello\n')).toBe(5)
  })
  it("'   ' (whitespace, no newline) → 3: non-empty span deletes validly", () => {
    expect(deletableTextLength('   ')).toBe(3)
  })
})

describe('G: buildSafeDeleteText (skip, never invalid)', () => {
  it('0..0 → no request', () => {
    expect(buildSafeDeleteText('S1', 0, 0)).toEqual([])
  })
  it('1..1 → no request', () => {
    expect(buildSafeDeleteText('S1', 1, 1)).toEqual([])
  })
  it('5..2 (reversed) → no request', () => {
    expect(buildSafeDeleteText('S1', 5, 2)).toEqual([])
  })
  it('negative start → no request', () => {
    expect(buildSafeDeleteText('S1', -1, 4)).toEqual([])
  })
  it('NaN/undefined → no request', () => {
    expect(buildSafeDeleteText('S1', NaN, 4)).toEqual([])
    expect(buildSafeDeleteText('S1', undefined, 4)).toEqual([])
    expect(buildSafeDeleteText('S1', 0, undefined)).toEqual([])
  })
  it('0..5 → exactly one valid FIXED_RANGE deletion', () => {
    expect(buildSafeDeleteText('S1', 0, 5)).toEqual([
      { deleteText: { objectId: 'S1', textRange: { type: 'FIXED_RANGE', startIndex: 0, endIndex: 5 } } },
    ])
  })
  it('1..4 → exactly one valid FIXED_RANGE deletion', () => {
    expect(buildSafeDeleteText('S1', 1, 4)).toEqual([
      { deleteText: { objectId: 'S1', textRange: { type: 'FIXED_RANGE', startIndex: 1, endIndex: 4 } } },
    ])
  })
})

describe('G: buildTextMutation set+existingText (empty-aware replacement)', () => {
  it("existingText '' → insert-only, no deleteText", () => {
    const reqs = buildTextMutation({ objectId: 'PH', mode: 'set', text: 'Title', existingText: '' })
    expect(requestKinds(reqs)).toEqual(['insertText'])
  })
  it("existingText '\\n' → insert-only, no deleteText", () => {
    const reqs = buildTextMutation({ objectId: 'PH', mode: 'set', text: 'Title', existingText: '\n' })
    expect(requestKinds(reqs)).toEqual(['insertText'])
  })
  it("existingText 'Old' → delete ALL + insert (valid replacement preserved)", () => {
    const reqs = buildTextMutation({ objectId: 'PH', mode: 'set', text: 'New', existingText: 'Old' })
    expect(requestKinds(reqs)).toEqual(['deleteText', 'insertText'])
    expect(reqs[0]).toEqual({ deleteText: { objectId: 'PH', textRange: { type: 'ALL' } } })
  })
  it("existingText 'Old\\n' → delete ALL + insert", () => {
    const reqs = buildTextMutation({ objectId: 'PH', mode: 'set', text: 'New', existingText: 'Old\n' })
    expect(requestKinds(reqs)).toEqual(['deleteText', 'insertText'])
  })
  it('existingText omitted → legacy delete ALL + insert', () => {
    const reqs = buildTextMutation({ objectId: 'PH', mode: 'set', text: 'New' })
    expect(requestKinds(reqs)).toEqual(['deleteText', 'insertText'])
  })
})

describe('G: buildTextMutation delete branch stays fail-closed', () => {
  it('4..4 throws (documented planner error, not silent skip)', () => {
    expect(() => buildTextMutation({ objectId: 'S1', mode: 'delete', startIndex: 4, endIndex: 4 })).toThrow(/endIndex/)
  })
  it('0..0 explicit delete throws (never emits invalid range)', () => {
    expect(() => buildTextMutation({ objectId: 'S1', mode: 'delete', startIndex: 0, endIndex: 0 })).toThrow(/endIndex/)
  })
  it('missing indexes throw', () => {
    expect(() => buildTextMutation({ objectId: 'S1', mode: 'delete' })).toThrow(/explicit/)
  })
  it('valid 1..4 still emits one deletion', () => {
    expect(buildTextMutation({ objectId: 'S1', mode: 'delete', startIndex: 1, endIndex: 4 })).toEqual([
      { deleteText: { objectId: 'S1', textRange: { type: 'FIXED_RANGE', startIndex: 1, endIndex: 4 } } },
    ])
  })
})

// ---------------------------------------------------------------------------
// P. Compose-path plans over placeholder states
// ---------------------------------------------------------------------------

const COVER_TITLE = 'Alpha One Growth Strategy 2027'
const COVER_SUB = 'Modern premium dark gradient'

function coverInput(extra: Partial<ComposeInput> = {}): ComposeInput {
  return { pageObjectId: 'S1', archetype: 'COVER', title: COVER_TITLE, subtitle: COVER_SUB, ...extra }
}

describe('P: fresh-deck empty placeholders → valid cover plan, zero deleteText', () => {
  it('empty TITLE + BODY: no deleteText, title+subtitle facts present', () => {
    const r = composeSlideOnPage(coverInput(), {
      pageWidthPt: 960,
      pageHeightPt: 540,
      placeholders: [
        { objectId: 'PH_TITLE', type: 'TITLE', text: '' },
        { objectId: 'PH_BODY', type: 'BODY', text: '' },
      ],
    })
    expect(deleteTexts(r.result.requests as Array<Record<string, unknown>>)).toEqual([])
    const texts = insertTexts(r.result.requests as Array<Record<string, unknown>>).join('\n')
    expect(texts).toContain(COVER_TITLE)
    expect(texts).toContain(COVER_SUB)
  })

  it('empty TITLE + SUBTITLE types: no deleteText', () => {
    const r = composeSlideOnPage(coverInput(), {
      pageWidthPt: 960,
      pageHeightPt: 540,
      placeholders: [
        { objectId: 'PH_TITLE', type: 'TITLE', text: '' },
        { objectId: 'PH_SUB', type: 'SUBTITLE', text: '' },
      ],
    })
    expect(deleteTexts(r.result.requests as Array<Record<string, unknown>>)).toEqual([])
  })

  it("newline-only placeholder text '\\n' → no deleteText", () => {
    const r = composeSlideOnPage(coverInput(), {
      pageWidthPt: 960,
      pageHeightPt: 540,
      placeholders: [
        { objectId: 'PH_TITLE', type: 'TITLE', text: '\n' },
        { objectId: 'PH_BODY', type: 'BODY', text: '' },
      ],
    })
    expect(deleteTexts(r.result.requests as Array<Record<string, unknown>>)).toEqual([])
    expect(insertTexts(r.result.requests as Array<Record<string, unknown>>).join('\n')).toContain(COVER_TITLE)
  })

  it('title-only cover (no subtitle input): valid plan, no deleteText', () => {
    const input: ComposeInput = { pageObjectId: 'S1', archetype: 'COVER', title: COVER_TITLE }
    const r = composeSlideOnPage(input, {
      pageWidthPt: 960,
      pageHeightPt: 540,
      placeholders: [{ objectId: 'PH_TITLE', type: 'TITLE', text: '' }],
    })
    expect(deleteTexts(r.result.requests as Array<Record<string, unknown>>)).toEqual([])
    expect(insertTexts(r.result.requests as Array<Record<string, unknown>>).join('\n')).toContain(COVER_TITLE)
  })

  it('no placeholders at all: custom title box, no deleteText', () => {
    const r = composeSlideOnPage(coverInput(), { pageWidthPt: 960, pageHeightPt: 540, placeholders: [] })
    expect(deleteTexts(r.result.requests as Array<Record<string, unknown>>)).toEqual([])
  })

  it('theme/background requests survive the guard (MODERN_GRADIENT)', () => {
    const r = composeSlideOnPage(coverInput(), {
      pageWidthPt: 960,
      pageHeightPt: 540,
      alphaThemeId: 'MODERN_GRADIENT',
      placeholders: [
        { objectId: 'PH_TITLE', type: 'TITLE', text: '' },
        { objectId: 'PH_BODY', type: 'BODY', text: '' },
      ],
    })
    expect(r.result.expected.themeResolved).toBe('MODERN_GRADIENT')
    const bg = (r.result.requests as Array<any>).filter(
      (q) => q.createShape && String(q.createShape.objectId ?? '').includes('_BG_')
    )
    expect(bg.length).toBeGreaterThanOrEqual(2)
  })

  it('plan never leaks visible placeholder hints as facts', () => {
    const r = composeSlideOnPage(coverInput(), {
      pageWidthPt: 960,
      pageHeightPt: 540,
      placeholders: [
        { objectId: 'PH_TITLE', type: 'TITLE', text: '' },
        { objectId: 'PH_BODY', type: 'BODY', text: '' },
      ],
    })
    const blob = JSON.stringify(r.result.requests)
    expect(blob).not.toMatch(/click to add/i)
  })
})

describe('P: non-empty placeholders → valid replacement, no duplication', () => {
  it('non-empty title replaced via delete ALL + insert; old text gone', () => {
    const r = composeSlideOnPage(coverInput(), {
      pageWidthPt: 960,
      pageHeightPt: 540,
      placeholders: [
        { objectId: 'PH_TITLE', type: 'TITLE', text: 'Old Deck Title' },
        { objectId: 'PH_BODY', type: 'BODY', text: 'Old body copy' },
      ],
    })
    const dels = deleteTexts(r.result.requests as Array<Record<string, unknown>>)
    expect(dels.length).toBe(1)
    expect(dels[0]).toEqual({ objectId: 'PH_TITLE', textRange: { type: 'ALL' } })
    const texts = insertTexts(r.result.requests as Array<Record<string, unknown>>)
    expect(texts).toContain(COVER_TITLE)
    expect(texts.some((t) => t.includes('Old Deck Title'))).toBe(false)
  })

  it('every deleteText in multi-archetype plans is type ALL (no FIXED_RANGE risk)', () => {
    const plans: ComposeInput[] = [
      coverInput(),
      { pageObjectId: 'S1', archetype: 'EXECUTIVE_SUMMARY', title: 'Summary', bullets: ['A 10%', 'B 20%'] },
      {
        pageObjectId: 'S1', archetype: 'KPI_DASHBOARD', title: 'KPIs',
        metrics: [{ label: 'ARR', value: '$12M' }, { label: 'NPS', value: '72' }],
      },
    ]
    for (const input of plans) {
      const r = composeSlideOnPage(input, {
        pageWidthPt: 960,
        pageHeightPt: 540,
        placeholders: [
          { objectId: 'PH_TITLE', type: 'TITLE', text: 'Existing Title' },
          { objectId: 'PH_BODY', type: 'BODY', text: 'Existing body' },
        ],
      })
      for (const d of deleteTexts(r.result.requests as Array<Record<string, unknown>>)) {
        expect(d.textRange?.type).toBe('ALL')
      }
    }
  })
})

// ---------------------------------------------------------------------------
// E. Error classification
// ---------------------------------------------------------------------------

describe('E: classifyComposeError', () => {
  const google400 = () => {
    const e = new Error('Invalid requests[8].deleteText: The startIndex 0 must be less than the endIndex 0.') as any
    e.status = 400
    e.code = 400
    return e
  }

  it('write HTTP 400 → REQUEST_VALIDATION, non-retryable, NOT_APPLIED, index parsed', () => {
    const c = classifyComposeError(google400(), 'write', { failedBatch: 0 })
    expect(c.errorClass).toBe('REQUEST_VALIDATION')
    expect(c.retryable).toBe(false)
    expect(c.providerStatus).toBe(400)
    expect(c.failedRequestIndex).toBe(8)
    expect(c.failedRequestType).toBe('deleteText')
    expect(c.failedBatch).toBe(0)
    expect(c.writeOutcome).toBe('NOT_APPLIED')
    expect(c.recommendedAction).toMatch(/do NOT repeat/i)
  })

  it('write HTTP 400 without parseable index → still terminal, no index fields', () => {
    const e = new Error('Invalid request.') as any
    e.status = 400
    const c = classifyComposeError(e, 'write')
    expect(c.errorClass).toBe('REQUEST_VALIDATION')
    expect(c.retryable).toBe(false)
    expect(c.failedRequestIndex).toBeUndefined()
    expect(c.writeOutcome).toBe('NOT_APPLIED')
  })

  it('write 429 → RATE_LIMITED, retryable, UNKNOWN (verify-first)', () => {
    const e = new Error('Quota exceeded.') as any
    e.status = 429
    const c = classifyComposeError(e, 'write')
    expect(c.errorClass).toBe('RATE_LIMITED')
    expect(c.retryable).toBe(true)
    expect(c.writeOutcome).toBe('UNKNOWN')
    expect(c.recommendedAction).toMatch(/slides_get_page FIRST/i)
  })

  it('write 500 → PROVIDER_TRANSIENT, retryable, UNKNOWN', () => {
    const e = new Error('Backend error.') as any
    e.status = 500
    const c = classifyComposeError(e, 'write')
    expect(c.errorClass).toBe('PROVIDER_TRANSIENT')
    expect(c.retryable).toBe(true)
    expect(c.writeOutcome).toBe('UNKNOWN')
  })

  it('write 403 → AUTH, non-retryable, NOT_APPLIED', () => {
    const e = new Error('Forbidden.') as any
    e.status = 403
    const c = classifyComposeError(e, 'write')
    expect(c.errorClass).toBe('AUTH')
    expect(c.retryable).toBe(false)
    expect(c.writeOutcome).toBe('NOT_APPLIED')
  })

  it('inspect 401 → AUTH, non-retryable, NOT_ATTEMPTED', () => {
    const e = new Error('Unauthorized.') as any
    e.status = 401
    const c = classifyComposeError(e, 'inspect')
    expect(c.retryable).toBe(false)
    expect(c.writeOutcome).toBe('NOT_ATTEMPTED')
  })

  it('inspect status 0 → NETWORK, retryable, NOT_ATTEMPTED', () => {
    const e = new Error('timed out.') as any
    e.status = 0
    const c = classifyComposeError(e, 'inspect')
    expect(c.errorClass).toBe('NETWORK')
    expect(c.retryable).toBe(true)
    expect(c.writeOutcome).toBe('NOT_ATTEMPTED')
  })

  it('readback phase → APPLIED_READBACK_UNPROVEN, non-retryable', () => {
    const c = classifyComposeError(new Error('x'), 'readback')
    expect(c.writeOutcome).toBe('APPLIED_READBACK_UNPROVEN')
    expect(c.retryable).toBe(false)
  })

  it('garbage input never throws; yields UNKNOWN', () => {
    expect(() => classifyComposeError(undefined, 'write')).not.toThrow()
    const c = classifyComposeError('weird', 'write')
    expect(c.errorClass).toBe('UNKNOWN')
    expect(c.retryable).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// H. Handler terminal-failure integration (stubbed fetch)
// ---------------------------------------------------------------------------

function okJson(body: unknown): unknown {
  const text = JSON.stringify(body)
  return {
    ok: true, status: 200, statusText: 'OK',
    headers: { get: () => 'application/json' },
    text: async () => text, json: async () => body,
  }
}

function errJson(status: number, message: string): unknown {
  return {
    ok: false, status, statusText: status === 400 ? 'Bad Request' : 'Error',
    headers: { get: () => 'application/json' },
    text: async () => JSON.stringify({ error: { code: status, message } }),
    json: async () => ({ error: { code: status, message } }),
  }
}

interface PostRec { url: string; body: Record<string, unknown> }

function installStub(opts: { postStatus: number; postMessage: string; state: { posts: PostRec[]; pageGets: number } }): void {
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
        opts.state.posts.push({ url: u, body })
        if (opts.postStatus !== 200) return errJson(opts.postStatus, opts.postMessage)
        const requests = ((body?.requests ?? []) as Array<Record<string, unknown>>)
        const replies = requests.map((r) => {
          const key = Object.keys(r)[0]
          const payload = (r as Record<string, any>)[key] ?? {}
          return typeof payload.objectId === 'string' ? { [key]: { objectId: payload.objectId } } : {}
        })
        return okJson({ presentationId: 'PRES_R2', replies })
      }
      if (method === 'GET' && u.includes('/presentations/')) {
        if (u.includes('masters')) return okJson({ masters: [] })
        opts.state.pageGets += 1
        return okJson({
          pageSize: { width: { magnitude: 960, unit: 'PT' }, height: { magnitude: 540, unit: 'PT' } },
          slides: [{ objectId: 'PAGE_R2', pageElements: [] }],
        })
      }
      return okJson({})
    })
  )
}

function textResultOf(result: { content: Array<{ text: string }> }): Record<string, any> {
  return JSON.parse(result.content[0].text) as Record<string, any>
}

describe('H: deterministic batch failure is terminal (single POST, no retry, no fallback)', () => {
  it('HTTP 400 deleteText → retryable:false, NOT_APPLIED, exactly 1 POST, 0 readback', async () => {
    const state = { posts: [] as PostRec[], pageGets: 0 }
    installStub({
      postStatus: 400,
      postMessage: 'Invalid requests[8].deleteText: The startIndex 0 must be less than the endIndex 0.',
      state,
    })
    const out = textResultOf(
      (await handleComposeSlide('TOKEN', {
        presentationId: 'PRES_R2',
        pageObjectId: 'PAGE_R2',
        archetype: 'COVER',
        title: COVER_TITLE,
        subtitle: COVER_SUB,
      })) as any
    )
    expect(state.posts.length).toBe(1)
    expect(out.writeAttemptCount).toBe(1)
    expect(out.readAttempts).toBe(0)
    expect(out.qaPass).toBe(false)
    expect(out.finalStatus).toBe('GEOMETRY_FAILED')
    expect(out.writeOutcome).toBe('NOT_APPLIED')
    expect(out.error.errorClass).toBe('REQUEST_VALIDATION')
    expect(out.error.retryable).toBe(false)
    expect(out.error.providerStatus).toBe(400)
    expect(out.error.failedRequestIndex).toBe(8)
    expect(out.error.failedRequestType).toBe('deleteText')
    expect(out.error.writeOutcome).toBe('NOT_APPLIED')
    // No primitive-fallback advice anywhere in the failure payload.
    const blob = JSON.stringify(out)
    expect(blob).not.toMatch(/slides_create_element|slides_update_element|slides_batch_update/)
    expect(out.error.recommendedAction).toMatch(/do NOT fall back/i)
    // Exactly one page inspection GET (no readback after terminal write failure).
    expect(state.pageGets).toBe(1)
  }, 20000)

  it('HTTP 500 → retryable with UNKNOWN outcome, still a single POST', async () => {
    const state = { posts: [] as PostRec[], pageGets: 0 }
    installStub({ postStatus: 500, postMessage: 'Internal error.', state })
    const out = textResultOf(
      (await handleComposeSlide('TOKEN', {
        presentationId: 'PRES_R2',
        pageObjectId: 'PAGE_R2',
        archetype: 'COVER',
        title: COVER_TITLE,
      })) as any
    )
    expect(state.posts.length).toBe(1)
    expect(out.error.retryable).toBe(true)
    expect(out.writeOutcome).toBe('UNKNOWN')
    expect(out.error.recommendedAction).toMatch(/slides_get_page FIRST/i)
  }, 20000)
})

// ---------------------------------------------------------------------------
// A. Retry-allowance predicate (agent-guidance rule, machine-tested)
// ---------------------------------------------------------------------------

describe('A: isComposeRetryAllowed (one attempt on terminal 400)', () => {
  it('terminal 400 block → false (stop; exactly one compose attempt)', () => {
    expect(
      isComposeRetryAllowed({ retryable: false, writeOutcome: 'NOT_APPLIED' } as any)
    ).toBe(false)
  })
  it('missing error block → false', () => {
    expect(isComposeRetryAllowed(undefined)).toBe(false)
    expect(isComposeRetryAllowed(null as any)).toBe(false)
  })
  it('retryable:true + NOT_APPLIED → true', () => {
    expect(isComposeRetryAllowed({ retryable: true, writeOutcome: 'NOT_APPLIED' } as any)).toBe(true)
  })
  it('retryable:true + NOT_ATTEMPTED → true', () => {
    expect(isComposeRetryAllowed({ retryable: true, writeOutcome: 'NOT_ATTEMPTED' } as any)).toBe(true)
  })
  it('retryable:true + UNKNOWN → false (verify-first, never blind)', () => {
    expect(isComposeRetryAllowed({ retryable: true, writeOutcome: 'UNKNOWN' } as any)).toBe(false)
  })
  it('retryable:true + APPLIED_READBACK_UNPROVEN → false (no rewrite)', () => {
    expect(isComposeRetryAllowed({ retryable: true, writeOutcome: 'APPLIED_READBACK_UNPROVEN' } as any)).toBe(false)
  })
})
