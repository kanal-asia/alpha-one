/**
 * TASK-069: Google Slides custom MCP.
 *
 * Built on the shared Google MCP foundation:
 *   mcp-servers/shared/google/auth.ts  - local OAuth/token access + refresh
 *   mcp-servers/shared/google/rest.ts  - authenticated REST + error normalization
 *   mcp-servers/shared/google/mcp.ts   - MCP stdio JSON-RPC bootstrap
 *
 * Service-specific surface only: Slides endpoints, Drive discovery (list only),
 * argument validation, and response shaping. No duplicate OAuth/token/MCP-bootstrap
 * logic. No unrestricted batchUpdate passthrough — only a small constrained subset.
 */

import { googleRequest, GoogleApiError } from '../shared/google/rest'
import { startMcpServer, type McpTool, type McpToolResult } from '../shared/google/mcp'
import {
  handleGetPage,
  handleCreateElement,
  handleUpdateElement,
  handleDeleteObject,
  handleDuplicateObject,
  handleBatchUpdate,
  handleUpdatePage,
  handleCreateSlide,
  CREATE_ELEMENT_TYPES,
  UPDATE_FAMILIES,
  MAX_BATCH_OPS,
} from './visual'
import { handleComposeSlide, ARCHETYPES } from './beautify'

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const RESOURCE_ID_RE = /^[A-Za-z0-9_-]{1,120}$/
const MAX_TEXT = 5_000
const MAX_TITLE = 200
const MAX_QUERY = 200
const MAX_PAGE_TOKEN = 2000
const MAX_PAGE_SIZE = 50
const MAX_SLIDE_DETAIL = 20

function asString(v: unknown, label: string, maxLen: number, required = true): string {
  if (v === undefined || v === null) {
    if (required) throw new Error(`${label} is required.`)
    return ''
  }
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`)
  }
  if (v.length > maxLen) {
    throw new Error(`${label} must be at most ${maxLen} characters.`)
  }
  return v.trim()
}

function validateResourceId(v: unknown, label = 'id'): string {
  const id = asString(v, label, 120)
  if (!RESOURCE_ID_RE.test(id)) {
    throw new Error(`${label} is malformed. Expected a Google resource ID (letters, digits, _ and -).`)
  }
  return id
}

function asOptionalString(v: unknown, label: string, maxLen: number): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') throw new Error(`${label} must be a string.`)
  const s = v.trim()
  if (s.length > maxLen) throw new Error(`${label} must be at most ${maxLen} characters.`)
  return s || undefined
}

function asPageSize(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > MAX_PAGE_SIZE) {
    throw new Error(`pageSize must be an integer between 1 and ${MAX_PAGE_SIZE}.`)
  }
  return n
}

function asOperation(v: unknown): 'createSlide' | 'insertText' {
  if (v === undefined || v === null) throw new Error('operation is required (createSlide or insertText).')
  if (v === 'createSlide' || v === 'insertText') return v
  throw new Error("operation must be 'createSlide' or 'insertText'.")
}

// ---------------------------------------------------------------------------
// Google API helpers
// ---------------------------------------------------------------------------

interface SlidesPresentation {
  presentationId: string
  title: string
  revisionId?: string
  pageSize?: { width?: { magnitude?: number; unit?: string }; height?: { magnitude?: number; unit?: string } }
  slides?: Array<{
    objectId?: string
    pageElements?: Array<{
      objectId?: string
      shape?: {
        shapeType?: string
        text?: { textElements?: Array<{ textRun?: { content?: string } }> }
      }
    }>
  }>
  masters?: Array<{
    objectId?: string
    masterProperties?: { displayName?: string }
    pageProperties?: {
      colorScheme?: { colors?: Array<{ type?: string; color?: { rgbColor?: { red?: number; green?: number; blue?: number } } }> }
    }
  }>
  layouts?: Array<{
    objectId?: string
    pageProperties?: { displayName?: string }
    layoutProperties?: { masterObjectId?: string; name?: string; displayName?: string }
    pageElements?: Array<{
      objectId?: string
      shape?: { placeholder?: { type?: string; index?: number } }
    }>
  }>
}

async function fetchPresentation(token: string, presentationId: string): Promise<SlidesPresentation> {
  return googleRequest<SlidesPresentation>({
    method: 'GET',
    url: `https://slides.googleapis.com/v1/presentations/${presentationId}`,
    token,
  })
}

function slideTitle(slide: NonNullable<SlidesPresentation['slides']>[number]): string {
  let title = ''
  for (const el of slide.pageElements ?? []) {
    for (const te of el.shape?.text?.textElements ?? []) {
      title += te.textRun?.content ?? ''
    }
    if (title.length > 120) break
  }
  return title.trim().split('\n')[0] ?? ''
}

function slidesError(err: unknown): Error {
  if (err instanceof GoogleApiError) {
    return new Error(`Google Slides API ${err.status}${err.reason ? ` (${err.reason})` : ''}: ${err.message}`)
  }
  return err instanceof Error ? err : new Error(String(err))
}

function toTextResult(result: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

/** TASK-084: project a master colorScheme to a bounded {THEME_KEY: hex} map. */
export function projectColorScheme(
  scheme: { colors?: Array<{ type?: string; color?: { rgbColor?: { red?: number; green?: number; blue?: number } } }> } | undefined
): Record<string, string> | null {
  if (!scheme?.colors) return null
  const out: Record<string, string> = {}
  for (const entry of scheme.colors) {
    if (!entry.type) continue
    const c = entry.color?.rgbColor
    if (c?.red === undefined || c?.green === undefined || c?.blue === undefined) continue
    const b = (v: number): string => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0').toUpperCase()
    out[entry.type] = `#${b(c.red)}${b(c.green)}${b(c.blue)}`
  }
  return Object.keys(out).length > 0 ? out : null
}

/** Exported for automated regression tests (TASK-084 extends the projection). */
export async function getPresentation(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const presentationId = validateResourceId(args.presentationId, 'presentationId')
  const pres = await fetchPresentation(token, presentationId)
  const slides = pres.slides ?? []
  const detail = slides.slice(0, MAX_SLIDE_DETAIL).map((s) => ({
    objectId: s.objectId ?? null,
    title: slideTitle(s),
    elements: s.pageElements?.length ?? 0,
  }))
  // TASK-084: bounded design-system projection (summaries only; page reads supply trees).
  const masters = (pres.masters ?? []).map((m) => ({
    objectId: m.objectId ?? null,
    displayName: m.masterProperties?.displayName ?? null,
    theme: projectColorScheme(m.pageProperties?.colorScheme),
  }))
  const layouts = (pres.layouts ?? []).map((l) => ({
    objectId: l.objectId ?? null,
    masterObjectId: l.layoutProperties?.masterObjectId ?? null,
    name: l.layoutProperties?.name ?? null,
    displayName: l.layoutProperties?.displayName ?? l.pageProperties?.displayName ?? null,
    placeholders: (l.pageElements ?? [])
      .map((el) => ({
        objectId: el.objectId ?? null,
        ...(el.shape?.placeholder?.type ? { type: el.shape.placeholder.type } : {}),
        ...(el.shape?.placeholder?.index !== undefined ? { index: el.shape.placeholder.index } : {}),
      }))
      .filter((p) => p.objectId),
  }))
  return toTextResult({
    presentationId: pres.presentationId,
    title: pres.title,
    revisionId: pres.revisionId ?? null,
    pageSize: pres.pageSize ?? null,
    slideCount: slides.length,
    slides: detail,
    masters,
    layouts,
    notes: slides.length > MAX_SLIDE_DETAIL ? `slide details truncated to first ${MAX_SLIDE_DETAIL} of ${slides.length}` : null,
    url: `https://docs.google.com/presentation/d/${pres.presentationId}/edit`,
  })
}

/** Exported for automated regression tests (no behavior change). */
export async function listPresentations(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const query = asOptionalString(args.query, 'query', MAX_QUERY)
  const pageSize = asPageSize(args.pageSize)
  const pageToken = asOptionalString(args.pageToken, 'pageToken', MAX_PAGE_TOKEN)

  const q = [
    "mimeType='application/vnd.google-apps.presentation'",
    'and trashed=false',
    query ? `and name contains '${query.replaceAll("'", "\\'")}'` : '',
  ]
    .filter(Boolean)
    .join(' ')

  const res = await googleRequest<{
    files?: Array<{ id: string; name: string; modifiedTime?: string }>
    nextPageToken?: string
  }>({
    method: 'GET',
    url: 'https://www.googleapis.com/drive/v3/files',
    params: {
      q,
      pageSize: pageSize ?? 20,
      fields: 'files(id,name,modifiedTime),nextPageToken',
      ...(pageToken ? { pageToken } : {}),
    },
    token,
  })

  return toTextResult({
    presentations: (res.files ?? []).map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime ?? null })),
    count: (res.files ?? []).length,
    nextPageToken: res.nextPageToken ?? null,
  })
}

/** Exported for automated regression tests (no behavior change). */
export async function createPresentation(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const title = asString(args.title, 'title', MAX_TITLE)
  const res = await googleRequest<{ presentationId: string; title?: string }>({
    method: 'POST',
    url: 'https://slides.googleapis.com/v1/presentations',
    body: { title },
    token,
  })
  return toTextResult({
    presentationId: res.presentationId,
    title: res.title ?? title,
    url: `https://docs.google.com/presentation/d/${res.presentationId}/edit`,
    location: 'Google Drive (root)',
  })
}

/** Exported for automated regression tests (no behavior change). */
export async function updatePresentation(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const presentationId = validateResourceId(args.presentationId, 'presentationId')
  const operation = asOperation(args.operation)

  if (operation === 'createSlide') {
    const res = await googleRequest<{ presentationId: string; replies?: Array<{ createSlide?: { objectId?: string } }> }>({
      method: 'POST',
      url: `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
      body: { requests: [{ createSlide: {} }] },
      token,
    })
    return toTextResult({
      presentationId: res.presentationId,
      operation: 'createSlide',
      slideObjectId: res.replies?.[0]?.createSlide?.objectId ?? null,
      note: 'Verify persistence by reading the presentation back with slides_get_presentation.',
    })
  }

  const slideId = validateResourceId(args.slideId, 'slideId')
  const text = asString(args.text, 'text', MAX_TEXT)
  const textBoxId = `TXTBOX_${Date.now()}_${Math.floor(Math.random() * 1e6)}`

  const res = await googleRequest<{
    presentationId: string
    replies?: Array<{ createShape?: { objectId?: string } }>
  }>({
    method: 'POST',
    url: `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
    body: {
      requests: [
        {
          createShape: {
            objectId: textBoxId,
            shapeType: 'TEXT_BOX',
            elementProperties: {
              pageObjectId: slideId,
              size: { width: { magnitude: 4_000_000, unit: 'EMU' }, height: { magnitude: 1_000_000, unit: 'EMU' } },
              transform: { scaleX: 1, scaleY: 1, translateX: 100_000, translateY: 100_000, unit: 'EMU' },
            },
          },
        },
        {
          insertText: { objectId: textBoxId, insertionIndex: 0, text },
        },
      ],
    },
    token,
  })

  return toTextResult({
    presentationId: res.presentationId,
    operation: 'insertText',
    slideId,
    textBoxObjectId: res.replies?.[0]?.createShape?.objectId ?? textBoxId,
    insertedCharacters: text.length,
    note: 'Verify persistence by reading the presentation back with slides_get_presentation.',
  })
}

// ---------------------------------------------------------------------------
// MCP registration
// ---------------------------------------------------------------------------

const TOOLS: McpTool[] = [
  {
    name: 'slides_get_presentation',
    description:
      'Read a Google Slides presentation: presentationId, title, revisionId, pageSize, slide count, per-slide summary, plus the design system — masters (objectId, displayName, theme palette), layouts (objectId, masterObjectId, name, displayName, placeholders). Inspect this first before composing professional slides; use layoutIds with slides_create_slide.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Google Slides presentation ID.' },
      },
      required: ['presentationId'],
    },
  },
  {
    name: 'slides_list_presentations',
    description:
      'Discover Google Slides presentations available to the connected identity (Drive discovery only, filtered to application/vnd.google-apps.presentation).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Optional name-contains filter.' },
        pageSize: { type: 'integer', minimum: 1, maximum: 50, description: 'Results per page (default 20).' },
        pageToken: { type: 'string', description: 'Pagination token from a previous call.' },
      },
    },
  },
  {
    name: 'slides_create_presentation',
    description: 'Create a new Google Slides presentation with the given title.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 200, description: 'Presentation title.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'slides_update_presentation',
    description:
      'Apply a constrained batchUpdate to a Google Slides presentation. Supported operations: createSlide (add a blank slide) and insertText (create a text box on a slide and insert text into it). No arbitrary batchUpdate passthrough.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Google Slides presentation ID.' },
        operation: { type: 'string', enum: ['createSlide', 'insertText'], description: 'Constrained operation to apply.' },
        slideId: { type: 'string', description: 'Target slide objectId (required for insertText).' },
        text: { type: 'string', maxLength: 5000, description: 'Text to insert (required for insertText).' },
      },
      required: ['presentationId', 'operation'],
    },
  },
  {
    name: 'slides_get_page',
    description:
      'Inspect a slide with design-system context: layoutObjectId, masterObjectId, native pageBackground, and full-fidelity bounded element records (objectId, type, size, transform, zIndex, text runs with theme colors, fills/outlines with theme refs, placeholders with type/index/parent, group membership). Target native placeholder objectIds when populating slides; prefer theme colors and native backgrounds over literal values and covering shapes.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Google Slides presentation ID.' },
        pageObjectId: { type: 'string', description: 'Slide/page objectId to inspect.' },
      },
      required: ['presentationId', 'pageObjectId'],
    },
  },
  {
    name: 'slides_create_element',
    description:
      'Create a visual element on an existing slide. Types: textBox, shape (RECTANGLE, ROUND_RECTANGLE, ELLIPSE), image (http/https URL only), line (straight, x1/y1 to x2/y2), table (rows/columns). Geometry uses PT units (x, y, width, height) except lines. Returns the created objectId.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Google Slides presentation ID.' },
        pageObjectId: { type: 'string', description: 'Target slide objectId.' },
        type: { type: 'string', enum: [...CREATE_ELEMENT_TYPES], description: 'Element family to create.' },
        objectId: { type: 'string', description: 'Optional requested objectId.' },
        x: { type: 'number', description: 'Left position in PT (not for line).' },
        y: { type: 'number', description: 'Top position in PT (not for line).' },
        width: { type: 'number', description: 'Width in PT, must be positive (not for line).' },
        height: { type: 'number', description: 'Height in PT, must be positive (not for line).' },
        text: { type: 'string', maxLength: 5000, description: 'Text content (textBox required, shape optional).' },
        shapeType: { type: 'string', enum: ['RECTANGLE', 'ROUND_RECTANGLE', 'ELLIPSE'], description: 'Shape type (shape only).' },
        imageUrl: { type: 'string', description: 'Image URL, http/https only (image only).' },
        x1: { type: 'number', description: 'Line start x in PT (line only).' },
        y1: { type: 'number', description: 'Line start y in PT (line only).' },
        x2: { type: 'number', description: 'Line end x in PT (line only).' },
        y2: { type: 'number', description: 'Line end y in PT (line only).' },
        rows: { type: 'integer', minimum: 1, maximum: 20, description: 'Table rows (table only).' },
        columns: { type: 'integer', minimum: 1, maximum: 20, description: 'Table columns (table only).' },
        fontFamily: { type: 'string', description: 'Initial font (textBox only).' },
        fontSizePt: { type: 'number', description: 'Initial font size in PT (textBox only).' },
        bold: { type: 'boolean', description: 'Initial bold (textBox only).' },
        italic: { type: 'boolean', description: 'Initial italic (textBox only).' },
        colorHex: { type: 'string', description: 'Initial text color #RRGGBB (textBox only).' },
        alignment: { type: 'string', enum: ['START', 'CENTER', 'END'], description: 'Initial alignment (textBox only).' },
        fillHex: { type: 'string', description: 'Fill #RRGGBB or "none" (textBox/shape only).' },
        outlineHex: { type: 'string', description: 'Outline #RRGGBB (shape only).' },
        outlineWeightPt: { type: 'number', description: 'Outline weight in PT (shape only).' },
      },
      required: ['presentationId', 'pageObjectId', 'type'],
    },
  },
  {
    name: 'slides_update_element',
    description:
      'Edit text, styling or geometry of an existing slide element. Families: text (set/insert/delete by objectId+range), textStyle (font/size/bold/italic/color), paragraphStyle (alignment), shapeStyle (fill/outline), transform (move with x+y, resize with width+height, or both, in PT; current state is read first), imageStyle (reposition/resize). Never takes raw Google requests.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Google Slides presentation ID.' },
        objectId: { type: 'string', description: 'Target element objectId (from slides_get_page).' },
        family: { type: 'string', enum: [...UPDATE_FAMILIES], description: 'Update family.' },
        mode: { type: 'string', enum: ['set', 'insert', 'delete'], description: 'Text mode (text family).' },
        text: { type: 'string', maxLength: 5000, description: 'Text payload (text family set/insert).' },
        startIndex: { type: 'integer', minimum: 0, description: 'Range start (insert position or delete/text range).' },
        endIndex: { type: 'integer', minimum: 0, description: 'Range end (delete/text range).' },
        range: { type: 'object', description: 'Omit for whole text, or {startIndex, endIndex}.' },
        fontFamily: { type: 'string', description: 'Font family (textStyle).' },
        fontSizePt: { type: 'number', description: 'Font size in PT (textStyle).' },
        bold: { type: 'boolean', description: 'Bold (textStyle).' },
        italic: { type: 'boolean', description: 'Italic (textStyle).' },
        colorHex: { type: 'string', description: 'Text color #RRGGBB (textStyle; exclusive with colorTheme).' },
        colorTheme: { type: 'string', description: 'Semantic theme color e.g. TEXT1, ACCENT1 (textStyle; exclusive with colorHex).' },
        alignment: { type: 'string', enum: ['START', 'CENTER', 'END'], description: 'Alignment (paragraphStyle).' },
        fillHex: { type: 'string', description: 'Fill #RRGGBB or "none" (shapeStyle; exclusive with fillThemeColor).' },
        fillThemeColor: { type: 'string', description: 'Semantic theme fill e.g. ACCENT1 (shapeStyle; exclusive with fillHex).' },
        outlineHex: { type: 'string', description: 'Outline #RRGGBB (shapeStyle; exclusive with outlineThemeColor).' },
        outlineThemeColor: { type: 'string', description: 'Semantic theme outline e.g. ACCENT2 (shapeStyle; exclusive with outlineHex).' },
        outlineWeightPt: { type: 'number', description: 'Outline weight in PT (shapeStyle).' },
        x: { type: 'number', description: 'Left in PT; with y = move (transform/imageStyle).' },
        y: { type: 'number', description: 'Top in PT; with x = move (transform/imageStyle).' },
        width: { type: 'number', description: 'Width in PT; with height = resize (transform/imageStyle).' },
        height: { type: 'number', description: 'Height in PT; with width = resize (transform/imageStyle).' },
      },
      required: ['presentationId', 'objectId', 'family'],
    },
  },
  {
    name: 'slides_delete_object',
    description:
      'Delete one slide element by objectId. No wildcards. Only delete test elements you created or were asked to remove.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Google Slides presentation ID.' },
        objectId: { type: 'string', description: 'Element objectId to delete.' },
      },
      required: ['presentationId', 'objectId'],
    },
  },
  {
    name: 'slides_duplicate_object',
    description:
      'Duplicate one slide element by objectId. Returns Google reply mapping; never fakes IDs. Verify placement with slides_get_page.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Google Slides presentation ID.' },
        objectId: { type: 'string', description: 'Element objectId to duplicate.' },
        requestedId: { type: 'string', description: 'Optional requested objectId for the copy.' },
      },
      required: ['presentationId', 'objectId'],
    },
  },
  {
    name: 'slides_update_page',
    description:
      'Set a slide native page background (UpdatePagePropertiesRequest). Supply backgroundHex (#RRGGBB) OR backgroundThemeColor (e.g. BACKGROUND1, ACCENT1) — never both. This sets the true page background (inherited-aware), not a covering rectangle. Verify with slides_get_page (pageBackground).',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Google Slides presentation ID.' },
        pageObjectId: { type: 'string', description: 'Target slide objectId.' },
        backgroundHex: { type: 'string', description: 'Background #RRGGBB (exclusive with backgroundThemeColor).' },
        backgroundThemeColor: { type: 'string', description: 'Semantic theme background e.g. BACKGROUND1 (exclusive with backgroundHex).' },
      },
      required: ['presentationId', 'pageObjectId'],
    },
  },
  {
    name: 'slides_create_slide',
    description:
      'Create a slide, optionally from an existing native layout. Supply layoutId (from slides_get_presentation layouts) to inherit the deck design system with native placeholders; omit for a blank slide. Optional slideObjectId, insertionIndex, and placeholderMappings (layoutPlaceholderObjectId → slidePlaceholderObjectId; only with layoutId). Verify with slides_get_page (placeholders) and slides_get_presentation (layout IDs).',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Google Slides presentation ID.' },
        layoutId: { type: 'string', description: 'Optional layout objectId from the deck layouts.' },
        slideObjectId: { type: 'string', description: 'Optional requested objectId for the new slide.' },
        insertionIndex: { type: 'integer', minimum: 0, description: 'Optional zero-based insertion index.' },
        placeholderMappings: {
          type: 'array',
          description: 'Optional placeholder ID mappings (only with layoutId).',
          items: {
            type: 'object',
            properties: {
              layoutPlaceholderObjectId: { type: 'string' },
              slidePlaceholderObjectId: { type: 'string' },
            },
          },
        },
      },
      required: ['presentationId'],
    },
  },
  {
    name: 'slides_compose_slide',
    description:
      'Compose one professional slide from a structured plan (Alpha Beautify). Archetypes: COVER, EXECUTIVE_SUMMARY, KPI_DASHBOARD, PROCESS_FUNNEL, COMPARISON, TIMELINE_ROADMAP, PILLARS_STRATEGY, CLOSING_INSIGHT. Provide title plus archetype content (bullets/metrics/stages/columns). Renders native editable shapes/text with the professional design system, then runs structural QA. Verify with slides_get_page.',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Google Slides presentation ID.' },
        pageObjectId: { type: 'string', description: 'Target existing slide objectId.' },
        archetype: { type: 'string', enum: [...ARCHETYPES], description: 'Professional slide archetype.' },
        title: { type: 'string', maxLength: 200, description: 'Slide title.' },
        subtitle: { type: 'string', maxLength: 300, description: 'Optional subtitle.' },
        bullets: { type: 'array', items: { type: 'string' }, description: 'Bullets (summary/pillar content).' },
        metrics: {
          type: 'array',
          description: 'KPI metrics (KPI_DASHBOARD, max 6): {label, value, note?}.',
          items: { type: 'object' },
        },
        stages: {
          type: 'array',
          description: 'Ordered stages (PROCESS_FUNNEL/TIMELINE_ROADMAP, max 8): {label, description?}.',
          items: { type: 'object' },
        },
        columns: {
          type: 'array',
          description: 'Columns/pillars (COMPARISON/PILLARS_STRATEGY, max 5): {name, items[]}.',
          items: { type: 'object' },
        },
        closing: { type: 'string', maxLength: 300, description: 'Closing statement (CLOSING_INSIGHT).' },
      },
      required: ['presentationId', 'pageObjectId', 'archetype', 'title'],
    },
  },
  {
    name: 'slides_batch_update',
    description:
      'Apply multiple allowlisted visual edits atomically. Operations use op: create (element fields), text, textStyle, paragraphStyle, shapeStyle, transform, delete, duplicate, pageBackground (pageObjectId + backgroundHex/backgroundThemeColor), zorder (pageObjectId + objectIds[] + BRING_TO_FRONT/BRING_FORWARD/SEND_BACKWARD/SEND_TO_BACK), group (pageObjectId + childObjectIds[] + optional groupObjectId) — each with the same validated fields as the single tools. Rejects unknown ops, raw requests, empty and oversized batches (max 25).',
    inputSchema: {
      type: 'object',
      properties: {
        presentationId: { type: 'string', description: 'Google Slides presentation ID.' },
        operations: {
          type: 'array',
          minItems: 1,
          maxItems: MAX_BATCH_OPS,
          description: 'Allowlisted operations, applied in order as one atomic batchUpdate.',
          items: { type: 'object' },
        },
      },
      required: ['presentationId', 'operations'],
    },
  },
]

startMcpServer({
  name: 'google-slides',
  version: '0.1.0',
  tools: TOOLS,
  callTool: async (name, args) => {
    try {
      const token = await import('../shared/google/auth').then((m) => m.getAccessToken())
      switch (name) {
        case 'slides_get_presentation':
          return await getPresentation(token, args)
        case 'slides_list_presentations':
          return await listPresentations(token, args)
        case 'slides_create_presentation':
          return await createPresentation(token, args)
        case 'slides_update_presentation':
          return await updatePresentation(token, args)
        case 'slides_get_page':
          return await handleGetPage(token, args)
        case 'slides_create_element':
          return await handleCreateElement(token, args)
        case 'slides_update_element':
          return await handleUpdateElement(token, args)
        case 'slides_delete_object':
          return await handleDeleteObject(token, args)
        case 'slides_duplicate_object':
          return await handleDuplicateObject(token, args)
        case 'slides_update_page':
          return await handleUpdatePage(token, args)
        case 'slides_create_slide':
          return await handleCreateSlide(token, args)
        case 'slides_compose_slide':
          return await handleComposeSlide(token, args)
        case 'slides_batch_update':
          return await handleBatchUpdate(token, args)
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
      }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${slidesError(err).message}` }], isError: true }
    }
  },
})