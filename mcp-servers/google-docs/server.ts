/**
 * TASK-068: Google Docs custom MCP.
 *
 * Built on the shared Google MCP foundation:
 *   mcp-servers/shared/google/auth.ts  - local OAuth/token access + refresh
 *   mcp-servers/shared/google/rest.ts  - authenticated REST + error normalization
 *   mcp-servers/shared/google/mcp.ts   - MCP stdio JSON-RPC bootstrap
 *
 * Service-specific surface only: Docs endpoints, Drive discovery, argument
 * validation, and response shaping. No duplicate OAuth/token/MCP-bootstrap
 * logic. No unrestricted API passthrough.
 */

import { googleRequest, GoogleApiError } from '../shared/google/rest'
import { startMcpServer, type McpTool, type McpToolResult } from '../shared/google/mcp'

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const DOC_ID_RE = /^[A-Za-z0-9_-]{1,120}$/
const MAX_TEXT = 10_000
const MAX_TITLE = 200
const MAX_QUERY = 200
const MAX_PAGE_TOKEN = 2000
const MAX_PAGE_SIZE = 50

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

function validateDocumentId(v: unknown): string {
  const id = asString(v, 'documentId', 120)
  if (!DOC_ID_RE.test(id)) {
    throw new Error('documentId is malformed. Expected a Google document ID (letters, digits, _ and -).')
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

function asMode(v: unknown): 'append' | 'prepend' {
  if (v === undefined || v === null || v === 'append') return 'append'
  if (v === 'prepend') return 'prepend'
  throw new Error("mode must be 'append' or 'prepend'.")
}

// ---------------------------------------------------------------------------
// Google API helpers
// ---------------------------------------------------------------------------

interface DocsDocument {
  documentId: string
  title: string
  revisionId?: string
  body?: { content?: Array<{ endIndex?: number; paragraph?: { elements?: Array<{ textRun?: { content?: string } }> } }> }
}

interface CreateDocResponse {
  documentId: string
  title?: string
}

async function fetchDocument(token: string, documentId: string): Promise<DocsDocument> {
  return googleRequest<DocsDocument>({
    method: 'GET',
    url: `https://docs.googleapis.com/v1/documents/${documentId}`,
    token,
  })
}

function extractContent(doc: DocsDocument): { text: string; paragraphs: number } {
  const els = doc.body?.content ?? []
  const parts: string[] = []
  let paragraphs = 0
  for (const el of els) {
    if (el.paragraph) {
      paragraphs += 1
      let paraText = ''
      for (const e of el.paragraph.elements ?? []) {
        paraText += e.textRun?.content ?? ''
      }
      parts.push(paraText)
    }
  }
  return { text: parts.join(''), paragraphs }
}

function docsError(err: unknown): Error {
  if (err instanceof GoogleApiError) {
    return new Error(`Google Docs API ${err.status}${err.reason ? ` (${err.reason})` : ''}: ${err.message}`)
  }
  return err instanceof Error ? err : new Error(String(err))
}

function toTextResult(result: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function getDocument(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const documentId = validateDocumentId(args.documentId)
  const doc = await fetchDocument(token, documentId)
  const { text, paragraphs } = extractContent(doc)
  return toTextResult({
    documentId: doc.documentId,
    title: doc.title,
    revisionId: doc.revisionId ?? null,
    paragraphs,
    characters: text.length,
    content: text.slice(0, 8000) + (text.length > 8000 ? `\n…(truncated, total ${text.length} chars)` : ''),
    url: `https://docs.google.com/document/d/${doc.documentId}/edit`,
  })
}

async function listDocuments(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const query = asOptionalString(args.query, 'query', MAX_QUERY)
  const pageSize = asPageSize(args.pageSize)
  const pageToken = asOptionalString(args.pageToken, 'pageToken', MAX_PAGE_TOKEN)

  const q = [
    "mimeType='application/vnd.google-apps.document'",
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
    documents: (res.files ?? []).map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime ?? null })),
    count: (res.files ?? []).length,
    nextPageToken: res.nextPageToken ?? null,
  })
}

async function createDocument(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const title = asString(args.title, 'title', MAX_TITLE)
  const res = await googleRequest<CreateDocResponse>({
    method: 'POST',
    url: 'https://docs.googleapis.com/v1/documents',
    body: { title },
    token,
  })
  return toTextResult({
    documentId: res.documentId,
    title: res.title ?? title,
    url: `https://docs.google.com/document/d/${res.documentId}/edit`,
    location: 'Google Drive (root)',
  })
}

async function updateDocument(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const documentId = validateDocumentId(args.documentId)
  const text = asString(args.text, 'text', MAX_TEXT)
  const mode = asMode(args.mode)

  // Locate the insertion index from the live document (append: end; prepend: start).
  const doc = await fetchDocument(token, documentId)
  const els = doc.body?.content ?? []
  let endIndex = 1
  let startIndex = 1
  for (const el of els) {
    if (typeof el.endIndex === 'number') endIndex = el.endIndex
    if (el.paragraph && el.endIndex && el.endIndex > startIndex) startIndex = el.endIndex
  }

  const location = mode === 'append' ? 'append' : 'prepend'
  // Insertion index must be strictly less than the end index of the containing
  // segment. Appending at `endIndex` fails on an empty document (segment ends
  // at 2, so index 2 is out of range); inserting at `endIndex - 1` lands just
  // before the trailing newline and is valid for both empty and populated docs.
  const index = mode === 'append' ? Math.max(1, endIndex - 1) : 1
  const insertText = mode === 'append' ? `\n${text}` : `${text}\n`

  const res = await googleRequest<{ documentId: string; title?: string }>({
    method: 'POST',
    url: `https://docs.googleapis.com/v1/documents/${documentId}:batchUpdate`,
    body: {
      requests: [
        {
          insertText: {
            location: { index },
            text: insertText,
          },
        },
      ],
    },
    token,
  })

  return toTextResult({
    documentId: res.documentId,
    title: res.title ?? null,
    operation: 'batchUpdate.insertText',
    mode: location,
    insertedCharacters: insertText.length,
    insertIndex: index,
    note: 'Verify persistence by reading the document back with docs_get_document.',
  })
}

// ---------------------------------------------------------------------------
// MCP registration
// ---------------------------------------------------------------------------

const TOOLS: McpTool[] = [
  {
    name: 'docs_get_document',
    description:
      'Read a Google Docs document: title, documentId, revisionId, and the normalized text content of the body (bounded to the first 8000 characters).',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'Google Docs document ID.' },
      },
      required: ['documentId'],
    },
  },
  {
    name: 'docs_list_documents',
    description:
      'Discover Google Docs available to the connected identity (Drive discovery only, filtered to application/vnd.google-apps.document).',
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
    name: 'docs_create_document',
    description: 'Create a new Google Doc with the given title.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 200, description: 'Document title.' },
      },
      required: ['title'],
    },
  },
  {
    name: 'docs_update_document',
    description:
      'Insert text into a Google Doc using batchUpdate.insertText. Deliberately constrained: text is inserted at the end (append) or start (prepend) of the document body.',
    inputSchema: {
      type: 'object',
      properties: {
        documentId: { type: 'string', description: 'Google Docs document ID.' },
        text: { type: 'string', maxLength: 10000, description: 'Text to insert.' },
        mode: { type: 'string', enum: ['append', 'prepend'], description: 'Insertion mode (default append).' },
      },
      required: ['documentId', 'text'],
    },
  },
]

startMcpServer({
  name: 'google-docs',
  version: '0.1.0',
  tools: TOOLS,
  callTool: async (name, args) => {
    try {
const token = await import('../shared/google/auth').then((m) => m.getAccessToken())
  switch (name) {
        case 'docs_get_document':
          return await getDocument(token, args)
        case 'docs_list_documents':
          return await listDocuments(token, args)
        case 'docs_create_document':
          return await createDocument(token, args)
        case 'docs_update_document':
          return await updateDocument(token, args)
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
      }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${docsError(err).message}` }], isError: true }
    }
  },
})