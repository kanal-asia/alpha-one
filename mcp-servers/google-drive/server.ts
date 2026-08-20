/**
 * TASK-070: Google Drive custom MCP.
 *
 * Built on the shared Google MCP foundation:
 *   mcp-servers/shared/google/auth.ts  - local OAuth/token access + refresh
 *   mcp-servers/shared/google/rest.ts  - authenticated REST + error normalization
 *   mcp-servers/shared/google/mcp.ts   - MCP stdio JSON-RPC bootstrap
 *
 * Service-specific surface only: Drive endpoints, argument validation, and
 * response shaping. No duplicate OAuth/token/MCP-bootstrap logic. No arbitrary
 * REST passthrough, no permission/ACL mutation, no ownership transfer, no
 * deletion capability, no uncontrolled payload sizes.
 */

import { googleRequest, GoogleApiError } from '../shared/google/rest'
import { startMcpServer, type McpTool, type McpToolResult } from '../shared/google/mcp'

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const FILE_ID_RE = /^[A-Za-z0-9_-]{1,120}$/
const MAX_NAME = 255
const MAX_MIME = 200
const MAX_QUERY = 500
const MAX_PAGE_TOKEN = 2000
const MAX_PAGE_SIZE = 100
const MAX_TEXT_CONTENT = 100_000
const MAX_CONTENT_RETURN = 50_000

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

function validateFileId(v: unknown, label = 'fileId'): string {
  const id = asString(v, label, 120)
  if (!FILE_ID_RE.test(id)) {
    throw new Error(`${label} is malformed. Expected a Google file ID (letters, digits, _ and -).`)
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

// ---------------------------------------------------------------------------
// Google API helpers
// ---------------------------------------------------------------------------

const FIELDS = 'files(id,name,mimeType,modifiedTime,size,webViewLink,trashed),nextPageToken'

const EXPORT_MIME: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  'application/vnd.google-apps.presentation': 'text/plain',
}

const NATIVE_TEXT = new Set([
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/html',
  'application/json',
  'application/xml',
])

function driveError(err: unknown): Error {
  if (err instanceof GoogleApiError) {
    return new Error(`Google Drive API ${err.status}${err.reason ? ` (${err.reason})` : ''}: ${err.message}`)
  }
  return err instanceof Error ? err : new Error(String(err))
}

function toTextResult(result: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}

interface DriveFileRecord {
  id: string
  name: string
  mimeType?: string
  size?: string
  modifiedTime?: string
  webViewLink?: string
}

function normalize(f: DriveFileRecord): {
  id: string
  name: string
  mimeType: string | null
  size: number | null
  modifiedTime: string | null
  webViewLink: string | null
} {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType ?? null,
    size: f.size ? Number(f.size) : null,
    modifiedTime: f.modifiedTime ?? null,
    webViewLink: f.webViewLink ?? null,
  }
}

async function fetchMetadata(token: string, fileId: string): Promise<DriveFileRecord> {
  return googleRequest<DriveFileRecord>({
    method: 'GET',
    url: `https://www.googleapis.com/drive/v3/files/${fileId}`,
    params: { fields: 'id,name,mimeType,size,modifiedTime,webViewLink,trashed' },
    token,
  })
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function listFiles(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const query = asOptionalString(args.query, 'query', MAX_QUERY)
  const mimeType = asOptionalString(args.mimeType, 'mimeType', MAX_MIME)
  const pageSize = asPageSize(args.pageSize)
  const pageToken = asOptionalString(args.pageToken, 'pageToken', MAX_PAGE_TOKEN)

  const q = query ?? (mimeType ? `mimeType='${mimeType.replaceAll("'", "\\'")}'` : 'trashed=false')

  const res = await googleRequest<{ files?: DriveFileRecord[]; nextPageToken?: string }>({
    method: 'GET',
    url: 'https://www.googleapis.com/drive/v3/files',
    params: {
      q,
      pageSize: pageSize ?? 20,
      fields: FIELDS,
      ...(pageToken ? { pageToken } : {}),
    },
    token,
  })

  return toTextResult({
    files: (res.files ?? []).map(normalize),
    count: (res.files ?? []).length,
    nextPageToken: res.nextPageToken ?? null,
  })
}

async function searchFiles(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const query = asString(args.query, 'query', MAX_QUERY)
  const pageSize = asPageSize(args.pageSize)
  const pageToken = asOptionalString(args.pageToken, 'pageToken', MAX_PAGE_TOKEN)

  const res = await googleRequest<{ files?: DriveFileRecord[]; nextPageToken?: string }>({
    method: 'GET',
    url: 'https://www.googleapis.com/drive/v3/files',
    params: {
      q: query,
      pageSize: pageSize ?? 20,
      fields: FIELDS,
      ...(pageToken ? { pageToken } : {}),
    },
    token,
  })

  return toTextResult({
    files: (res.files ?? []).map(normalize),
    count: (res.files ?? []).length,
    nextPageToken: res.nextPageToken ?? null,
  })
}

async function getFileMetadata(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const fileId = validateFileId(args.fileId)
  const f = await fetchMetadata(token, fileId)
  return toTextResult(normalize(f))
}

async function getFileContent(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const fileId = validateFileId(args.fileId)
  const meta = await fetchMetadata(token, fileId)
  const mime = meta.mimeType ?? ''

  let content: string
  let contentMime: string

  if (mime in EXPORT_MIME) {
    contentMime = EXPORT_MIME[mime]
    content = await googleRequest<string>({
      method: 'GET',
      url: `https://www.googleapis.com/drive/v3/files/${fileId}/export`,
      params: { mimeType: contentMime },
      token,
    })
  } else if (NATIVE_TEXT.has(mime)) {
    contentMime = mime
    content = await googleRequest<string>({
      method: 'GET',
      url: `https://www.googleapis.com/drive/v3/files/${fileId}`,
      params: { alt: 'media' },
      token,
    })
  } else {
    return toTextResult({
      fileId,
      name: meta.name,
      mimeType: mime,
      supported: false,
      message: `File type ${mime || 'unknown'} is not supported by drive_get_file_content (text/export-capable types only).`,
    })
  }

  const truncated = content.length > MAX_CONTENT_RETURN
  const bounded = truncated ? content.slice(0, MAX_CONTENT_RETURN) : content
  return toTextResult({
    fileId,
    name: meta.name,
    mimeType: mime,
    contentMimeType: contentMime,
    characters: content.length,
    truncated,
    content: bounded,
  })
}

async function createFile(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const name = asString(args.name, 'name', MAX_NAME)
  const mimeType = asOptionalString(args.mimeType, 'mimeType', MAX_MIME) ?? 'text/plain'
  const textContent = asOptionalString(args.textContent, 'textContent', MAX_TEXT_CONTENT)

  const created = await googleRequest<{ id: string; name?: string }>({
    method: 'POST',
    url: 'https://www.googleapis.com/drive/v3/files',
    body: { name, mimeType },
    token,
  })

  let uploadedCharacters: number | null = null
  if (textContent) {
    await googleRequest<unknown>({
      method: 'PATCH',
      url: `https://www.googleapis.com/upload/drive/v3/files/${created.id}?uploadType=media`,
      headers: { 'Content-Type': 'text/plain' },
      body: textContent,
      token,
    })
    uploadedCharacters = textContent.length
  }

  return toTextResult({
    fileId: created.id,
    name: created.name ?? name,
    mimeType,
    uploadedCharacters,
    webViewLink: `https://drive.google.com/file/d/${created.id}/view`,
    location: 'Google Drive (root)',
  })
}

async function updateFile(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const fileId = validateFileId(args.fileId)
  const name = asOptionalString(args.name, 'name', MAX_NAME)
  const textContent = asOptionalString(args.textContent, 'textContent', MAX_TEXT_CONTENT)

  if (name) {
    await googleRequest<unknown>({
      method: 'PATCH',
      url: `https://www.googleapis.com/drive/v3/files/${fileId}`,
      body: { name },
      token,
    })
  }
  if (textContent) {
    const meta = await fetchMetadata(token, fileId)
    if (!NATIVE_TEXT.has(meta.mimeType ?? '')) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: textContent updates are only supported for native text files (got mimeType ${meta.mimeType ?? 'unknown'}). Use name-only updates for this file.`,
          },
        ],
        isError: true,
      }
    }
    await googleRequest<unknown>({
      method: 'PATCH',
      url: `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      headers: { 'Content-Type': 'text/plain' },
      body: textContent,
      token,
    })
  }

  return toTextResult({
    fileId,
    updatedName: name ?? null,
    updatedCharacters: textContent ? textContent.length : null,
    note: 'Verify persistence by reading the file back with drive_get_file_metadata / drive_get_file_content.',
  })
}

// ---------------------------------------------------------------------------
// MCP registration
// ---------------------------------------------------------------------------

const TOOLS: McpTool[] = [
  {
    name: 'drive_list_files',
    description:
      'List files from Google Drive (not trashed). Optionally filter by MIME type or a raw Drive query. Returns normalized records (id, name, mimeType, modifiedTime, size, webViewLink).',
    inputSchema: {
      type: 'object',
      properties: {
        pageSize: { type: 'integer', minimum: 1, maximum: 100, description: 'Results per page (default 20).' },
        pageToken: { type: 'string', description: 'Pagination token from a previous call.' },
        mimeType: { type: 'string', maxLength: 200, description: 'Optional exact MIME type filter (e.g. application/pdf).' },
        query: { type: 'string', maxLength: 500, description: 'Optional raw Drive query; passed verbatim when provided (overrides mimeType).' },
      },
    },
  },
  {
    name: 'drive_search_files',
    description:
      'Search Drive using Google Drive query syntax (e.g. "name contains \'report\'"). Query is passed verbatim. Returns normalized file metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', maxLength: 500, description: 'Drive search query (Google query syntax).' },
        pageSize: { type: 'integer', minimum: 1, maximum: 100, description: 'Results per page (default 20).' },
        pageToken: { type: 'string', description: 'Pagination token from a previous call.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'drive_get_file_metadata',
    description: 'Retrieve normalized metadata for a single Drive file.',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Google Drive file ID.' },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'drive_get_file_content',
    description:
      'Retrieve readable content for supported files: native text types (text/plain, text/csv, text/markdown, text/html, application/json, application/xml) via media download, and Google Docs/Sheets/Slides via export. Content is bounded. Unsupported binary types return a controlled message.',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Google Drive file ID.' },
      },
      required: ['fileId'],
    },
  },
  {
    name: 'drive_create_file',
    description:
      'Create a file in Drive with the given name and optional MIME type and text content. Deliberately limited; requires a write-capable Drive scope.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', maxLength: 255, description: 'File name.' },
        mimeType: { type: 'string', maxLength: 200, description: 'Optional MIME type (default text/plain).' },
        textContent: { type: 'string', maxLength: 100000, description: 'Optional text content.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'drive_update_file',
    description:
      'Update only safe fields of a Drive file: name, and optionally text content for native text files. No permission/ACL/ownership/metadata changes. Requires a write-capable Drive scope.',
    inputSchema: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'Google Drive file ID.' },
        name: { type: 'string', maxLength: 255, description: 'New file name.' },
        textContent: { type: 'string', maxLength: 100000, description: 'New text content (native text files only).' },
      },
      required: ['fileId'],
    },
  },
]

startMcpServer({
  name: 'google-drive',
  version: '0.1.0',
  tools: TOOLS,
  callTool: async (name, args) => {
    try {
      const token = await import('../shared/google/auth').then((m) => m.getAccessToken())
      switch (name) {
        case 'drive_list_files':
          return await listFiles(token, args)
        case 'drive_search_files':
          return await searchFiles(token, args)
        case 'drive_get_file_metadata':
          return await getFileMetadata(token, args)
        case 'drive_get_file_content':
          return await getFileContent(token, args)
        case 'drive_create_file':
          return await createFile(token, args)
        case 'drive_update_file':
          return await updateFile(token, args)
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
      }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${driveError(err).message}` }], isError: true }
    }
  },
})