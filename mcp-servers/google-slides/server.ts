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

async function getPresentation(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const presentationId = validateResourceId(args.presentationId, 'presentationId')
  const pres = await fetchPresentation(token, presentationId)
  const slides = pres.slides ?? []
  const detail = slides.slice(0, MAX_SLIDE_DETAIL).map((s) => ({
    objectId: s.objectId ?? null,
    title: slideTitle(s),
    elements: s.pageElements?.length ?? 0,
  }))
  return toTextResult({
    presentationId: pres.presentationId,
    title: pres.title,
    revisionId: pres.revisionId ?? null,
    slideCount: slides.length,
    slides: detail,
    notes: slides.length > MAX_SLIDE_DETAIL ? `slide details truncated to first ${MAX_SLIDE_DETAIL} of ${slides.length}` : null,
    url: `https://docs.google.com/presentation/d/${pres.presentationId}/edit`,
  })
}

async function listPresentations(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
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

async function createPresentation(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
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

async function updatePresentation(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
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
      'Read a Google Slides presentation: presentationId, title, revisionId, slide count, and per-slide summary (objectId, extracted title, element count).',
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
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
      }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${slidesError(err).message}` }], isError: true }
    }
  },
})