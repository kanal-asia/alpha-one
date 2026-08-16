#!/usr/bin/env node
/**
 * Google Sheets MCP Server (TASK-OPENCODE-031)
 *
 * Standalone Model Context Protocol server for Google Sheets.
 * Communicates via JSON-RPC 2.0 over stdio (no SDK dependency).
 *
 * Registered in opencode.jsonc as:
 *   "mcp": { "google-sheets": { "type": "local", "command": ["npx", "tsx", "mcp-servers/google-sheets/server.ts"] } }
 *
 * Tools exposed:
 *   google_sheets.list_sheets   — List worksheets in a spreadsheet
 *   google_sheets.read_range    — Read cell values from a range
 *   google_sheets.write_range   — Write cell values to a range
 *   google_sheets.append_rows   — Append rows to a worksheet
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Google Sheets API helpers (inline, no imports from src/ to avoid bundling)
// ---------------------------------------------------------------------------

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4'
const CONNECTIONS_FILE = join(process.cwd(), '.alpha', 'google', 'connections.json')
const LOCAL_USER = 'local-user'

interface GoogleConnection {
  accessToken: string
  refreshToken?: string
  tokenExpiry: number
}

async function loadConnection(): Promise<GoogleConnection | null> {
  try {
    const data = await readFile(CONNECTIONS_FILE, 'utf-8')
    const connections = JSON.parse(data) as Record<string, GoogleConnection>
    return connections[LOCAL_USER] ?? null
  } catch {
    return null
  }
}

async function getAccessToken(): Promise<string> {
  const conn = await loadConnection()
  if (!conn) {
    throw new Error('Google account not connected. Please connect your Google account in Alpha Workspace Settings.')
  }

  // Token still valid (5 min buffer)
  if (Date.now() < conn.tokenExpiry - 5 * 60 * 1000) {
    return conn.accessToken
  }

  // Try refresh
  if (!conn.refreshToken) {
    throw new Error('Google authorization expired. Please reconnect your Google account in Settings.')
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured on server.')
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!resp.ok) {
    throw new Error('Google authorization expired. Please reconnect your Google account in Settings.')
  }

  const tokens = await resp.json() as {
    access_token: string
    expires_in: number
  }

  // Update stored token
  conn.accessToken = tokens.access_token
  conn.tokenExpiry = Date.now() + tokens.expires_in * 1000

  // Write back
  const allData = await readFile(CONNECTIONS_FILE, 'utf-8')
  const all = JSON.parse(allData) as Record<string, GoogleConnection>
  all[LOCAL_USER] = conn
  const { writeFile: wf } = await import('node:fs/promises')
  await wf(CONNECTIONS_FILE, JSON.stringify(all, null, 2))

  return conn.accessToken
}

async function sheetsGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const token = await getAccessToken()
  const url = new URL(`${SHEETS_API_BASE}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }

  const resp = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as {
      error?: { message?: string; code?: number }
    }
    const msg = err.error?.message ?? `Sheets API error: ${resp.status}`
    const code = err.error?.code ?? resp.status
    if (code === 401) throw new Error('Google authorization expired. Please reconnect your Google account.')
    if (code === 403) throw new Error('Permission denied. You do not have access to this spreadsheet.')
    if (code === 404) throw new Error('Spreadsheet not found. It may have been moved or deleted.')
    throw new Error(msg)
  }

  return resp.json() as Promise<T>
}

async function sheetsPut<T>(path: string, body: unknown, params?: Record<string, string>): Promise<T> {
  const token = await getAccessToken()
  const url = new URL(`${SHEETS_API_BASE}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const resp = await fetch(url.toString(), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as {
      error?: { message?: string; code?: number }
    }
    const msg = err.error?.message ?? `Sheets API error: ${resp.status}`
    const code = err.error?.code ?? resp.status
    if (code === 401) throw new Error('Google authorization expired. Please reconnect your Google account.')
    if (code === 403) throw new Error('Permission denied. You do not have write access to this spreadsheet.')
    if (code === 404) throw new Error('Spreadsheet not found.')
    throw new Error(msg)
  }

  return resp.json() as Promise<T>
}

async function sheetsPost<T>(path: string, body: unknown, params?: Record<string, string>): Promise<T> {
  const token = await getAccessToken()
  const url = new URL(`${SHEETS_API_BASE}${path}`)
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({})) as {
      error?: { message?: string; code?: number }
    }
    const msg = err.error?.message ?? `Sheets API error: ${resp.status}`
    const code = err.error?.code ?? resp.status
    if (code === 401) throw new Error('Google authorization expired. Please reconnect your Google account.')
    if (code === 403) throw new Error('Permission denied. You do not have access to this spreadsheet.')
    if (code === 404) throw new Error('Spreadsheet not found.')
    throw new Error(msg)
  }

  return resp.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

async function listSheets(spreadsheetId: string): Promise<ToolResult> {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    return { content: [{ type: 'text', text: 'Error: spreadsheetId is required.' }], isError: true }
  }

  try {
    const data = await sheetsGet<{
      spreadsheetId: string
      properties?: { title?: string }
      sheets?: Array<{
        sheetId?: number
        properties?: {
          title?: string
          index?: number
          sheetType?: string
          gridProperties?: { rowCount?: number; columnCount?: number }
        }
      }>
    }>(`/spreadsheets/${spreadsheetId}`)

    const result = {
      spreadsheetId: data.spreadsheetId,
      spreadsheetTitle: data.properties?.title ?? 'Untitled',
      sheets: (data.sheets ?? []).map((s) => ({
        sheetId: s.sheetId ?? 0,
        title: s.properties?.title ?? 'Untitled Sheet',
        index: s.properties?.index ?? 0,
        rowCount: s.properties?.gridProperties?.rowCount,
        columnCount: s.properties?.gridProperties?.columnCount,
      })),
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Failed to list sheets.'}` }],
      isError: true,
    }
  }
}

async function readRange(spreadsheetId: string, range: string): Promise<ToolResult> {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    return { content: [{ type: 'text', text: 'Error: spreadsheetId is required.' }], isError: true }
  }
  if (!range || typeof range !== 'string') {
    return { content: [{ type: 'text', text: 'Error: range is required (A1 notation, e.g. "Sheet1!A1:B10").' }], isError: true }
  }

  try {
    const data = await sheetsGet<{
      range: string
      majorDimension?: string
      values?: (string | number | boolean | null)[][]
    }>(`/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
      valueRenderOption: 'FORMATTED_VALUE',
    })

    const result = {
      range: data.range,
      majorDimension: data.majorDimension ?? 'ROWS',
      rowCount: (data.values ?? []).length,
      values: data.values ?? [],
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Failed to read range.'}` }],
      isError: true,
    }
  }
}

async function writeRange(
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean | null)[][]
): Promise<ToolResult> {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    return { content: [{ type: 'text', text: 'Error: spreadsheetId is required.' }], isError: true }
  }
  if (!range || typeof range !== 'string') {
    return { content: [{ type: 'text', text: 'Error: range is required (A1 notation).' }], isError: true }
  }
  if (!Array.isArray(values) || !values.every(Array.isArray)) {
    return { content: [{ type: 'text', text: 'Error: values must be a 2D array.' }], isError: true }
  }

  try {
    const data = await sheetsPut<{
      updatedCells?: number
      updatedRows?: number
      updatedColumns?: number
      updatedRange?: string
    }>(`/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
      values,
    }, { valueInputOption: 'USER_ENTERED' })

    const result = {
      updatedCells: data.updatedCells ?? 0,
      updatedRows: data.updatedRows ?? 0,
      updatedColumns: data.updatedColumns ?? 0,
      updatedRange: data.updatedRange ?? range,
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Failed to write range.'}` }],
      isError: true,
    }
  }
}

async function appendRows(
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean | null)[][]
): Promise<ToolResult> {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    return { content: [{ type: 'text', text: 'Error: spreadsheetId is required.' }], isError: true }
  }
  if (!range || typeof range !== 'string') {
    return { content: [{ type: 'text', text: 'Error: range is required (A1 notation).' }], isError: true }
  }
  if (!Array.isArray(values) || !values.every(Array.isArray)) {
    return { content: [{ type: 'text', text: 'Error: values must be a 2D array.' }], isError: true }
  }

  try {
    const data = await sheetsPost<{
      updates?: {
        updatedCells?: number
        updatedRows?: number
        updatedColumns?: number
        updatedRange?: string
      }
    }>(`/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append`, {
      values,
    }, { valueInputOption: 'USER_ENTERED' })

    const result = {
      updatedCells: data.updates?.updatedCells ?? 0,
      updatedRows: data.updates?.updatedRows ?? 0,
      updatedColumns: data.updates?.updatedColumns ?? 0,
      updatedRange: data.updates?.updatedRange ?? range,
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Failed to append rows.'}` }],
      isError: true,
    }
  }
}

// ---------------------------------------------------------------------------
// MCP JSON-RPC 2.0 Server (stdio)
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number | string
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number | string | null
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

const TOOLS = [
  {
    name: 'google_sheets.list_sheets',
    description: 'List all worksheets/tabs in a Google Spreadsheet. Returns sheet titles, IDs, and dimensions.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The Google Spreadsheet ID (from the URL or attached resource)',
        },
      },
      required: ['spreadsheetId'],
    },
  },
  {
    name: 'google_sheets.read_range',
    description: 'Read actual cell values from a worksheet/range in a Google Spreadsheet. Use A1 notation (e.g. "Product Performance_Monthly!A3:K10").',
    inputSchema: {
      type: 'object' as const,
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The Google Spreadsheet ID',
        },
        range: {
          type: 'string',
          description: 'A1 notation range (e.g. "Sheet1!A1:B10" or "Product Performance_Monthly!A3:K10")',
        },
      },
      required: ['spreadsheetId', 'range'],
    },
  },
  {
    name: 'google_sheets.write_range',
    description: 'Write cell values to a worksheet/range in a Google Spreadsheet. Overwrites existing values. Use for precise cell updates.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The Google Spreadsheet ID',
        },
        range: {
          type: 'string',
          description: 'A1 notation range (e.g. "Sheet1!A1" or "AlphaOne_Smoke_Test!A1:B2")',
        },
        values: {
          type: 'array',
          items: { type: 'array', items: {} },
          description: '2D array of values to write (e.g. [["A1_value", "B1_value"], ["A2_value", "B2_value"]])',
        },
      },
      required: ['spreadsheetId', 'range', 'values'],
    },
  },
  {
    name: 'google_sheets.append_rows',
    description: 'Append rows to a worksheet in a Google Spreadsheet. Adds new rows after existing data.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The Google Spreadsheet ID',
        },
        range: {
          type: 'string',
          description: 'A1 notation range (typically sheet name, e.g. "Sheet1")',
        },
        values: {
          type: 'array',
          items: { type: 'array', items: {} },
          description: '2D array of row values to append',
        },
      },
      required: ['spreadsheetId', 'range', 'values'],
    },
  },
]

function handleRequest(req: JsonRpcRequest): JsonRpcResponse {
  // -- initialize --
  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'google-sheets',
          version: '1.0.0',
        },
      },
    }
  }

  // -- notifications/initialized --
  if (req.method === 'notifications/initialized') {
    return { jsonrpc: '2.0', id: null }
  }

  // -- tools/list --
  if (req.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: { tools: TOOLS },
    }
  }

  // -- tools/call --
  if (req.method === 'tools/call') {
    const params = req.params as { name: string; arguments?: Record<string, unknown> } | undefined
    if (!params) {
      return {
        jsonrpc: '2.0',
        id: req.id,
        error: { code: -32602, message: 'Missing params' },
      }
    }

    const { name, arguments: args = {} } = params

    // Dispatch synchronously (tools are fast enough)
    let promise: Promise<ToolResult>

    switch (name) {
      case 'google_sheets.list_sheets':
        promise = listSheets(args.spreadsheetId as string)
        break
      case 'google_sheets.read_range':
        promise = readRange(args.spreadsheetId as string, args.range as string)
        break
      case 'google_sheets.write_range':
        promise = writeRange(
          args.spreadsheetId as string,
          args.range as string,
          args.values as (string | number | boolean | null)[][]
        )
        break
      case 'google_sheets.append_rows':
        promise = appendRows(
          args.spreadsheetId as string,
          args.range as string,
          args.values as (string | number | boolean | null)[][]
        )
        break
      default:
        return {
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32601, message: `Unknown tool: ${name}` },
        }
    }

    // We need to handle async here — buffer the response
    return promise.then(
      (result) => ({ jsonrpc: '2.0', id: req.id, result }),
      (err) => ({
        jsonrpc: '2.0',
        id: req.id,
        result: {
          content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
          isError: true,
        },
      })
    )
  }

  // -- ping --
  if (req.method === 'ping') {
    return { jsonrpc: '2.0', id: req.id, result: {} }
  }

  // -- unknown --
  return {
    jsonrpc: '2.0',
    id: req.id,
    error: { code: -32601, message: `Method not found: ${req.method}` },
  }
}

// ---------------------------------------------------------------------------
// Stdio transport
// ---------------------------------------------------------------------------

let buffer = ''
let stdinClosed = false
const pending = new Set<Promise<unknown>>()

function writeResponse(res: JsonRpcResponse) {
  process.stdout.write(JSON.stringify(res) + '\n')
}

function handleAndRespond(req: JsonRpcRequest) {
  const response = handleRequest(req)

  if (response && typeof (response as Promise<JsonRpcResponse>).then === 'function') {
    const p = (response as Promise<JsonRpcResponse>)
      .then((res) => {
        if (res && res.id !== null && res.id !== undefined) writeResponse(res)
      })
      .catch((err) => {
        writeResponse({
          jsonrpc: '2.0',
          id: req.id,
          error: { code: -32603, message: err instanceof Error ? err.message : 'Internal error' },
        })
      })
      .finally(() => pending.delete(p))
    pending.add(p)
  } else if (response && (response as JsonRpcResponse).id !== null && (response as JsonRpcResponse).id !== undefined) {
    writeResponse(response as JsonRpcResponse)
  }
}

process.stdin.setEncoding('utf-8')
process.stdin.on('data', (chunk: string) => {
  buffer += chunk

  let newlineIdx: number
  while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
    const line = buffer.slice(0, newlineIdx).trim()
    buffer = buffer.slice(newlineIdx + 1)
    if (!line) continue

    try {
      const req = JSON.parse(line) as JsonRpcRequest
      handleAndRespond(req)
    } catch {
      // Ignore malformed JSON
    }
  }
})

process.stdin.on('end', () => {
  stdinClosed = true
  // Wait for pending async tool calls before exiting
  if (pending.size === 0) {
    process.exit(0)
  }
  Promise.allSettled([...pending]).then(() => process.exit(0))
})

// Keep process alive
process.stderr.write('google-sheets MCP server started\n')
