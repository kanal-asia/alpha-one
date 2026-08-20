/**
 * TASK-066: Minimal authenticated Google REST client.
 *
 * Supports GET/POST/PATCH/PUT/DELETE with Bearer auth, a configurable timeout,
 * JSON response parsing, and normalized non-2xx errors that preserve Google's
 * diagnostic information.
 *
 * Boundary:
 * - No service-specific logic (no Sheets ranges, Drive files, Docs documents,
 *   Slides presentations, Calendar events, Apps Script operations).
 * - No automatic pagination, generic batching, upload/download abstractions.
 * - Never logs or exposes tokens / Authorization headers.
 */

import { getAccessToken } from './auth'

export interface GoogleErrorInfo {
  /** HTTP status; 0 when the request failed before a response was received. */
  status: number
  /** Google's numeric error code (falls back to HTTP status). */
  code?: number
  /** Human-readable Google error message. */
  message?: string
  /** gRPC-style status string, e.g. PERMISSION_DENIED. */
  googleStatus?: string
  /** First error reason, e.g. insufficientPermissions. */
  reason?: string
  /** Safe parsed error body (never contains tokens). */
  details?: unknown
}

export class GoogleApiError extends Error {
  readonly status: number
  readonly code?: number
  readonly googleStatus?: string
  readonly reason?: string
  readonly details?: unknown

  constructor(info: GoogleErrorInfo) {
    super(info.message || `Google API error: ${info.status}`)
    this.name = 'GoogleApiError'
    this.status = info.status
    this.code = info.code
    this.googleStatus = info.googleStatus
    this.reason = info.reason
    this.details = info.details
  }
}

export interface GoogleRequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** Full URL, e.g. https://www.googleapis.com/calendar/v3/users/me/calendarList */
  url: string
  /** Query parameters appended to the URL (arrays become repeated params). */
  params?: Record<string, string | string[] | number | number[] | boolean>
  /** JSON body (serialized for methods that send one). */
  body?: unknown
  /** Extra headers (merged before Authorization). */
  headers?: Record<string, string>
  /** Reuse an already-obtained token; when omitted, auth.getAccessToken() is used. */
  token?: string
  /** Request timeout in ms. Defaults to 15000. */
  timeoutMs?: number
}

export async function googleRequest<T = unknown>(options: GoogleRequestOptions): Promise<T> {
  const token = options.token ?? (await getAccessToken())
  const url = new URL(options.url)
  if (options.params) {
    for (const [k, v] of Object.entries(options.params)) {
      const values = Array.isArray(v) ? v.map(String) : [String(v)]
      for (const item of values) url.searchParams.append(k, item)
    }
  }

  const timeoutMs = options.timeoutMs ?? 15000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let resp: Response
  try {
    resp = await fetch(url.toString(), {
      method: options.method,
      headers: {
        ...(options.method === 'GET' || options.method === 'DELETE'
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new GoogleApiError({ status: 0, message: `Google API request timed out after ${timeoutMs}ms.` })
    }
    throw new GoogleApiError({
      status: 0,
      message: `Google API request failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    })
  } finally {
    clearTimeout(timer)
  }

  if (!resp.ok) {
    const parsed = (await resp.json().catch(() => null)) as {
      error?: {
        code?: number
        message?: string
        status?: string
        errors?: Array<{ reason?: string; message?: string }>
      }
    } | null
    const gerr = parsed?.error
    throw new GoogleApiError({
      status: resp.status,
      code: gerr?.code ?? resp.status,
      message: gerr?.message ?? `Google API error: ${resp.status} ${resp.statusText}`,
      googleStatus: gerr?.status,
      reason: gerr?.errors?.[0]?.reason,
      details: parsed,
    })
  }

  if (resp.status === 204) {
    return undefined as T
  }

  const text = await resp.text()
  if (!text) {
    return undefined as T
  }

  const contentType = resp.headers.get('content-type') ?? ''
  if (contentType.includes('json')) {
    try {
      return JSON.parse(text) as T
    } catch {
      return text as unknown as T
    }
  }
  return text as unknown as T
}