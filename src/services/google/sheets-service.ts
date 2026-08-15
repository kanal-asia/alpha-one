/**
 * Google Sheets API v4 Service
 *
 * Server-side service for reading and writing Google Sheets using the
 * authenticated user's OAuth connection. All Google API calls use
 * server-side tokens.
 *
 * Uses raw fetch calls (consistent with drive-service.ts pattern)
 * rather than adding the googleapis dependency.
 */
import { getValidAccessToken } from './oauth-service'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SheetInfo {
  sheetId: number
  title: string
  index: number
  sheetType: string
  rowCount?: number
  columnCount?: number
}

export interface SpreadsheetMeta {
  spreadsheetId: string
  title: string
  sheets: SheetInfo[]
  spreadsheetUrl?: string
}

export interface RangeReadResult {
  range: string
  majorDimension: string
  values: (string | number | boolean | null)[][]
}

export interface RangeWriteResult {
  updatedCells: number
  updatedRows: number
  updatedColumns: number
  updatedRange: string
}

// ---------------------------------------------------------------------------
// Google Sheets API Helpers
// ---------------------------------------------------------------------------

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4'

async function sheetsFetch<T>(
  userId: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const token = await getValidAccessToken(userId)
  if (!token) {
    throw new Error('Google account not connected. Please connect your Google account in Settings.')
  }

  const url = new URL(`${SHEETS_API_BASE}${path}`)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as {
      error?: { message?: string; code?: number; status?: string }
    }
    const message = error.error?.message ?? `Google Sheets API error: ${response.status}`
    const code = error.error?.code ?? response.status

    if (code === 401) {
      throw new Error('Google authorization expired or revoked. Please reconnect your Google account.')
    }
    if (code === 403) {
      if (message.includes('has not been used') || message.includes('is disabled')) {
        throw new Error('Google Sheets API is not enabled in your Google Cloud project. Please enable it at https://console.developers.google.com/apis/api/sheets.googleapis.com')
      }
      throw new Error('Permission denied. You do not have access to this spreadsheet. If this is a newly connected account, please reconnect to grant Sheets write access.')
    }
    if (code === 404) {
      throw new Error('Spreadsheet not found. It may have been moved or deleted.')
    }
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

async function sheetsMutate<T>(
  userId: string,
  path: string,
  method: string,
  body?: unknown
): Promise<T> {
  const token = await getValidAccessToken(userId)
  if (!token) {
    throw new Error('Google account not connected. Please connect your Google account in Settings.')
  }

  const url = `${SHEETS_API_BASE}${path}`

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as {
      error?: { message?: string; code?: number; status?: string }
    }
    const message = error.error?.message ?? `Google Sheets API error: ${response.status}`
    const code = error.error?.code ?? response.status

    if (code === 401) {
      throw new Error('Google authorization expired or revoked. Please reconnect your Google account.')
    }
    if (code === 403) {
      if (message.includes('PERMISSION_DENIED') || message.includes('does not have permission')) {
        throw new Error('Permission denied. You do not have write access to this spreadsheet.')
      }
      throw new Error('Permission denied. You do not have access to this spreadsheet.')
    }
    if (code === 404) {
      throw new Error('Spreadsheet not found. It may have been moved or deleted.')
    }
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Sheets Operations
// ---------------------------------------------------------------------------

/**
 * Get spreadsheet metadata including all worksheet info.
 * Corresponds to: GET /v4/spreadsheets/{spreadsheetId}
 */
export async function getSpreadsheetMeta(
  userId: string,
  spreadsheetId: string
): Promise<SpreadsheetMeta> {
  const data = await sheetsFetch<{
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
    spreadsheetUrl?: string
  }>(userId, `/spreadsheets/${spreadsheetId}`)

  return {
    spreadsheetId: data.spreadsheetId,
    title: data.properties?.title ?? 'Untitled',
    sheets: (data.sheets ?? []).map((s) => ({
      sheetId: s.sheetId ?? 0,
      title: s.properties?.title ?? 'Untitled Sheet',
      index: s.properties?.index ?? 0,
      sheetType: s.properties?.sheetType ?? 'GRID',
      rowCount: s.properties?.gridProperties?.rowCount,
      columnCount: s.properties?.gridProperties?.columnCount,
    })),
    spreadsheetUrl: data.spreadsheetUrl,
  }
}

/**
 * List worksheets in a spreadsheet.
 * Convenience wrapper around getSpreadsheetMeta.
 */
export async function listSheets(
  userId: string,
  spreadsheetId: string
): Promise<SheetInfo[]> {
  const meta = await getSpreadsheetMeta(userId, spreadsheetId)
  return meta.sheets
}

/**
 * Read a range of values from a spreadsheet.
 * Corresponds to: GET /v4/spreadsheets/{spreadsheetId}/values/{range}
 *
 * @param range A1 notation range, e.g. "Sheet1!A1:B10" or "Product Performance_Monthly!A3:K10"
 */
export async function readRange(
  userId: string,
  spreadsheetId: string,
  range: string
): Promise<RangeReadResult> {
  const data = await sheetsFetch<{
    range: string
    majorDimension?: string
    values?: (string | number | boolean | null)[][]
  }>(userId, `/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
    valueRenderOption: 'FORMATTED_VALUE',
  })

  return {
    range: data.range,
    majorDimension: data.majorDimension ?? 'ROWS',
    values: data.values ?? [],
  }
}

/**
 * Write values to a range in a spreadsheet.
 * Corresponds to: PUT /v4/spreadsheets/{spreadsheetId}/values/{range}
 *
 * @param range A1 notation range, e.g. "Sheet1!A1"
 * @param values 2D array of values to write
 */
export async function writeRange(
  userId: string,
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean | null)[][]
): Promise<RangeWriteResult> {
  const data = await sheetsMutate<{
    updatedCells?: number
    updatedRows?: number
    updatedColumns?: number
    updatedRange?: string
  }>(userId, `/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, 'PUT', {
    values,
    valueInputOption: 'USER_ENTERED',
  })

  return {
    updatedCells: data.updatedCells ?? 0,
    updatedRows: data.updatedRows ?? 0,
    updatedColumns: data.updatedColumns ?? 0,
    updatedRange: data.updatedRange ?? range,
  }
}

/**
 * Append rows to a spreadsheet.
 * Corresponds to: POST /v4/spreadsheets/{spreadsheetId}/values/{range}:append
 *
 * @param range A1 notation range (typically sheet name), e.g. "Sheet1"
 * @param values 2D array of values to append
 */
export async function appendRows(
  userId: string,
  spreadsheetId: string,
  range: string,
  values: (string | number | boolean | null)[][]
): Promise<RangeWriteResult> {
  const data = await sheetsMutate<{
    updates?: {
      updatedCells?: number
      updatedRows?: number
      updatedColumns?: number
      updatedRange?: string
    }
  }>(userId, `/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append`, 'POST', {
    values,
    valueInputOption: 'USER_ENTERED',
  })

  return {
    updatedCells: data.updates?.updatedCells ?? 0,
    updatedRows: data.updates?.updatedRows ?? 0,
    updatedColumns: data.updates?.updatedColumns ?? 0,
    updatedRange: data.updates?.updatedRange ?? range,
  }
}

/**
 * Create a new spreadsheet.
 * Corresponds to: POST /v4/spreadsheets
 */
export async function createSpreadsheet(
  userId: string,
  title: string
): Promise<SpreadsheetMeta> {
  const data = await sheetsMutate<{
    spreadsheetId?: string
    properties?: { title?: string }
    sheets?: Array<{
      sheetId?: number
      properties?: { title?: string; index?: number; sheetType?: string }
    }>
    spreadsheetUrl?: string
  }>(userId, '/spreadsheets', 'POST', {
    properties: { title },
    sheets: [{ properties: { title: 'Sheet1' } }],
  })

  return {
    spreadsheetId: data.spreadsheetId ?? '',
    title: data.properties?.title ?? title,
    sheets: (data.sheets ?? []).map((s) => ({
      sheetId: s.sheetId ?? 0,
      title: s.properties?.title ?? 'Sheet1',
      index: s.properties?.index ?? 0,
      sheetType: s.properties?.sheetType ?? 'GRID',
    })),
    spreadsheetUrl: data.spreadsheetUrl,
  }
}
