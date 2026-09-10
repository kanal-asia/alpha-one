/**
 * TASK-082: Google Slides MCP visual-editing capability tests.
 *
 * No Google network traffic: global fetch is stubbed; request construction,
 * validation, reply propagation, and legacy regression are proven against the
 * stub. Live Google proof happens only in the dedicated smoke phase.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  handleGetPage,
  handleCreateElement,
  handleUpdateElement,
  handleDeleteObject,
  handleDuplicateObject,
  handleBatchUpdate,
  buildCreateTextBox,
  buildCreateShape,
  buildCreateImage,
  buildCreateLine,
  buildCreateTable,
  buildTextMutation,
  buildUpdateTextStyle,
  buildUpdateParagraphStyle,
  buildUpdateShapeStyle,
  buildDeleteObject,
  buildDuplicateObject,
  buildUpdateElementRequests,
  buildBatchOperation,
  extractReplyObjectIds,
  projectPageElement,
  rgbFromHex,
  hexFromRgb,
  emuFromPt,
  ptFromEmu,
  elementProperties,
  EMU_PER_PT,
  MAX_BATCH_OPS,
  type GoogleRequest,
} from './visual'
import { getPresentation, listPresentations, createPresentation, updatePresentation } from './server'

const TOKEN = 'TEST_TOKEN'
const PRES = 'PRES_1234567890abcdef'
const SLIDE = 'SLIDE_001'

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

function errJson(status: number, body: unknown): unknown {
  const text = JSON.stringify(body)
  return {
    ok: false,
    status,
    statusText: 'Error',
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

function stubFetch(impl?: (url: string, init: RequestInit) => unknown): void {
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
      if (impl) return impl(String(url), init)
      return defaultImpl(String(url), body)
    })
  )
}

function defaultImpl(url: string, body?: Record<string, unknown>): unknown {
  if (url.includes(':batchUpdate')) {
    const requests = (body?.requests ?? []) as GoogleRequest[]
    const replies = requests.map((r) => {
      if ('createSlide' in r) return { createSlide: { objectId: 'SLIDE_NEW' } }
      const key = ['createShape', 'createImage', 'createLine', 'createTable'].find((k) => k in r)
      if (key) {
        const oid = ((r[key] as Record<string, unknown>).objectId as string) ?? 'OBJ_NEW'
        return { [key]: { objectId: oid } }
      }
      if ('duplicateObject' in r) return { duplicateObject: { objectId: 'COPY_1' } }
      return {}
    })
    return okJson({ presentationId: PRES, replies })
  }
  if (url.includes('/presentations/') && !url.includes('/presentations?') && !url.includes('drive')) {
    return okJson(pageFixture())
  }
  if (url === 'https://slides.googleapis.com/v1/presentations') {
    return okJson({ presentationId: 'NEW_PRES', title: 'T' })
  }
  if (url.includes('drive/v3/files')) {
    return okJson({ files: [{ id: 'P1', name: 'Deck', modifiedTime: '2026-01-01T00:00:00Z' }] })
  }
  return okJson({})
}

const EMU1PT = EMU_PER_PT

function shapeElement(): Record<string, unknown> {
  return {
    objectId: 'SHAPE_1',
    size: { width: { magnitude: 4 * EMU1PT }, height: { magnitude: 2 * EMU1PT } },
    transform: { scaleX: 1, scaleY: 1, translateX: 72 * EMU1PT, translateY: 36 * EMU1PT },
    shape: {
      shapeType: 'RECTANGLE',
      text: {
        textElements: [
          { textRun: { content: 'Hello ', style: { bold: true, fontFamily: 'Arial', fontSize: { magnitude: 18, unit: 'PT' }, foregroundColor: { opaqueColor: { rgbColor: { red: 1, green: 0, blue: 0 } } } } } },
          { textRun: { content: 'World', style: { italic: true } } },
        ],
      },
      shapeProperties: {
        shapeBackgroundFill: { solidFill: { color: { rgbColor: { red: 0, green: 0, blue: 1 } } } },
        outline: { outlineFill: { solidFill: { color: { rgbColor: { red: 0, green: 0, blue: 0 } } } }, weight: { magnitude: 1 * EMU1PT } },
      },
    },
  }
}

function pageFixture(): Record<string, unknown> {
  return {
    presentationId: PRES,
    title: 'Deck',
    revisionId: 'REV1',
    slides: [
      {
        objectId: SLIDE,
        pageElements: [
          shapeElement(),
          {
            objectId: 'IMG_1',
            size: { width: { magnitude: 5 * EMU1PT }, height: { magnitude: 3 * EMU1PT } },
            transform: { scaleX: 1, scaleY: 1, translateX: 10 * EMU1PT, translateY: 10 * EMU1PT },
            description: 'Alt text here',
            image: { contentUrl: 'https://example.com/a.png', sourceUrl: 'https://example.com/a.png' },
          },
          {
            objectId: 'TBL_1',
            size: { width: { magnitude: 6 * EMU1PT }, height: { magnitude: 2 * EMU1PT } },
            transform: { scaleX: 1, scaleY: 1, translateX: 0, translateY: 200 * EMU1PT },
            table: { rows: 2, columns: 3 },
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
// Converters (unit safety, centralized)
// ---------------------------------------------------------------------------

describe('converters', () => {
  it('PT<->EMU round-trips deterministically', () => {
    expect(EMU_PER_PT).toBe(12700)
    expect(emuFromPt(72)).toBe(72 * 12700)
    expect(ptFromEmu(72 * 12700)).toBe(72)
  })
  it('hex color converts both ways', () => {
    expect(rgbFromHex('#FF0000')).toEqual({ red: 1, green: 0, blue: 0 })
    expect(rgbFromHex('#2563eb')).toEqual({ red: 0.1451, green: 0.3882, blue: 0.9216 })
    expect(hexFromRgb({ red: 0, green: 0, blue: 1 })).toBe('#0000FF')
    expect(hexFromRgb(undefined)).toBeUndefined()
  })
  it('element properties use absolute EMU geometry', () => {
    const p = elementProperties('SL1', { x: 72, y: 36, width: 100, height: 50 })
    expect(p.transform.translateX).toBe(72 * 12700)
    expect(p.size.width).toEqual({ magnitude: 100 * 12700, unit: 'EMU' })
  })
})

// ---------------------------------------------------------------------------
// Read: 1-6
// ---------------------------------------------------------------------------

describe('slides_get_page (read 1-6)', () => {
  it('returns objectIds for every element', async () => {
    stubFetch()
    const out = textOf(await handleGetPage(TOKEN, { presentationId: PRES, pageObjectId: SLIDE }))
    const els = out.elements as Array<Record<string, unknown>>
    expect(out.pageObjectId).toBe(SLIDE)
    expect(els.map((e) => e.objectId)).toEqual(['SHAPE_1', 'IMG_1', 'TBL_1'])
  })
  it('returns geometry (size + transform) in PT and EMU', async () => {
    stubFetch()
    const out = textOf(await handleGetPage(TOKEN, { presentationId: PRES, pageObjectId: SLIDE }))
    const shape = (out.elements as Array<Record<string, unknown>>)[0]
    expect(shape.size).toMatchObject({ widthPt: 4, heightPt: 2 })
    expect(shape.transform).toMatchObject({ xPt: 72, yPt: 36, scaleX: 1, scaleY: 1 })
  })
  it('returns text content, runs and styles', async () => {
    stubFetch()
    const out = textOf(await handleGetPage(TOKEN, { presentationId: PRES, pageObjectId: SLIDE }))
    const text = ((out.elements as Array<Record<string, unknown>>)[0].text ?? {}) as Record<string, unknown>
    expect(text.content).toBe('Hello World')
    const runs = text.runs as Array<Record<string, unknown>>
    expect(runs).toHaveLength(2)
    expect(runs[0]).toMatchObject({ bold: true, fontFamily: 'Arial', fontSizePt: 18, colorHex: '#FF0000' })
    expect(runs[1]).toMatchObject({ italic: true })
  })
  it('preserves shape/image/table metadata (no collapse to counts)', async () => {
    stubFetch()
    const out = textOf(await handleGetPage(TOKEN, { presentationId: PRES, pageObjectId: SLIDE }))
    const els = out.elements as Array<Record<string, unknown>>
    expect(els[0]).toMatchObject({ kind: 'shape', shapeType: 'RECTANGLE', fillHex: '#0000FF' })
    expect(els[0]).toHaveProperty('outline')
    expect(els[1]).toMatchObject({ kind: 'image', altText: 'Alt text here' })
    expect((els[1].image as Record<string, unknown>).contentUrl).toBe('https://example.com/a.png')
    expect(els[2]).toMatchObject({ kind: 'table', table: { rows: 2, columns: 3 } })
  })
  it('rejects unknown pageObjectId', async () => {
    stubFetch()
    await expect(handleGetPage(TOKEN, { presentationId: PRES, pageObjectId: 'NOPE' })).rejects.toThrow(/pageObjectId/)
  })
  it('readback parses real API fill envelope incl. solid red (F03/F06 parity)', async () => {
    stubFetch((url) => {
      if (String(url).includes(':batchUpdate')) {
        return okJson({ presentationId: PRES, replies: [{}] })
      }
      return okJson({
        presentationId: PRES,
        title: 'Deck',
        revisionId: 'REV2',
        slides: [
          {
            objectId: SLIDE,
            pageElements: [
              {
                objectId: 'SHAPE_1788873845670_556224',
                size: { width: { magnitude: 200 * EMU1PT }, height: { magnitude: 100 * EMU1PT } },
                transform: { scaleX: 1, scaleY: 1, translateX: 50 * EMU1PT, translateY: 50 * EMU1PT },
                shape: {
                  shapeType: 'RECTANGLE',
                  shapeProperties: {
                    shapeBackgroundFill: { solidFill: { color: { rgbColor: { red: 1, green: 0, blue: 0 } } } },
                  },
                },
              },
            ],
          },
        ],
      })
    })
    const out = textOf(await handleGetPage(TOKEN, { presentationId: PRES, pageObjectId: SLIDE }))
    const els = out.elements as Array<Record<string, unknown>>
    expect(els).toHaveLength(1)
    expect(els[0]).toMatchObject({ objectId: 'SHAPE_1788873845670_556224', kind: 'shape', fillHex: '#FF0000' })
  })
  it('projection never invents values for sparse elements', () => {
    const p = projectPageElement({ objectId: 'X' })
    expect(p).toEqual({ objectId: 'X', kind: 'unknown' })
  })
})

// ---------------------------------------------------------------------------
// Creation: 7-13
// ---------------------------------------------------------------------------

describe('creation builders (7-13)', () => {
  it('textBox builds createShape + insertText with custom geometry', () => {
    const r = buildCreateTextBox({
      pageObjectId: SLIDE,
      text: 'Hi',
      rect: { x: 10, y: 20, width: 300, height: 60 },
      objectId: 'TB1',
    })
    expect(r.createdId).toBe('TB1')
    expect(r.requests).toHaveLength(2)
    const shape = (r.requests[0] as Record<string, Record<string, unknown>>).createShape as Record<string, unknown>
    expect(shape.shapeType).toBe('TEXT_BOX')
    expect((shape.elementProperties as Record<string, unknown>).pageObjectId).toBe(SLIDE)
    expect(r.requests[1]).toEqual({ insertText: { objectId: 'TB1', insertionIndex: 0, text: 'Hi' } })
  })
  it('shape builds requested type with fill/outline/text', () => {
    const r = buildCreateShape({
      pageObjectId: SLIDE,
      shapeType: 'ELLIPSE',
      rect: { x: 0, y: 0, width: 50, height: 50 },
      fillHex: '#FFFFFF',
      outlineHex: '#111111',
      outlineWeightPt: 2,
      text: 'Cap',
    })
    const reqs = r.requests.map((q) => Object.keys(q)[0])
    expect(reqs).toEqual(['createShape', 'updateShapeProperties', 'insertText'])
    const style = (r.requests[1] as Record<string, Record<string, unknown>>).updateShapeProperties
    expect(style.fields).toBe('shapeBackgroundFill.solidFill.color,outline.outlineFill.solidFill.color,outline.weight')
  })
  it('image builds URL create with http validation at handler level', async () => {
    stubFetch()
    const out = textOf(
      await handleCreateElement(TOKEN, {
        presentationId: PRES,
        pageObjectId: SLIDE,
        type: 'image',
        imageUrl: 'https://example.com/a.png',
        x: 1,
        y: 2,
        width: 3,
        height: 4,
      })
    )
    expect(out.objectId).toMatch(/^IMG_/)
    const body = seen.find((c) => c.url.includes(':batchUpdate'))?.body
    const reqs = (body?.requests ?? []) as GoogleRequest[]
    expect(Object.keys(reqs[0])[0]).toBe('createImage')
    expect((reqs[0] as Record<string, Record<string, unknown>>).createImage.url).toBe('https://example.com/a.png')
  })
  it('line converts endpoints to bounding box', () => {
    const r = buildCreateLine({ pageObjectId: SLIDE, x1: 100, y1: 50, x2: 20, y2: 50 })
    const line = (r.requests[0] as Record<string, Record<string, unknown>>).createLine as Record<string, unknown>
    expect(line.lineCategory).toBe('STRAIGHT')
    const props = line.elementProperties as Record<string, Record<string, Record<string, number>>>
    expect(props.transform.translateX).toBe(20 * EMU_PER_PT)
    expect(props.size.width.magnitude).toBe(80 * EMU_PER_PT)
    expect(props.size.height.magnitude).toBe(1 * EMU_PER_PT) // degenerate axis clamped
  })
  it('table builds rows/columns with geometry', () => {
    const r = buildCreateTable({ pageObjectId: SLIDE, rows: 2, columns: 3, rect: { x: 0, y: 0, width: 400, height: 100 } })
    const t = (r.requests[0] as Record<string, Record<string, unknown>>).createTable as Record<string, unknown>
    expect(t.rows).toBe(2)
    expect(t.columns).toBe(3)
  })
  it('created object IDs are preserved end to end', async () => {
    stubFetch()
    const out = textOf(
      await handleCreateElement(TOKEN, {
        presentationId: PRES,
        pageObjectId: SLIDE,
        type: 'shape',
        shapeType: 'RECTANGLE',
        objectId: 'MINE_1',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      })
    )
    expect(out.objectId).toBe('MINE_1')
    expect(out.createdIds).toEqual([{ createShape: 'MINE_1' }])
  })
  it('image builder is constructible directly', () => {
    const r = buildCreateImage({ pageObjectId: SLIDE, imageUrl: 'https://x.test/i.png', rect: { x: 0, y: 0, width: 5, height: 5 } })
    expect(r.requests).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Updates: 14-25
// ---------------------------------------------------------------------------

describe('existing element updates (14-25)', () => {
  it('text set = delete ALL + insert at 0', () => {
    const reqs = buildTextMutation({ objectId: 'S1', mode: 'set', text: 'New' })
    expect(reqs).toEqual([
      { deleteText: { objectId: 'S1', textRange: { type: 'ALL' } } },
      { insertText: { objectId: 'S1', insertionIndex: 0, text: 'New' } },
    ])
  })
  it('text insert honors index', () => {
    expect(buildTextMutation({ objectId: 'S1', mode: 'insert', text: 'X', startIndex: 5 })).toEqual([
      { insertText: { objectId: 'S1', insertionIndex: 5, text: 'X' } },
    ])
  })
  it('text delete requires explicit valid range', () => {
    expect(buildTextMutation({ objectId: 'S1', mode: 'delete', startIndex: 1, endIndex: 4 })).toEqual([
      { deleteText: { objectId: 'S1', textRange: { type: 'FIXED_RANGE', startIndex: 1, endIndex: 4 } } },
    ])
    expect(() => buildTextMutation({ objectId: 'S1', mode: 'delete' })).toThrow(/explicit/)
    expect(() => buildTextMutation({ objectId: 'S1', mode: 'delete', startIndex: 4, endIndex: 4 })).toThrow(/endIndex/)
  })
  it('font family/size/bold/italic/color build mask internally', () => {
    const r = buildUpdateTextStyle({
      objectId: 'S1',
      style: { fontFamily: 'Roboto', fontSizePt: 24, bold: true, italic: false, colorHex: '#112233' },
    })
    const u = (r as Record<string, Record<string, unknown>>).updateTextStyle
    expect(u.fields).toBe('fontFamily,fontSize,bold,italic,foregroundColor')
    expect(u.textRange).toEqual({ type: 'ALL' })
    expect((u.style as Record<string, unknown>).fontSize).toEqual({ magnitude: 24, unit: 'PT' })
  })
  it('paragraph alignment maps START/CENTER/END', () => {
    const r = buildUpdateParagraphStyle({ objectId: 'S1', alignment: 'CENTER' })
    const u = (r as Record<string, Record<string, unknown>>).updateParagraphStyle
    expect(u).toMatchObject({ style: { alignment: 'CENTER' }, fields: 'alignment' })
  })
  it('shape fill + outline use documented dotted masks (F02 docs-verified)', () => {
    const r = buildUpdateShapeStyle({ objectId: 'S1', style: { fillHex: '#FFFFFF', outlineHex: '#000000', outlineWeightPt: 1.5 } })
    const u = (r as Record<string, Record<string, unknown>>).updateShapeProperties
    expect(u.fields).toBe('shapeBackgroundFill.solidFill.color,outline.outlineFill.solidFill.color,outline.weight')
    const props = u.shapeProperties as Record<string, unknown>
    // F02: SolidFill.color IS OpaqueColor — rgbColor is a direct property, no opaqueColor wrapper
    expect(props.shapeBackgroundFill).toEqual({
      solidFill: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } },
    })
  })
  it('fill none maps to propertyState mask (C07)', () => {
    const r = buildUpdateShapeStyle({ objectId: 'S1', style: { fillHex: 'none' } })
    const u = (r as Record<string, Record<string, unknown>>).updateShapeProperties
    expect(u.fields).toBe('shapeBackgroundFill.propertyState')
    expect((u.shapeProperties as Record<string, unknown>).shapeBackgroundFill).toEqual({ propertyState: 'NOT_RENDERED' })
  })
  it('transform request carries NO top-level size (C08 docs-verified)', async () => {
    stubFetch()
    await handleUpdateElement(TOKEN, {
      presentationId: PRES,
      objectId: 'SHAPE_1',
      family: 'transform',
      x: 100,
      y: 50,
      width: 8,
      height: 4,
    })
    const body = seen.find((c) => c.url.includes(':batchUpdate'))?.body
    const req = ((body?.requests ?? []) as GoogleRequest[])[0] as Record<string, Record<string, unknown>>
    expect(Object.keys(req)).toEqual(['updatePageElementTransform'])
    const u = req.updatePageElementTransform
    expect(u).not.toHaveProperty('size')
    expect(u.applyMode).toBe('ABSOLUTE')
  })
  it('move-only preserves current scales (C08)', async () => {
    stubFetch()
    await handleUpdateElement(TOKEN, {
      presentationId: PRES,
      objectId: 'SHAPE_1',
      family: 'transform',
      x: 100,
      y: 50,
    })
    const body = seen.find((c) => c.url.includes(':batchUpdate'))?.body
    const u = (((body?.requests ?? []) as GoogleRequest[])[0] as Record<string, Record<string, unknown>>).updatePageElementTransform
    // Fixture SHAPE_1: 4x2pt at (72,36), scale 1.
    expect(u.transform).toMatchObject({
      scaleX: 1,
      scaleY: 1,
      shearX: 0,
      shearY: 0,
      translateX: 100 * EMU_PER_PT,
      translateY: 50 * EMU_PER_PT,
      unit: 'EMU',
    })
  })
  it('resize-only recomputes scales vs live size (C08)', async () => {
    stubFetch()
    const out = textOf(
      await handleUpdateElement(TOKEN, {
        presentationId: PRES,
        objectId: 'SHAPE_1',
        family: 'transform',
        width: 8,
        height: 1,
      })
    )
    expect(out).toMatchObject({ objectId: 'SHAPE_1', family: 'transform', appliedRequests: 1 })
    const body = seen.find((c) => c.url.includes(':batchUpdate'))?.body
    const u = (((body?.requests ?? []) as GoogleRequest[])[0] as Record<string, Record<string, unknown>>).updatePageElementTransform
    expect(u.transform).toMatchObject({
      scaleX: 2,
      scaleY: 0.5,
      translateX: 72 * EMU_PER_PT,
      translateY: 36 * EMU_PER_PT,
    })
  })
  it('move+resize together in one request (C08)', async () => {
    stubFetch()
    await handleUpdateElement(TOKEN, {
      presentationId: PRES,
      objectId: 'SHAPE_1',
      family: 'transform',
      x: 10,
      y: 10,
      width: 8,
      height: 4,
    })
    const posts = seen.filter((c) => c.url.includes(':batchUpdate'))
    expect(posts).toHaveLength(1)
    const u = (((posts[0].body?.requests ?? []) as GoogleRequest[])[0] as Record<string, Record<string, unknown>>).updatePageElementTransform
    expect(u.transform).toMatchObject({ scaleX: 2, scaleY: 2, translateX: 10 * EMU_PER_PT, translateY: 10 * EMU_PER_PT })
  })
  it('partial geometry singles rejected; unknown element rejected (C08)', async () => {
    stubFetch()
    await expect(
      handleUpdateElement(TOKEN, { presentationId: PRES, objectId: 'SHAPE_1', family: 'transform', x: 10 })
    ).rejects.toThrow(/x AND y/)
    await expect(
      handleUpdateElement(TOKEN, { presentationId: PRES, objectId: 'SHAPE_1', family: 'transform', width: 10 })
    ).rejects.toThrow(/width AND height/)
    await expect(
      handleUpdateElement(TOKEN, { presentationId: PRES, objectId: 'GHOST', family: 'transform', x: 1, y: 1 })
    ).rejects.toThrow(/not found/)
    // No mutation attempted on validation/geometry failure.
    expect(seen.filter((c) => c.url.includes(':batchUpdate'))).toHaveLength(0)
  })
  it('handler wires update families end to end', async () => {
    stubFetch()
    const out = textOf(
      await handleUpdateElement(TOKEN, {
        presentationId: PRES,
        objectId: 'SHAPE_1',
        family: 'transform',
        x: 10,
        y: 10,
        width: 100,
        height: 50,
      })
    )
    expect(out).toMatchObject({ objectId: 'SHAPE_1', family: 'transform', appliedRequests: 1 })
  })
})

// ---------------------------------------------------------------------------
// Lifecycle: 26-28
// ---------------------------------------------------------------------------

describe('lifecycle (26-28)', () => {
  it('delete builds object request and reports id', async () => {
    expect(buildDeleteObject('X1')).toEqual({ deleteObject: { objectId: 'X1' } })
    stubFetch()
    const out = textOf(await handleDeleteObject(TOKEN, { presentationId: PRES, objectId: 'X1' }))
    expect(out).toMatchObject({ deletedObjectId: 'X1', deleted: true })
  })
  it('duplicate preserves Google mapping, never fakes', async () => {
    expect(buildDuplicateObject('X1')).toEqual({ duplicateObject: { objectId: 'X1' } })
    expect(buildDuplicateObject('X1', 'X2')).toEqual({ duplicateObject: { objectId: 'X1', objectIds: { X1: 'X2' } } })
    stubFetch()
    const out = textOf(await handleDuplicateObject(TOKEN, { presentationId: PRES, objectId: 'X1' }))
    expect(out.sourceObjectId).toBe('X1')
    expect(out.replyIds).toEqual([{ duplicateObject: 'COPY_1' }])
  })
  it('reply extraction ignores empty replies', () => {
    expect(extractReplyObjectIds(undefined)).toEqual([])
    expect(extractReplyObjectIds([{}, { deleteObject: {} }])).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Batch: 29-34
// ---------------------------------------------------------------------------

describe('controlled batch (29-34)', () => {
  it('accepts multiple allowlisted ops in one atomic call, order preserved', async () => {
    stubFetch()
    const out = textOf(
      await handleBatchUpdate(TOKEN, {
        presentationId: PRES,
        operations: [
          { op: 'create', type: 'shape', pageObjectId: SLIDE, shapeType: 'RECTANGLE', x: 0, y: 0, width: 10, height: 10, objectId: 'B1' },
          { op: 'text', objectId: 'B1', mode: 'set', text: 'T' },
          // Transform targets must already exist server-side (same-batch creates
          // are not yet addressable) — SHAPE_1 comes from the deck read.
          { op: 'transform', objectId: 'SHAPE_1', x: 5, y: 5, width: 20, height: 20 },
        ],
      })
    )
    const posts = seen.filter((c) => c.url.includes(':batchUpdate'))
    expect(posts).toHaveLength(1)
    const kinds = ((posts[0].body?.requests ?? []) as GoogleRequest[]).map((r) => Object.keys(r)[0])
    expect(kinds).toEqual(['createShape', 'deleteText', 'insertText', 'updatePageElementTransform'])
    expect(out).toMatchObject({ operations: 3, appliedRequests: 4 })
    expect(out.createdIds).toEqual(['B1'])
  })
  it('rejects unknown op, empty batch, oversized batch', async () => {
    stubFetch()
    await expect(
      handleBatchUpdate(TOKEN, { presentationId: PRES, operations: [{ op: 'raw', requests: [] }] })
    ).rejects.toThrow(/allowlisted/)
    await expect(handleBatchUpdate(TOKEN, { presentationId: PRES, operations: [] })).rejects.toThrow(/at least one/)
    const big = Array.from({ length: MAX_BATCH_OPS + 1 }, (_, i) => ({ op: 'delete', objectId: `D${i}` }))
    await expect(handleBatchUpdate(TOKEN, { presentationId: PRES, operations: big })).rejects.toThrow(/maximum/)
    expect(seen.filter((c) => c.url.includes(':batchUpdate'))).toHaveLength(0)
  })
  it('batch dispatcher rejects raw Google payloads', () => {
    expect(() => buildBatchOperation({ createShape: {} })).toThrow(/allowlisted/)
  })
  it('batch transform without geometry context is rejected (C08)', () => {
    expect(() => buildBatchOperation({ op: 'transform', objectId: 'S1', x: 1, y: 1 })).toThrow(/live element geometry/)
  })
  it('zero-size live elements refuse scale computation (C08)', async () => {
    const { buildAbsoluteTransform } = await import('./visual')
    expect(() =>
      buildAbsoluteTransform('Z', { width: 10, height: 10 }, { sizeWEmu: 0, sizeHEmu: 5, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0, translateXEmu: 0, translateYEmu: 0 })
    ).toThrow(/no readable size/)
  })
  it('imageStyle reuses absolute transform (C08)', async () => {
    stubFetch()
    const out = textOf(
      await handleUpdateElement(TOKEN, { presentationId: PRES, objectId: 'IMG_1', family: 'imageStyle', x: 1, y: 2, width: 10, height: 6 })
    )
    expect(out).toMatchObject({ objectId: 'IMG_1', family: 'imageStyle', appliedRequests: 1 })
    const body = seen.find((c) => c.url.includes(':batchUpdate'))?.body
    const u = (((body?.requests ?? []) as GoogleRequest[])[0] as Record<string, Record<string, unknown>>).updatePageElementTransform
    // Fixture IMG_1: 5x3pt. Scales recomputed, translate new.
    expect(u.transform).toMatchObject({ scaleX: 2, scaleY: 2, translateX: 1 * EMU_PER_PT, translateY: 2 * EMU_PER_PT })
  })
})

// ---------------------------------------------------------------------------
// Validation: 35-39
// ---------------------------------------------------------------------------

describe('validation (35-39)', () => {
  it('rejects malformed hex color', async () => {
    stubFetch()
    await expect(
      handleUpdateElement(TOKEN, { presentationId: PRES, objectId: 'S1', family: 'textStyle', colorHex: 'red' })
    ).rejects.toThrow(/hex RGB/)
  })
  it('rejects NaN geometry and negative size', () => {
    const base = { objectId: 'S1', family: 'transform' } as Record<string, unknown>
    expect(() => buildUpdateElementRequests({ ...base, x: NaN, y: 0, width: 1, height: 1 })).toThrow(/finite/)
    expect(() => buildUpdateElementRequests({ ...base, x: 0, y: 0, width: -5, height: 1 })).toThrow(/positive/)
    expect(() => buildUpdateElementRequests({ ...base, x: 0, y: 0, width: Infinity, height: 1 })).toThrow(/finite/)
  })
  it('rejects non-http image URLs and local paths', async () => {
    stubFetch()
    await expect(
      handleCreateElement(TOKEN, { presentationId: PRES, pageObjectId: SLIDE, type: 'image', imageUrl: 'ftp://x/y.png', x: 0, y: 0, width: 1, height: 1 })
    ).rejects.toThrow(/http/)
    await expect(
      handleCreateElement(TOKEN, { presentationId: PRES, pageObjectId: SLIDE, type: 'image', imageUrl: 'C:\\pics\\a.png', x: 0, y: 0, width: 1, height: 1 })
    ).rejects.toThrow()
  })
  it('rejects unknown update family', async () => {
    stubFetch()
    await expect(
      handleUpdateElement(TOKEN, { presentationId: PRES, objectId: 'S1', family: 'watermark' })
    ).rejects.toThrow(/family/)
  })
})

// ---------------------------------------------------------------------------
// Error semantics: never misreport API errors as auth expiry
// ---------------------------------------------------------------------------

describe('error semantics', () => {
  it('Google 4xx surfaces as API error, not authorization-expired', async () => {
    // Note: the "Google Slides API <status>" prefix is applied by the server
    // dispatch wrapper (slidesError, shared with legacy tools); handlers must
    // never emit "expired" phrasing themselves.
    stubFetch(() => errJson(403, { error: { code: 403, message: 'The caller does not have permission', status: 'PERMISSION_DENIED' } }))
    await expect(handleGetPage(TOKEN, { presentationId: PRES, pageObjectId: SLIDE })).rejects.toThrow(/does not have permission/)
    await expect(handleGetPage(TOKEN, { presentationId: PRES, pageObjectId: SLIDE })).rejects.not.toThrow(/expired/i)
  })
})

// ---------------------------------------------------------------------------
// Regression: 40-43 (legacy surface unchanged)
// ---------------------------------------------------------------------------

describe('legacy regression (40-43)', () => {
  it('createSlide still works and returns slideObjectId', async () => {
    stubFetch()
    const out = textOf(await updatePresentation(TOKEN, { presentationId: PRES, operation: 'createSlide' }))
    expect(out).toMatchObject({ operation: 'createSlide', slideObjectId: 'SLIDE_NEW' })
  })
  it('insertText keeps fixed legacy geometry and ids', async () => {
    stubFetch()
    const out = textOf(await updatePresentation(TOKEN, { presentationId: PRES, operation: 'insertText', slideId: SLIDE, text: 'Legacy hi' }))
    expect(out).toMatchObject({ operation: 'insertText', slideId: SLIDE, insertedCharacters: 9 })
    expect((out.textBoxObjectId as string).startsWith('TXTBOX_')).toBe(true)
    const body = seen.find((c) => c.url.includes(':batchUpdate'))?.body
    const reqs = (body?.requests ?? []) as GoogleRequest[]
    expect(Object.keys(reqs[0])[0]).toBe('createShape')
    const props = ((reqs[0] as Record<string, Record<string, unknown>>).createShape.elementProperties ?? {}) as Record<string, Record<string, Record<string, number>>>
    // Legacy fixed EMU geometry preserved exactly.
    expect(props.size.width.magnitude).toBe(4_000_000)
    expect(props.transform.translateX).toBe(100_000)
  })
  it('presentation list behavior unchanged', async () => {
    stubFetch()
    const out = textOf(await listPresentations(TOKEN, {}))
    expect(out).toMatchObject({ count: 1 })
    expect((out.presentations as Array<Record<string, unknown>>)[0]).toMatchObject({ id: 'P1', name: 'Deck' })
  })
  it('presentation summary remains compatible (+pageSize additive)', async () => {
    stubFetch()
    const out = textOf(await getPresentation(TOKEN, { presentationId: PRES }))
    expect(out).toMatchObject({ presentationId: PRES, title: 'Deck', slideCount: 1 })
    const slides = out.slides as Array<Record<string, unknown>>
    expect(slides[0]).toMatchObject({ objectId: SLIDE, title: 'Hello World', elements: 3 })
  })
})
