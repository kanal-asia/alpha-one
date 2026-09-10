/**
 * TASK-084 §15: design-system foundation tests (masters/layouts/theme/background/
 * placeholders/z-order/group + theme-color read/write).
 *
 * No Google network traffic: global fetch is stubbed. Live proof happens only in
 * the dedicated smoke phase (Phase 14+).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleGetPage,
  handleUpdatePage,
  handleCreateSlide,
  handleBatchUpdate,
  buildUpdatePageBackground,
  buildCreateSlide,
  buildZOrder,
  buildGroupObjects,
  buildUpdateTextStyle,
  buildUpdateShapeStyle,
  buildBatchOperation,
  fetchPageKindMap,
  validateGroupChildren,
  validateZOrderTargets,
  projectColorRef,
  projectPageBackground,
  projectPageElement,
  asThemeColor,
  THEME_COLORS,
  ZORDER_OPERATIONS,
} from './visual'

import { getPresentation, projectColorScheme } from './server'

const TOKEN = 'TEST_TOKEN'
const PRES = 'PRES_DESIGN_001'
const SLIDE = 'SLIDE_DS_01'
const LAYOUT = 'LAYOUT_DS_01'
const MASTER = 'MASTER_DS_01'

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

interface SeenCall {
  url: string
  method: string
  body: Record<string, unknown> | undefined
}

let seen: SeenCall[]

function stubFetch(impl: (url: string, init: RequestInit) => unknown): void {
  seen = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      let body: Record<string, unknown> | undefined
      try {
        body = init.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined
      } catch {
        body = undefined
      }
      seen.push({ url: String(url), method: init.method ?? 'GET', body })
      return impl(String(url), init)
    })
  )
}

function batchEcho(url: string, body?: Record<string, unknown>): unknown {
  const requests = ((body?.requests ?? []) as Array<Record<string, unknown>>)
  const replies = requests.map((r) => {
    if ('createSlide' in r) return { createSlide: { objectId: 'SLIDE_NEW_1' } }
    if ('groupObjects' in r) return {}
    if ('updatePageElementsZOrder' in r) return {}
    if ('updatePageProperties' in r) return {}
    return {}
  })
  return okJson({ presentationId: PRES, replies })
}

const EMU_PT = 12700

function designDeck(): Record<string, unknown> {
  return {
    presentationId: PRES,
    title: 'Design Deck',
    revisionId: 'REV9',
    pageSize: { width: { magnitude: 9144000, unit: 'EMU' }, height: { magnitude: 5143500, unit: 'EMU' } },
    masters: [
      {
        objectId: MASTER,
        masterProperties: { displayName: 'Brand Master' },
        pageProperties: {
          colorScheme: {
            colors: [
              { type: 'ACCENT1', color: { rgbColor: { red: 1, green: 0, blue: 0 } } },
              { type: 'BACKGROUND1', color: { rgbColor: { red: 1, green: 1, blue: 1 } } },
              { type: 'TEXT1', color: { rgbColor: { red: 0.1, green: 0.1, blue: 0.1 } } },
            ],
          },
        },
      },
    ],
    layouts: [
      {
        objectId: LAYOUT,
        layoutProperties: { masterObjectId: MASTER, name: 'TITLE_AND_BODY', displayName: 'Title and Body' },
        pageElements: [
          { objectId: 'PH_TITLE', shape: { shapeType: 'TEXT_BOX', placeholder: { type: 'TITLE', index: 0 } } },
          { objectId: 'PH_BODY', shape: { shapeType: 'TEXT_BOX', placeholder: { type: 'BODY', index: 1, parentObjectId: 'PH_TITLE' } } },
        ],
      },
    ],
    slides: [
      {
        objectId: SLIDE,
        slideProperties: { layoutObjectId: LAYOUT, masterObjectId: MASTER },
        pageProperties: {
          pageBackgroundFill: { solidFill: { color: { rgbColor: { red: 0.05, green: 0.05, blue: 0.08 } } } },
        },
        pageElements: [
          {
            objectId: 'TITLE_1',
            size: { width: { magnitude: 600 * EMU_PT }, height: { magnitude: 80 * EMU_PT } },
            transform: { scaleX: 1, scaleY: 1, translateX: 50 * EMU_PT, translateY: 30 * EMU_PT },
            shape: {
              shapeType: 'TEXT_BOX',
              placeholder: { type: 'TITLE', index: 0 },
              text: { textElements: [{ textRun: { content: 'Deck Title', style: { bold: true, foregroundColor: { opaqueColor: { themeColor: 'TEXT1' } } } } }] },
            },
          },
          {
            objectId: 'RECT_1',
            size: { width: { magnitude: 200 * EMU_PT }, height: { magnitude: 100 * EMU_PT } },
            transform: { scaleX: 1, scaleY: 1, translateX: 50 * EMU_PT, translateY: 150 * EMU_PT },
            shape: {
              shapeType: 'RECTANGLE',
              shapeProperties: {
                shapeBackgroundFill: { solidFill: { color: { themeColor: 'ACCENT1' } } },
              },
            },
          },
          {
            objectId: 'LINE_1',
            size: { width: { magnitude: 300 * EMU_PT }, height: { magnitude: 1 * EMU_PT } },
            transform: { scaleX: 1, scaleY: 1, translateX: 50 * EMU_PT, translateY: 270 * EMU_PT },
            line: { lineCategory: 'STRAIGHT' },
          },
        ],
      },
    ],
  }
}

function textOf(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// §15.1 inspection
// ---------------------------------------------------------------------------

describe('design-system inspection (§15.1)', () => {
  it('presentation exposes masters with theme palette', async () => {
    stubFetch(() => okJson(designDeck()))
    const out = textOf(await getPresentation(TOKEN, { presentationId: PRES }))
    const masters = out.masters as Array<Record<string, unknown>>
    expect(masters).toHaveLength(1)
    expect(masters[0]).toMatchObject({ objectId: MASTER, displayName: 'Brand Master' })
    expect(masters[0].theme).toMatchObject({ ACCENT1: '#FF0000', BACKGROUND1: '#FFFFFF' })
  })
  it('presentation exposes layouts with master linkage + placeholders', async () => {
    stubFetch(() => okJson(designDeck()))
    const out = textOf(await getPresentation(TOKEN, { presentationId: PRES }))
    const layouts = out.layouts as Array<Record<string, unknown>>
    expect(layouts).toHaveLength(1)
    expect(layouts[0]).toMatchObject({ objectId: LAYOUT, masterObjectId: MASTER, displayName: 'Title and Body' })
    expect(layouts[0].placeholders).toEqual([
      { objectId: 'PH_TITLE', type: 'TITLE', index: 0 },
      { objectId: 'PH_BODY', type: 'BODY', index: 1 },
    ])
  })
  it('page exposes layout/master IDs + native background', async () => {
    stubFetch(() => okJson(designDeck()))
    const out = textOf(await handleGetPage(TOKEN, { presentationId: PRES, pageObjectId: SLIDE }))
    expect(out).toMatchObject({ layoutObjectId: LAYOUT, masterObjectId: MASTER })
    expect(out.pageBackground).toMatchObject({ fillHex: '#0D0D14' })
  })
  it('elements carry placeholder, zIndex (derived), theme refs', async () => {
    stubFetch(() => okJson(designDeck()))
    const out = textOf(await handleGetPage(TOKEN, { presentationId: PRES, pageObjectId: SLIDE }))
    const els = out.elements as Array<Record<string, unknown>>
    expect(els.map((e) => e.zIndex)).toEqual([0, 1, 2])
    expect(els.every((e) => e.zIndexDerived === true)).toBe(true)
    expect(els[0]).toMatchObject({ placeholder: { type: 'TITLE', index: 0 } })
    const runs = ((els[0].text ?? {}) as Record<string, unknown>).runs as Array<Record<string, unknown>>
    expect(runs[0]).toMatchObject({ themeColor: 'TEXT1' })
    expect(els[1]).toMatchObject({ fill: { themeColor: 'ACCENT1' } })
    expect(els[1]).not.toHaveProperty('fillHex')
  })
  it('projectColorScheme maps theme keys, skips incomplete entries', () => {
    expect(
      projectColorScheme({ colors: [{ type: 'ACCENT1', color: { rgbColor: { red: 1, green: 0, blue: 0 } } }, { type: 'X' }] })
    ).toEqual({ ACCENT1: '#FF0000' })
    expect(projectColorScheme(undefined)).toBeNull()
    expect(projectColorScheme({ colors: [] })).toBeNull()
  })
  it('projectPageBackground handles theme + absent', () => {
    expect(projectPageBackground(undefined)).toBeNull()
    expect(projectPageBackground({})).toBeNull()
    expect(
      projectPageBackground({ pageBackgroundFill: { solidFill: { color: { themeColor: 'BACKGROUND1' } } } })
    ).toEqual({ themeColor: 'BACKGROUND1' })
  })
  it('group projection carries children IDs (elementGroup key)', () => {
    const projected = projectPageElement(
      {
        objectId: 'G1',
        elementGroup: {
          children: [
            { objectId: 'A', shape: { shapeType: 'RECTANGLE' } },
            { objectId: 'B', shape: { shapeType: 'ELLIPSE' } },
          ],
        },
      },
      3
    )
    expect(projected).toMatchObject({ kind: 'group', zIndex: 3, zIndexDerived: true })
    expect((projected.group as Record<string, unknown>).children).toEqual(['A', 'B'])
    const members = (projected.group as Record<string, unknown>).members as Array<Record<string, unknown>>
    expect(members.map((m) => m.objectId)).toEqual(['A', 'B'])
    expect(members[0]).toMatchObject({ kind: 'shape', shapeType: 'RECTANGLE' })
  })
  it('legacy group key no longer masks as group (docs: elementGroup)', () => {
    expect(projectPageElement({ objectId: 'X', group: {} } as never)).toMatchObject({ kind: 'unknown' })
  })
  it('projectColorRef preserves theme, maps rgb, nulls empty', () => {
    expect(projectColorRef({ themeColor: 'ACCENT2' })).toEqual({ themeColor: 'ACCENT2' })
    expect(projectColorRef({ rgbColor: { red: 0, green: 0, blue: 1 } })).toEqual({ fillHex: '#0000FF' })
    expect(projectColorRef(undefined)).toBeNull()
    expect(projectColorRef({})).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// §15.2 theme colors
// ---------------------------------------------------------------------------

describe('theme colors (§15.2)', () => {
  it('THEME_COLORS covers the official 16 keys, rejects others', () => {
    expect(THEME_COLORS).toHaveLength(16)
    expect(asThemeColor('ACCENT1', 'x')).toBe('ACCENT1')
    expect(() => asThemeColor('NEON_PINK', 'x')).toThrow(/must be one of/)
    expect(() => asThemeColor('THEME_COLOR_TYPE_UNSPECIFIED', 'x')).toThrow(/must be one of/)
  })
  it('text theme color builds OptionalColor envelope, exclusive with hex', () => {
    const r = buildUpdateTextStyle({ objectId: 'S1', style: { colorTheme: 'TEXT1' } })
    const u = (r as Record<string, Record<string, unknown>>).updateTextStyle
    expect(u.fields).toBe('foregroundColor')
    const style = u.style as Record<string, unknown>
    expect(style.foregroundColor).toEqual({ opaqueColor: { themeColor: 'TEXT1' } })
  })
  it('shape fill theme uses direct OpaqueColor (no opaqueColor nesting bug)', async () => {
    stubFetch((url, init) => {
      if (String(url).includes(':batchUpdate')) return batchEcho(String(url), JSON.parse((init.body as string) ?? '{}'))
      return okJson(designDeck())
    })
    const { handleUpdateElement } = await import('./visual')
    const out = textOf(
      await handleUpdateElement(TOKEN, { presentationId: PRES, objectId: 'RECT_1', family: 'shapeStyle', fillThemeColor: 'ACCENT2' })
    )
    expect(out).toMatchObject({ family: 'shapeStyle' })
    const body = seen.find((c) => c.url.includes(':batchUpdate'))?.body
    const req = ((body?.requests ?? []) as Array<Record<string, unknown>>)[0]
    const props = ((req.updateShapeProperties ?? {}) as Record<string, unknown>).shapeProperties as Record<string, unknown>
    expect(props).toEqual({ shapeBackgroundFill: { solidFill: { color: { themeColor: 'ACCENT2' } } } })
  })
  it('outline theme color builds direct envelope', () => {
    const r = buildUpdateShapeStyle({ objectId: 'S', style: { outlineThemeColor: 'TEXT1', outlineWeightPt: 1 } })
    const props = (r as Record<string, Record<string, unknown>>).updateShapeProperties.shapeProperties as Record<string, unknown>
    expect(props).toEqual({
      outline: { outlineFill: { solidFill: { color: { themeColor: 'TEXT1' } } }, weight: { magnitude: 12700, unit: 'EMU' } },
    })
  })
  it('mutual exclusivity enforced (hex XOR theme)', async () => {
    const { handleUpdateElement } = await import('./visual')
    stubFetch(() => okJson(designDeck()))
    await expect(
      handleUpdateElement(TOKEN, { presentationId: PRES, objectId: 'R', family: 'textStyle', colorHex: '#FFF', colorTheme: 'TEXT1' })
    ).rejects.toThrow(/mutually exclusive/)
    await expect(
      handleUpdateElement(TOKEN, { presentationId: PRES, objectId: 'R', family: 'shapeStyle', fillHex: '#FFF', fillThemeColor: 'ACCENT1' })
    ).rejects.toThrow(/mutually exclusive/)
  })
})

// ---------------------------------------------------------------------------
// §15.3 page background
// ---------------------------------------------------------------------------

describe('page background (§15.3)', () => {
  it('literal background builds exact body + mask', async () => {
    stubFetch((url, init) => {
      if (String(url).includes(':batchUpdate')) return batchEcho(String(url), JSON.parse((init.body as string) ?? '{}'))
      return okJson(designDeck())
    })
    const { handleUpdatePage } = await import('./visual')
    const out = textOf(await handleUpdatePage(TOKEN, { presentationId: PRES, pageObjectId: SLIDE, backgroundHex: '#111827' }))
    expect(out).toMatchObject({ pageObjectId: SLIDE, background: { fillHex: '#111827' } })
    const body = seen.find((c) => c.url.includes(':batchUpdate'))?.body
    const req = ((body?.requests ?? []) as Array<Record<string, unknown>>)[0]
    expect(req).toEqual({
      updatePageProperties: {
        objectId: SLIDE,
        pageProperties: { pageBackgroundFill: { solidFill: { color: { rgbColor: { red: 0.0667, green: 0.0941, blue: 0.1529 } } } } },
        fields: 'pageBackgroundFill.solidFill.color',
      },
    })
  })
  it('theme background builds theme envelope', () => {
    const r = buildUpdatePageBackground('SL1', { backgroundThemeColor: 'BACKGROUND1' })
    expect(r).toEqual({
      updatePageProperties: {
        objectId: 'SL1',
        pageProperties: { pageBackgroundFill: { solidFill: { color: { themeColor: 'BACKGROUND1' } } } },
        fields: 'pageBackgroundFill.solidFill.color',
      },
    })
  })
  it('conflicting/empty inputs rejected', async () => {
    const { handleUpdatePage } = await import('./visual')
    stubFetch(() => okJson(designDeck()))
    await expect(
      handleUpdatePage(TOKEN, { presentationId: PRES, pageObjectId: SLIDE, backgroundHex: '#FFF', backgroundThemeColor: 'ACCENT1' })
    ).rejects.toThrow(/mutually exclusive/)
    await expect(handleUpdatePage(TOKEN, { presentationId: PRES, pageObjectId: SLIDE })).rejects.toThrow(/requires backgroundHex/)
  })
})

// ---------------------------------------------------------------------------
// §15.4 layout-aware creation
// ---------------------------------------------------------------------------

describe('layout-aware creation (§15.4)', () => {
  it('layoutId builds reference + mappings; blank stays blank', async () => {
    stubFetch((url, init) => {
      if (String(url).includes(':batchUpdate')) return batchEcho(String(url), JSON.parse((init.body as string) ?? '{}'))
      return okJson(designDeck())
    })
    const { handleCreateSlide } = await import('./visual')
    const out = textOf(
      await handleCreateSlide(TOKEN, {
        presentationId: PRES,
        layoutId: LAYOUT,
        slideObjectId: 'SLIDE_NEW_X',
        insertionIndex: 2,
        placeholderMappings: [{ layoutPlaceholderObjectId: 'PH_TITLE', slidePlaceholderObjectId: 'TITLE_X' }],
      })
    )
    expect(out).toMatchObject({ slideObjectId: 'SLIDE_NEW_1', layoutId: LAYOUT })
    const body = seen.find((c) => c.url.includes(':batchUpdate'))?.body
    const req = ((body?.requests ?? []) as Array<Record<string, unknown>>)[0]
    expect(req).toEqual({
      createSlide: {
        objectId: 'SLIDE_NEW_X',
        insertionIndex: 2,
        slideLayoutReference: { layoutId: LAYOUT },
        placeholderIdMappings: [{ layoutPlaceholderObjectId: 'PH_TITLE', objectId: 'TITLE_X' }],
      },
    })
  })
  it('blank creation unchanged (no layout key)', () => {
    expect(buildCreateSlide({})).toEqual({ createSlide: {} })
  })
  it('mappings without layout + bad IDs rejected', async () => {
    const { handleCreateSlide } = await import('./visual')
    stubFetch(() => okJson(designDeck()))
    await expect(handleCreateSlide(TOKEN, { presentationId: PRES, placeholderMappings: [] })).rejects.toThrow(/requires layoutId/)
    await expect(handleCreateSlide(TOKEN, { presentationId: PRES, layoutId: 'bad id!!' })).rejects.toThrow(/malformed/)
  })
})

// ---------------------------------------------------------------------------
// §15.5 placeholder targeting
// ---------------------------------------------------------------------------

describe('placeholder targeting (§15.5)', () => {
  it('title/body placeholders identified with parents', async () => {
    stubFetch(() => okJson(designDeck()))
    const out = textOf(await handleGetPage(TOKEN, { presentationId: PRES, pageObjectId: SLIDE }))
    const els = out.elements as Array<Record<string, unknown>>
    expect(els[0]).toMatchObject({ objectId: 'TITLE_1', placeholder: { type: 'TITLE', index: 0 } })
  })
  it('existing text update targets placeholder ID directly (no replacement)', async () => {
    stubFetch((url, init) => {
      if (String(url).includes(':batchUpdate')) return batchEcho(String(url), JSON.parse((init.body as string) ?? '{}'))
      return okJson(designDeck())
    })
    const { handleUpdateElement } = await import('./visual')
    const out = textOf(await handleUpdateElement(TOKEN, { presentationId: PRES, objectId: 'TITLE_1', family: 'text', mode: 'set', text: 'New Title' }))
    expect(out).toMatchObject({ objectId: 'TITLE_1', family: 'text' })
    const body = seen.find((c) => c.url.includes(':batchUpdate'))?.body
    const reqs = (body?.requests ?? []) as Array<Record<string, unknown>>
    expect(reqs).toHaveLength(2) // delete ALL + insert — same object, no new textbox
    expect(reqs[0]).toHaveProperty('deleteText')
  })
})

// ---------------------------------------------------------------------------
// §15.6 z-order
// ---------------------------------------------------------------------------

describe('z-order (§15.6)', () => {
  it('each enum builds exact payload', () => {
    for (const op of ZORDER_OPERATIONS) {
      expect(buildZOrder(['A', 'B'], op)).toEqual({
        updatePageElementsZOrder: { pageElementObjectIds: ['A', 'B'], operation: op },
      })
    }
    expect(ZORDER_OPERATIONS).toHaveLength(4)
  })
  it('empty list + bad op rejected', () => {
    expect(() => buildZOrder([], 'BRING_TO_FRONT')).toThrow(/non-empty/)
    expect(() => buildZOrder(['A'], 'TO_THE_MOON')).toThrow(/must be one of/)
  })
  it('batch zorder validates page context (unknown ID rejected, no mutation)', async () => {
    stubFetch((url) => {
      if (String(url).includes(':batchUpdate')) return batchEcho(String(url), {})
      return okJson(designDeck())
    })
    const { handleBatchUpdate } = await import('./visual')
    await expect(
      handleBatchUpdate(TOKEN, { presentationId: PRES, operations: [{ op: 'zorder', pageObjectId: SLIDE, objectIds: ['GHOST'], operation: 'BRING_TO_FRONT' }] })
    ).rejects.toThrow(/not a top-level element/)
    expect(seen.filter((c) => c.url.includes(':batchUpdate'))).toHaveLength(0)
  })
  it('batch zorder success preserves order', async () => {
    stubFetch((url, init) => {
      if (String(url).includes(':batchUpdate')) return batchEcho(String(url), JSON.parse((init.body as string) ?? '{}'))
      return okJson(designDeck())
    })
    const { handleBatchUpdate } = await import('./visual')
    const out = textOf(
      await handleBatchUpdate(TOKEN, { presentationId: PRES, operations: [{ op: 'zorder', pageObjectId: SLIDE, objectIds: ['LINE_1', 'RECT_1'], operation: 'SEND_TO_BACK' }] })
    )
    expect(out).toMatchObject({ operations: 1, appliedRequests: 1 })
    const body = seen.find((c) => c.url.includes(':batchUpdate'))?.body
    const req = ((body?.requests ?? []) as Array<Record<string, unknown>>)[0]
    expect(req).toEqual({ updatePageElementsZOrder: { pageElementObjectIds: ['LINE_1', 'RECT_1'], operation: 'SEND_TO_BACK' } })
  })
  it('validateZOrderTargets rejects groups', () => {
    const kinds = new Map([['G', { kind: 'group', isPlaceholder: false }]])
    expect(() => validateZOrderTargets(['G'], kinds, 't')).toThrow(/group/)
  })
})

// ---------------------------------------------------------------------------
// §15.7 group
// ---------------------------------------------------------------------------

describe('group (§15.7)', () => {
  it('valid 2+ build with mapping preserved', async () => {
    stubFetch((url, init) => {
      if (String(url).includes(':batchUpdate')) return batchEcho(String(url), JSON.parse((init.body as string) ?? '{}'))
      return okJson(designDeck())
    })
    const { handleBatchUpdate } = await import('./visual')
    const out = textOf(
      await handleBatchUpdate(TOKEN, { presentationId: PRES, operations: [{ op: 'group', pageObjectId: SLIDE, childObjectIds: ['RECT_1', 'LINE_1'], groupObjectId: 'GRP_1' }] })
    )
    expect(out).toMatchObject({ operations: 1, appliedRequests: 1 })
    const body = seen.find((c) => c.url.includes(':batchUpdate'))?.body
    expect(((body?.requests ?? []) as Array<Record<string, unknown>>)[0]).toEqual({
      groupObjects: { groupObjectId: 'GRP_1', childrenObjectIds: ['RECT_1', 'LINE_1'] },
    })
  })
  it('single element + placeholder + table rejected, no mutation', async () => {
    stubFetch((url) => {
      if (String(url).includes(':batchUpdate')) return batchEcho(String(url), {})
      return okJson({
        ...designDeck(),
        slides: [
          {
            ...(designDeck().slides as Array<Record<string, unknown>>)[0],
            pageElements: [
              ...(((designDeck().slides as Array<Record<string, unknown>>)[0].pageElements ?? []) as Array<Record<string, unknown>>),
              { objectId: 'TBL_X', table: { rows: 1, columns: 1 } },
            ],
          },
        ],
      })
    })
    const { handleBatchUpdate } = await import('./visual')
    await expect(
      handleBatchUpdate(TOKEN, { presentationId: PRES, operations: [{ op: 'group', pageObjectId: SLIDE, childObjectIds: ['RECT_1'] }] })
    ).rejects.toThrow(/at least two/)
    await expect(
      handleBatchUpdate(TOKEN, { presentationId: PRES, operations: [{ op: 'group', pageObjectId: SLIDE, childObjectIds: ['TITLE_1', 'RECT_1'] }] })
    ).rejects.toThrow(/placeholder/)
    await expect(
      handleBatchUpdate(TOKEN, { presentationId: PRES, operations: [{ op: 'group', pageObjectId: SLIDE, childObjectIds: ['RECT_1', 'TBL_X'] }] })
    ).rejects.toThrow(/table/)
    expect(seen.filter((c) => c.url.includes(':batchUpdate'))).toHaveLength(0)
  })
  it('buildGroupObjects exact payload', () => {
    expect(buildGroupObjects(['A', 'B'])).toEqual({ groupObjects: { childrenObjectIds: ['A', 'B'] } })
    expect(() => buildGroupObjects(['A'])).toThrow(/at least two/)
  })
  it('validateGroupChildren rejects nested/group kinds', () => {
    const kinds = new Map([
      ['G', { kind: 'group', isPlaceholder: false }],
      ['P', { kind: 'shape', isPlaceholder: true }],
    ])
    expect(() => validateGroupChildren(['G', 'X'], kinds, 't')).toThrow()
    expect(() => validateGroupChildren(['P', 'X'], kinds, 't')).toThrow(/placeholder/)
  })
})
