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
 * Tools exposed (TASK-OPENCODE-047 — aligned with the official Google Sheets MCP capability model):
 *   google_sheets.list_sheets       — List worksheets in a spreadsheet (metadata-first)
 *   google_sheets.get_spreadsheet   — Spreadsheet-level metadata + optional grid data (≈ Google get_spreadsheet)
 *   google_sheets.read_range        — Read cell values from a range (≈ Google get_values)
 *   google_sheets.write_range       — Write cell values to a range, target sheet MUST exist (≈ Google update_values)
 *   google_sheets.write_formulas    — Write formulas to a range, target sheet MUST exist (≈ Google update_formulas)
 *   google_sheets.append_rows       — Append rows to a worksheet, target sheet MUST exist
 *   google_sheets.insert_dimension  — Insert rows/columns into an existing sheet (≈ Google insert_dimension)
 *   google_sheets.create_sheet      — Create a new worksheet/tab (safe subset of Google update_spreadsheet addSheet)
 *   google_sheets.update_spreadsheet — Safe allowlisted structural updates only (Google update_spreadsheet subset)
 *
 * Safety invariants (TASK-OPENCODE-046, preserved):
 *   - A CREATE request must never fall back to writing an existing sheet.
 *   - write/append/formulas target sheets MUST exist, otherwise explicit error.
 *   - create_sheet rejects duplicate titles.
 *   - No arbitrary raw batchUpdate requests[] passthrough (TASK-OPENCODE-047).
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

/**
 * TASK-OPENCODE-046: Resolve the sheet title referenced by an A1 range.
 * Accepts "Sheet1!A1:B2", "'Sheet Name'!A1", or a bare sheet title ("Sheet1").
 * Returns null when no sheet reference can be parsed.
 */
function parseSheetNameFromRange(range: string): string | null {
  if (!range) return null
  const bang = range.indexOf('!')
  const raw = bang === -1 ? range.trim() : range.slice(0, bang).trim()
  if (!raw) return null
  // Strip surrounding single quotes ('Sheet Name' -> Sheet Name)
  const m = raw.match(/^'(.*)'$/)
  return (m ? m[1] : raw)
}

/**
 * TASK-OPENCODE-046: Fetch the current sheet titles for a spreadsheet.
 * Used to guarantee write/append targets already exist and to prevent
 * silently substituting a different sheet.
 */
async function getSheetTitles(spreadsheetId: string): Promise<string[]> {
  const data = await sheetsGet<{
    sheets?: Array<{ properties?: { title?: string } }>
  }>(`/spreadsheets/${spreadsheetId}`)
  return (data.sheets ?? [])
    .map((s) => s.properties?.title ?? '')
    .filter(Boolean)
}

/** TASK-OPENCODE-046: Validate that the write/append target sheet exists. */
function assertSheetExists(sheetTitles: string[], targetSheet: string | null): string | null {
  if (!targetSheet) return null
  if (!sheetTitles.some((t) => t.toLowerCase() === targetSheet.toLowerCase())) {
    return `Target sheet "${targetSheet}" does not exist in this spreadsheet. Use google_sheets.create_sheet to create it first. Do NOT write to an existing sheet as a substitute for creating a new sheet.`
  }
  return null
}

async function createSheet(spreadsheetId: string, title: string): Promise<ToolResult> {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    return { content: [{ type: 'text', text: 'Error: spreadsheetId is required.' }], isError: true }
  }
  if (!title || typeof title !== 'string' || !title.trim()) {
    return { content: [{ type: 'text', text: 'Error: title is required (the name of the new sheet/tab).' }], isError: true }
  }

  try {
    // Reject duplicate titles — do not silently reuse an existing sheet.
    const existing = await getSheetTitles(spreadsheetId)
    const titleTrimmed = title.trim()
    if (existing.some((t) => t.toLowerCase() === titleTrimmed.toLowerCase())) {
      return {
        content: [{
          type: 'text',
          text: `Error: a sheet named "${titleTrimmed}" already exists in this spreadsheet. Choose a unique title or write to the existing sheet explicitly.`,
        }],
        isError: true,
      }
    }

    const data = await sheetsPost<{
      replies?: Array<{ addSheet?: { properties?: { title?: string; sheetId?: number; index?: number } } }>
    }>(`/spreadsheets/${spreadsheetId}:batchUpdate`, {
      requests: [{ addSheet: { properties: { title: titleTrimmed } } }],
    })

    const created = data.replies?.[0]?.addSheet?.properties
    const result = {
      createdSheet: created?.title ?? titleTrimmed,
      sheetId: created?.sheetId,
      index: created?.index,
      spreadsheetId,
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Failed to create sheet.'}` }],
      isError: true,
    }
  }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

interface SheetMeta {
  sheetId: number
  title: string
  index: number
  sheetType: string
  rowCount?: number
  columnCount?: number
  frozenRowCount?: number
  frozenColumnCount?: number
  hidden: boolean
}

interface SpreadsheetMeta {
  spreadsheetId: string
  spreadsheetTitle: string
  locale?: string
  timeZone?: string
  autoRecalc?: string
  sheets: SheetMeta[]
}

/**
 * TASK-OPENCODE-047: Fetch spreadsheet metadata. Metadata-first; gridData is
 * only returned when includeGridData is explicitly requested.
 */
async function getSpreadsheetMeta(
  spreadsheetId: string,
  includeGridData = false
): Promise<SpreadsheetMeta> {
  const path = `/spreadsheets/${spreadsheetId}`
  const params = includeGridData ? { includeGridData: 'true' } : undefined
  const data = await sheetsGet<{
    spreadsheetId: string
    properties?: {
      title?: string
      locale?: string
      timeZone?: string
      autoRecalc?: string
    }
    sheets?: Array<{
      properties?: {
        sheetId?: number
        title?: string
        index?: number
        sheetType?: string
        hidden?: boolean
        gridProperties?: {
          rowCount?: number
          columnCount?: number
          frozenRowCount?: number
          frozenColumnCount?: number
        }
      }
      data?: unknown[]
    }>
  }>(path, params)

  return {
    spreadsheetId: data.spreadsheetId,
    spreadsheetTitle: data.properties?.title ?? 'Untitled',
    locale: data.properties?.locale,
    timeZone: data.properties?.timeZone,
    autoRecalc: data.properties?.autoRecalc,
    sheets: (data.sheets ?? []).map((s) => ({
      sheetId: s.properties?.sheetId ?? 0,
      title: s.properties?.title ?? 'Untitled Sheet',
      index: s.properties?.index ?? 0,
      sheetType: s.properties?.sheetType ?? 'GRID',
      rowCount: s.properties?.gridProperties?.rowCount,
      columnCount: s.properties?.gridProperties?.columnCount,
      frozenRowCount: s.properties?.gridProperties?.frozenRowCount,
      frozenColumnCount: s.properties?.gridProperties?.frozenColumnCount,
      hidden: s.properties?.hidden ?? false,
    })),
  }
}

async function listSheets(spreadsheetId: string): Promise<ToolResult> {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    return { content: [{ type: 'text', text: 'Error: spreadsheetId is required.' }], isError: true }
  }

  try {
    const meta = await getSpreadsheetMeta(spreadsheetId)
    const result = {
      spreadsheetId: meta.spreadsheetId,
      spreadsheetTitle: meta.spreadsheetTitle,
      sheets: meta.sheets.map((s) => ({
        sheetId: s.sheetId,
        title: s.title,
        index: s.index,
        sheetType: s.sheetType,
        rowCount: s.rowCount,
        columnCount: s.columnCount,
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

/**
 * TASK-OPENCODE-047: Google `get_spreadsheet` equivalent.
 * Returns spreadsheet metadata (title, locale, timeZone, per-sheet details) and,
 * only when includeGridData is true, the raw grid data. Metadata-first by default.
 */
async function getSpreadsheet(spreadsheetId: string, includeGridData: boolean): Promise<ToolResult> {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    return { content: [{ type: 'text', text: 'Error: spreadsheetId is required.' }], isError: true }
  }

  try {
    const meta = await getSpreadsheetMeta(spreadsheetId, includeGridData)
    const result = {
      spreadsheetId: meta.spreadsheetId,
      spreadsheetTitle: meta.spreadsheetTitle,
      locale: meta.locale,
      timeZone: meta.timeZone,
      autoRecalc: meta.autoRecalc,
      sheets: meta.sheets,
      includeGridData,
    }

    // When grid data is requested, append it from the raw API payload.
    if (includeGridData) {
      const data = await sheetsGet<{
        sheets?: Array<{ data?: unknown[] }>
      }>(`/spreadsheets/${spreadsheetId}`, { includeGridData: 'true' })
      result.sheets = (data.sheets ?? []).map((s, i) => ({
        ...meta.sheets[i],
        data: s.data ?? [],
      }))
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Failed to get spreadsheet.'}` }],
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
    // TASK-OPENCODE-046: refuse to write when the target sheet does not exist.
    const targetSheet = parseSheetNameFromRange(range)
    if (targetSheet) {
      const sheetTitles = await getSheetTitles(spreadsheetId)
      const guard = assertSheetExists(sheetTitles, targetSheet)
      if (guard) return { content: [{ type: 'text', text: `Error: ${guard}` }], isError: true }
    }

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
    // TASK-OPENCODE-046: refuse to append when the target sheet does not exist.
    const targetSheet = parseSheetNameFromRange(range)
    if (targetSheet) {
      const sheetTitles = await getSheetTitles(spreadsheetId)
      const guard = assertSheetExists(sheetTitles, targetSheet)
      if (guard) return { content: [{ type: 'text', text: `Error: ${guard}` }], isError: true }
    }

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

/**
 * TASK-OPENCODE-047: Google `update_formulas` equivalent.
 * Writes formulas (e.g. "=SUM(A1:A3)") into a range using the Sheets
 * `values.update` API with USER_ENTERED input (the appropriate mechanism —
 * NOT raw value writes). Target sheet must already exist (TASK-046 guard).
 */
async function writeFormulas(
  spreadsheetId: string,
  range: string,
  formulas: (string | number | boolean | null)[][]
): Promise<ToolResult> {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    return { content: [{ type: 'text', text: 'Error: spreadsheetId is required.' }], isError: true }
  }
  if (!range || typeof range !== 'string') {
    return { content: [{ type: 'text', text: 'Error: range is required (A1 notation).' }], isError: true }
  }
  if (!Array.isArray(formulas) || !formulas.every(Array.isArray)) {
    return { content: [{ type: 'text', text: 'Error: formulas must be a 2D array.' }], isError: true }
  }

  try {
    // TASK-OPENCODE-046: refuse to write formulas when the target sheet does not exist.
    const targetSheet = parseSheetNameFromRange(range)
    if (targetSheet) {
      const sheetTitles = await getSheetTitles(spreadsheetId)
      const guard = assertSheetExists(sheetTitles, targetSheet)
      if (guard) return { content: [{ type: 'text', text: `Error: ${guard}` }], isError: true }
    }

    const data = await sheetsPut<{
      updatedCells?: number
      updatedRows?: number
      updatedColumns?: number
      updatedRange?: string
    }>(`/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
      values: formulas,
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
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Failed to write formulas.'}` }],
      isError: true,
    }
  }
}

const VALID_DIMENSIONS = new Set(['ROWS', 'COLUMNS'])

/**
 * TASK-OPENCODE-047: Google `insert_dimension` equivalent.
 * Inserts rows or columns into an existing sheet via batchUpdate
 * InsertDimensionRequest. Validates spreadsheet, sheet, dimension, and
 * indexes (0-based, start inclusive, end exclusive, start < end).
 * This tool never deletes dimensions.
 */
async function insertDimension(
  spreadsheetId: string,
  sheetIdOrTitle: string | number,
  dimension: string,
  startIndex: number,
  endIndex: number,
  inheritFromBefore?: boolean
): Promise<ToolResult> {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    return { content: [{ type: 'text', text: 'Error: spreadsheetId is required.' }], isError: true }
  }
  if (sheetIdOrTitle === undefined || sheetIdOrTitle === null || sheetIdOrTitle === '') {
    return { content: [{ type: 'text', text: 'Error: sheetId (numeric) or sheetTitle (string) is required.' }], isError: true }
  }
  if (!VALID_DIMENSIONS.has(dimension)) {
    return { content: [{ type: 'text', text: `Error: dimension must be "ROWS" or "COLUMNS", got "${dimension}".` }], isError: true }
  }
  if (!Number.isInteger(startIndex) || startIndex < 0) {
    return { content: [{ type: 'text', text: 'Error: startIndex must be a non-negative integer (0-based, inclusive).' }], isError: true }
  }
  if (!Number.isInteger(endIndex) || endIndex <= startIndex) {
    return { content: [{ type: 'text', text: 'Error: endIndex must be an integer greater than startIndex (exclusive).' }], isError: true }
  }

  try {
    const meta = await getSpreadsheetMeta(spreadsheetId)
    let sheetId: number | undefined
    if (typeof sheetIdOrTitle === 'number') {
      const sheet = meta.sheets.find((s) => s.sheetId === sheetIdOrTitle)
      if (!sheet) {
        return { content: [{ type: 'text', text: `Error: sheet with id ${sheetIdOrTitle} does not exist in this spreadsheet.` }], isError: true }
      }
      sheetId = sheet.sheetId
    } else {
      const title = String(sheetIdOrTitle)
      const sheet = meta.sheets.find((s) => s.title.toLowerCase() === title.toLowerCase())
      if (!sheet) {
        return { content: [{ type: 'text', text: `Error: sheet "${title}" does not exist in this spreadsheet.` }], isError: true }
      }
      sheetId = sheet.sheetId
    }

    const request: Record<string, unknown> = {
      insertDimension: {
        range: {
          sheetId,
          dimension,
          startIndex,
          endIndex,
        },
      },
    }
    if (typeof inheritFromBefore === 'boolean') {
      (request.insertDimension as { inheritFromBefore?: boolean }).inheritFromBefore = inheritFromBefore
    }

    const data = await sheetsPost<{
      replies?: Array<Record<string, unknown>>
    }>(`/spreadsheets/${spreadsheetId}:batchUpdate`, {
      requests: [request],
    })

    const result = {
      inserted: true,
      sheetId,
      dimension,
      startIndex,
      endIndex,
      spread: endIndex - startIndex,
      spreadsheetId,
      replies: data.replies ?? [],
    }

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : 'Failed to insert dimension.'}` }],
      isError: true,
    }
  }
}

// TASK-OPENCODE-047: Safe structural operations allowlist for update_spreadsheet.
// Only NON-DESTRUCTIVE operations that add capacity are allowed. Everything
// else is intentionally deferred (documented, not exposed).
const SAFE_STRUCTURAL_OPERATIONS = new Set(['addSheet'])

/**
 * TASK-OPENCODE-047: Google `update_spreadsheet` SAFE SUBSET equivalent.
 * NOT an arbitrary batchUpdate requests[] passthrough. Accepts an explicit
 * operation name from a fixed allowlist. Currently supports only `addSheet`
 * (reusing TASK-046 create_sheet safety: unique title, reject duplicate).
 * Destructive operations (deleteSheet, deleteDimension, clear, cut/paste,
 * replace, etc.) are intentionally deferred and return an explicit error.
 */
async function updateSpreadsheet(
  spreadsheetId: string,
  operation: string,
  opArgs: Record<string, unknown>
): Promise<ToolResult> {
  if (!spreadsheetId || typeof spreadsheetId !== 'string') {
    return { content: [{ type: 'text', text: 'Error: spreadsheetId is required.' }], isError: true }
  }
  if (!operation || typeof operation !== 'string') {
    return { content: [{ type: 'text', text: 'Error: operation is required.' }], isError: true }
  }
  if (!SAFE_STRUCTURAL_OPERATIONS.has(operation)) {
    return {
      content: [{
        type: 'text',
        text: `Error: operation "${operation}" is not supported by google_sheets.update_spreadsheet. ` +
          `Supported safe operations: addSheet. ` +
          `Destructive operations (deleteSheet, deleteDimension, clear, cutPaste, destructive replace, etc.) ` +
          `are intentionally deferred and must NOT be performed.`,
      }],
      isError: true,
    }
  }

  switch (operation) {
    case 'addSheet': {
      const title = opArgs.title
      if (typeof title !== 'string' || !title.trim()) {
        return { content: [{ type: 'text', text: 'Error: addSheet requires a unique "title".' }], isError: true }
      }
      return createSheet(spreadsheetId, title)
    }
    default:
      return { content: [{ type: 'text', text: 'Error: unsupported operation.' }], isError: true }
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

// ---------------------------------------------------------------------------
// Helpers: resolve spreadsheetId from fileId or explicit spreadsheetId
// ---------------------------------------------------------------------------

/**
 * Resolve the effective spreadsheetId from the tool arguments.
 * Accepts either `spreadsheetId` (explicit) or `fileId` (Google Drive file ID).
 * For Google Drive references, the fileId IS the spreadsheetId.
 */
function resolveSpreadsheetId(args: Record<string, unknown>): string | null {
  const explicit = args.spreadsheetId
  if (typeof explicit === 'string' && explicit) return explicit
  const fileId = args.fileId
  if (typeof fileId === 'string' && fileId) return fileId
  return null
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
        fileId: {
          type: 'string',
          description: 'Google Drive file ID from an attached reference. Use this when a Google Drive reference is attached — the fileId IS the spreadsheetId.',
        },
      },
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
        fileId: {
          type: 'string',
          description: 'Google Drive file ID from an attached reference. Use this when a Google Drive reference is attached — the fileId IS the spreadsheetId.',
        },
        range: {
          type: 'string',
          description: 'A1 notation range (e.g. "Sheet1!A1:B10" or "Product Performance_Monthly!A3:K10")',
        },
      },
      required: ['range'],
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
        fileId: {
          type: 'string',
          description: 'Google Drive file ID from an attached reference. Use this when a Google Drive reference is attached — the fileId IS the spreadsheetId.',
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
      required: ['range', 'values'],
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
        fileId: {
          type: 'string',
          description: 'Google Drive file ID from an attached reference. Use this when a Google Drive reference is attached — the fileId IS the spreadsheetId.',
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
      required: ['range', 'values'],
    },
  },
  {
    name: 'google_sheets.create_sheet',
    description: 'Create a new worksheet/tab in an existing Google Spreadsheet (uses Sheets batchUpdate addSheet). Use ONLY when the user explicitly asks to create a new sheet/tab. NEVER write to an existing sheet as a substitute for creating a new one.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The Google Spreadsheet ID',
        },
        fileId: {
          type: 'string',
          description: 'Google Drive file ID from an attached reference. Use this when a Google Drive reference is attached — the fileId IS the spreadsheetId.',
        },
        title: {
          type: 'string',
          description: 'The unique title of the new sheet/tab to create',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'google_sheets.get_spreadsheet',
    description: 'Get spreadsheet-level metadata for a Google Spreadsheet (title, locale, timeZone, per-sheet sheetId/title/index/type/grid dimensions). Metadata-first; set includeGridData=true only when grid cell values are explicitly needed (may be large). Equivalent of Google MCP get_spreadsheet.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The Google Spreadsheet ID',
        },
        fileId: {
          type: 'string',
          description: 'Google Drive file ID from an attached reference. Use this when a Google Drive reference is attached — the fileId IS the spreadsheetId.',
        },
        includeGridData: {
          type: 'boolean',
          description: 'If true, include full grid cell data. Default false (metadata only).',
        },
      },
    },
  },
  {
    name: 'google_sheets.write_formulas',
    description: 'Write formulas (e.g. "=SUM(A1:A3)") into a range of a Google Spreadsheet using values.update with USER_ENTERED input. Target sheet MUST already exist. Equivalent of Google MCP update_formulas.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The Google Spreadsheet ID',
        },
        fileId: {
          type: 'string',
          description: 'Google Drive file ID from an attached reference. Use this when a Google Drive reference is attached — the fileId IS the spreadsheetId.',
        },
        range: {
          type: 'string',
          description: 'A1 notation range (e.g. "Sheet1!A1:C3")',
        },
        formulas: {
          type: 'array',
          items: { type: 'array', items: {} },
          description: '2D array of formulas to write (e.g. [["=A1+B1","=SUM(C1:C3)"]])',
        },
      },
      required: ['range', 'formulas'],
    },
  },
  {
    name: 'google_sheets.insert_dimension',
    description: 'Insert rows or columns into an existing sheet of a Google Spreadsheet. Safe, non-destructive: never deletes dimensions. Equivalent of Google MCP insert_dimension.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The Google Spreadsheet ID',
        },
        fileId: {
          type: 'string',
          description: 'Google Drive file ID from an attached reference. Use this when a Google Drive reference is attached — the fileId IS the spreadsheetId.',
        },
        sheetId: {
          type: 'integer',
          description: 'Numeric ID of the target sheet (from google_sheets.list_sheets or get_spreadsheet). Provide either sheetId or sheetTitle.',
        },
        sheetTitle: {
          type: 'string',
          description: 'Title of the target sheet (alternative to sheetId). Provide either sheetId or sheetTitle.',
        },
        dimension: {
          type: 'string',
          enum: ['ROWS', 'COLUMNS'],
          description: 'The dimension to insert.',
        },
        startIndex: {
          type: 'integer',
          description: '0-based start index of insertion (inclusive).',
        },
        endIndex: {
          type: 'integer',
          description: '0-based end index of insertion (exclusive). Must be greater than startIndex.',
        },
        inheritFromBefore: {
          type: 'boolean',
          description: 'Whether dimension properties are inherited from the dimensions before (true) or after (false) the insertion.',
        },
      },
      required: ['dimension', 'startIndex', 'endIndex'],
    },
  },
  {
    name: 'google_sheets.update_spreadsheet',
    description: 'Apply a SAFE structural update to a Google Spreadsheet. NOT an arbitrary batchUpdate passthrough — only an explicit allowlist of non-destructive operations is supported. Currently supports operation="addSheet" (reuses create_sheet duplicate-title safety). Destructive operations are intentionally deferred and return an error.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        spreadsheetId: {
          type: 'string',
          description: 'The Google Spreadsheet ID',
        },
        fileId: {
          type: 'string',
          description: 'Google Drive file ID from an attached reference. Use this when a Google Drive reference is attached — the fileId IS the spreadsheetId.',
        },
        operation: {
          type: 'string',
          enum: ['addSheet'],
          description: 'The safe structural operation to perform. Supported: addSheet.',
        },
        title: {
          type: 'string',
          description: 'For operation="addSheet": the unique title of the new sheet/tab.',
        },
      },
      required: ['operation'],
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
      case 'google_sheets.list_sheets': {
        const sid = resolveSpreadsheetId(args)
        if (!sid) return { jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: 'Error: spreadsheetId or fileId is required.' }], isError: true } }
        promise = listSheets(sid)
        break
      }
      case 'google_sheets.read_range': {
        const sid = resolveSpreadsheetId(args)
        if (!sid) return { jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: 'Error: spreadsheetId or fileId is required.' }], isError: true } }
        promise = readRange(sid, args.range as string)
        break
      }
      case 'google_sheets.write_range': {
        const sid = resolveSpreadsheetId(args)
        if (!sid) return { jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: 'Error: spreadsheetId or fileId is required.' }], isError: true } }
        promise = writeRange(
          sid,
          args.range as string,
          args.values as (string | number | boolean | null)[][]
        )
        break
      }
      case 'google_sheets.append_rows': {
        const sid = resolveSpreadsheetId(args)
        if (!sid) return { jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: 'Error: spreadsheetId or fileId is required.' }], isError: true } }
        promise = appendRows(
          sid,
          args.range as string,
          args.values as (string | number | boolean | null)[][]
        )
        break
      }
      case 'google_sheets.create_sheet': {
        const sid = resolveSpreadsheetId(args)
        if (!sid) return { jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: 'Error: spreadsheetId or fileId is required.' }], isError: true } }
        promise = createSheet(sid, args.title as string)
        break
      }
      case 'google_sheets.get_spreadsheet': {
        const sid = resolveSpreadsheetId(args)
        if (!sid) return { jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: 'Error: spreadsheetId or fileId is required.' }], isError: true } }
        promise = getSpreadsheet(sid, args.includeGridData === true)
        break
      }
      case 'google_sheets.write_formulas': {
        const sid = resolveSpreadsheetId(args)
        if (!sid) return { jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: 'Error: spreadsheetId or fileId is required.' }], isError: true } }
        promise = writeFormulas(
          sid,
          args.range as string,
          args.formulas as (string | number | boolean | null)[][]
        )
        break
      }
      case 'google_sheets.insert_dimension': {
        const sid = resolveSpreadsheetId(args)
        if (!sid) return { jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: 'Error: spreadsheetId or fileId is required.' }], isError: true } }
        const sheetId = args.sheetId
        const sheetTitle = args.sheetTitle
        const target = (typeof sheetId === 'number') ? sheetId : (typeof sheetTitle === 'string' ? sheetTitle : undefined)
        promise = insertDimension(
          sid,
          target as string | number,
          args.dimension as string,
          args.startIndex as number,
          args.endIndex as number,
          args.inheritFromBefore as boolean | undefined
        )
        break
      }
      case 'google_sheets.update_spreadsheet': {
        const sid = resolveSpreadsheetId(args)
        if (!sid) return { jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: 'Error: spreadsheetId or fileId is required.' }], isError: true } }
        promise = updateSpreadsheet(
          sid,
          args.operation as string,
          { title: args.title }
        )
        break
      }
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
