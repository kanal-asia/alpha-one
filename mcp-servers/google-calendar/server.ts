/**
 * TASK-073: Google Calendar custom MCP.
 *
 * Built on the shared Google MCP foundation:
 *   mcp-servers/shared/google/auth.ts  - local OAuth/token access + refresh
 *   mcp-servers/shared/google/rest.ts  - authenticated REST + error normalization
 *   mcp-servers/shared/google/mcp.ts   - MCP stdio JSON-RPC bootstrap
 *
 * Completes the Calendar MCP deferred during TASK-067, using the same local
 * credential model as the other custom Google MCPs. Read surface: calendar
 * list, calendar metadata, and bounded event listing. Constrained write
 * surface (TASK-079): create/update/delete of single events on the user's
 * primary calendar. No arbitrary REST passthrough, no unbounded retrieval,
 * no credential exposure.
 */

import { googleRequest, GoogleApiError } from '../shared/google/rest'
import { startMcpServer, type McpTool, type McpToolResult } from '../shared/google/mcp'

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const MAX_CALENDAR_ID = 200
const MAX_EVENT_ID = 500
const MAX_PAGE_TOKEN = 2000
const MAX_SUMMARY = 500
const MAX_DESCRIPTION = 2000
const MAX_TIME = 100
const MAX_EVENTS = 250

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

function validateCalendarId(v: unknown, label = 'calendarId'): string {
  const id = asString(v, label, MAX_CALENDAR_ID)
  return encodeURIComponent(id)
}

function validateEventId(v: unknown, label = 'eventId'): string {
  const id = asString(v, label, MAX_EVENT_ID)
  return encodeURIComponent(id)
}

function asOptionalString(v: unknown, label: string, maxLen: number): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') throw new Error(`${label} must be a string.`)
  const s = v.trim()
  if (s.length > maxLen) throw new Error(`${label} must be at most ${maxLen} characters.`)
  return s || undefined
}

function asMaxResults(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > MAX_EVENTS) {
    throw new Error(`maxResults must be an integer between 1 and ${MAX_EVENTS}.`)
  }
  return n
}

function asBoolean(v: unknown, label: string): boolean | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'boolean') throw new Error(`${label} must be a boolean.`)
  return v
}

function asTimestamp(v: unknown, label: string): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`)
  }
  const s = v.trim()
  if (s.length > MAX_TIME) throw new Error(`${label} must be at most ${MAX_TIME} characters.`)
  if (Number.isNaN(Date.parse(s))) {
    throw new Error(`${label} must be a valid date/time (RFC 3339, e.g. 2026-08-20T00:00:00Z).`)
  }
  return new Date(s).toISOString()
}

function asOrderBy(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  if (typeof v !== 'string') throw new Error('orderBy must be a string.')
  const s = v.trim()
  if (s !== 'startTime' && s !== 'updated') {
    throw new Error(`orderBy must be one of: startTime, updated.`)
  }
  return s
}

// ---------------------------------------------------------------------------
// Google API helpers
// ---------------------------------------------------------------------------

function calendarError(err: unknown): Error {
  if (err instanceof GoogleApiError) {
    return new Error(`Google Calendar API ${err.status}${err.reason ? ` (${err.reason})` : ''}: ${err.message}`)
  }
  return err instanceof Error ? err : new Error(String(err))
}

function toTextResult(result: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}

interface CalendarEntry {
  id: string
  summary?: string
  description?: string
  primary?: boolean
  accessRole?: string
  timeZone?: string
}

function normalizeCalendar(c: CalendarEntry): {
  id: string
  summary: string | null
  description: string | null
  primary: boolean
  accessRole: string | null
  timeZone: string | null
} {
  return {
    id: c.id,
    summary: c.summary ?? null,
    description: c.description ?? null,
    primary: c.primary ?? false,
    accessRole: c.accessRole ?? null,
    timeZone: c.timeZone ?? null,
  }
}

interface CalendarEvent {
  id?: string
  summary?: string
  status?: string
  location?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

function normalizeEvent(e: CalendarEvent): {
  id: string | null
  summary: string | null
  status: string | null
  location: string | null
  start: string | null
  end: string | null
} {
  return {
    id: e.id ?? null,
    summary: e.summary ?? null,
    status: e.status ?? null,
    location: e.location ?? null,
    start: e.start?.dateTime ?? e.start?.date ?? null,
    end: e.end?.dateTime ?? e.end?.date ?? null,
  }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function listCalendars(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const maxResults = asMaxResults(args.maxResults)
  const pageToken = asOptionalString(args.pageToken, 'pageToken', MAX_PAGE_TOKEN)

  const res = await googleRequest<{ items?: CalendarEntry[]; nextPageToken?: string }>({
    method: 'GET',
    url: 'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    params: {
      maxResults: maxResults ?? 50,
      ...(pageToken ? { pageToken } : {}),
    },
    token,
  })

  return toTextResult({
    calendars: (res.items ?? []).map(normalizeCalendar),
    count: (res.items ?? []).length,
    nextPageToken: res.nextPageToken ?? null,
  })
}

async function getCalendar(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const calendarId = validateCalendarId(args.calendarId)
  const meta = await googleRequest<CalendarEntry>({
    method: 'GET',
    url: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}`,
    token,
  })
  return toTextResult(normalizeCalendar(meta))
}

async function listEvents(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const calendarId = validateCalendarId(args.calendarId)
  const timeMin = asTimestamp(args.timeMin, 'timeMin')
  const timeMax = asTimestamp(args.timeMax, 'timeMax')
  if (timeMin && timeMax && Date.parse(timeMin) > Date.parse(timeMax)) {
    throw new Error('timeMin must not be later than timeMax.')
  }
  const maxResults = asMaxResults(args.maxResults)
  const pageToken = asOptionalString(args.pageToken, 'pageToken', MAX_PAGE_TOKEN)
  const singleEvents = asBoolean(args.singleEvents, 'singleEvents')
  const orderBy = asOrderBy(args.orderBy)

  const res = await googleRequest<{ items?: CalendarEvent[]; nextPageToken?: string }>({
    method: 'GET',
    url: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    params: {
      maxResults: maxResults ?? 50,
      ...(timeMin ? { timeMin } : {}),
      ...(timeMax ? { timeMax } : {}),
      ...(pageToken ? { pageToken } : {}),
      ...(singleEvents !== undefined ? { singleEvents } : {}),
      ...(orderBy ? { orderBy } : {}),
    },
    token,
  })

  return toTextResult({
    calendarId: args.calendarId as string,
    events: (res.items ?? []).map(normalizeEvent),
    count: (res.items ?? []).length,
    nextPageToken: res.nextPageToken ?? null,
  })
}

async function createEvent(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const summary = asString(args.summary, 'summary', MAX_SUMMARY)
  const start = asTimestamp(args.start, 'start')
  const end = asTimestamp(args.end, 'end')
  if (!start || !end) throw new Error('start and end are required.')
  if (Date.parse(start) >= Date.parse(end)) {
    throw new Error('start must be earlier than end.')
  }
  const description = asOptionalString(args.description, 'description', MAX_DESCRIPTION)
  const calendarId = validateCalendarId(args.calendarId ?? 'primary')

  const created = await googleRequest<{ id?: string; htmlLink?: string }>({
    method: 'POST',
    url: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    body: {
      summary,
      ...(description !== undefined ? { description } : {}),
      start: { dateTime: start },
      end: { dateTime: end },
    },
    token,
  })

  return toTextResult({
    eventId: created.id ?? null,
    calendarId: (args.calendarId ?? 'primary') as string,
    summary,
    description: description ?? null,
    start,
    end,
    htmlLink: created.htmlLink ?? null,
    note: 'Verify persistence by reading the event back with calendar_list_events.',
  })
}

async function updateEvent(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const calendarId = validateCalendarId(args.calendarId ?? 'primary')
  const eventId = validateEventId(args.eventId)
  const summary = asOptionalString(args.summary, 'summary', MAX_SUMMARY)
  const description = asOptionalString(args.description, 'description', MAX_DESCRIPTION)
  const start = asTimestamp(args.start, 'start')
  const end = asTimestamp(args.end, 'end')
  if (start && end && Date.parse(start) >= Date.parse(end)) {
    throw new Error('start must be earlier than end.')
  }

  const body: Record<string, unknown> = {}
  if (summary !== undefined) body.summary = summary
  if (description !== undefined) body.description = description
  if (start) body.start = { dateTime: start }
  if (end) body.end = { dateTime: end }

  const updated = await googleRequest<{ id?: string; htmlLink?: string }>({
    method: 'PATCH',
    url: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
    body,
    token,
  })

  return toTextResult({
    eventId: updated.id ?? eventId,
    calendarId: (args.calendarId ?? 'primary') as string,
    summary: summary ?? null,
    description: description ?? null,
    start: start ?? null,
    end: end ?? null,
    htmlLink: updated.htmlLink ?? null,
    note: 'Verify persistence by reading the event back with calendar_list_events.',
  })
}

async function deleteEvent(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const calendarId = validateCalendarId(args.calendarId ?? 'primary')
  const eventId = validateEventId(args.eventId)

  await googleRequest<unknown>({
    method: 'DELETE',
    url: `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
    token,
  })

  return toTextResult({
    eventId,
    calendarId: (args.calendarId ?? 'primary') as string,
    deleted: true,
    note: 'Verify deletion by reading the event back (expected not found).',
  })
}

// ---------------------------------------------------------------------------
// MCP registration
// ---------------------------------------------------------------------------

const TOOLS: McpTool[] = [
  {
    name: 'calendar_list_calendars',
    description:
      'List calendars accessible to the authenticated Google identity. Returns normalized records (id, summary, description, primary, accessRole).',
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: { type: 'integer', minimum: 1, maximum: 250, description: 'Maximum calendars to return (default 50).' },
        pageToken: { type: 'string', maxLength: 2000, description: 'Pagination token from a previous call.' },
      },
    },
  },
  {
    name: 'calendar_get_calendar',
    description: 'Retrieve metadata for a single Google calendar (id, summary, description, timeZone).',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: { type: 'string', maxLength: 200, description: 'Google Calendar ID (e.g. an email address or a public calendar ID).' },
      },
      required: ['calendarId'],
    },
  },
  {
    name: 'calendar_list_events',
    description:
      'List events from one Google calendar within an optional bounded time window. Returns normalized events (id, summary, status, location, start, end) plus a nextPageToken when more results are available.',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: { type: 'string', maxLength: 200, description: 'Google Calendar ID.' },
        timeMin: { type: 'string', maxLength: 100, description: 'Start of the window (RFC 3339, e.g. 2026-08-20T00:00:00Z).' },
        timeMax: { type: 'string', maxLength: 100, description: 'End of the window (RFC 3339).' },
        maxResults: { type: 'integer', minimum: 1, maximum: 250, description: 'Maximum events to return (default 50).' },
        pageToken: { type: 'string', maxLength: 2000, description: 'Pagination token from a previous call.' },
        singleEvents: { type: 'boolean', description: 'Expand recurring events into individual instances (default false).' },
        orderBy: { type: 'string', enum: ['startTime', 'updated'], description: 'Sort order (startTime requires singleEvents=true).' },
      },
      required: ['calendarId'],
    },
  },
  {
    name: 'calendar_create_event',
    description:
      'Create a single event on a calendar (default primary). Accepts summary, start/end (RFC 3339), and an optional description. Returns the created event id and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: { type: 'string', maxLength: 200, description: 'Google Calendar ID (default primary).' },
        summary: { type: 'string', maxLength: 500, description: 'Event title.' },
        description: { type: 'string', maxLength: 2000, description: 'Optional event description.' },
        start: { type: 'string', maxLength: 100, description: 'Start time (RFC 3339, e.g. 2026-08-20T09:00:00Z).' },
        end: { type: 'string', maxLength: 100, description: 'End time (RFC 3339).' },
      },
      required: ['summary', 'start', 'end'],
    },
  },
  {
    name: 'calendar_update_event',
    description:
      'Update safe fields of a single calendar event (summary, description, start, end). Only provided fields are changed.',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: { type: 'string', maxLength: 200, description: 'Google Calendar ID (default primary).' },
        eventId: { type: 'string', maxLength: 500, description: 'Google Calendar event ID.' },
        summary: { type: 'string', maxLength: 500, description: 'New event title.' },
        description: { type: 'string', maxLength: 2000, description: 'New event description.' },
        start: { type: 'string', maxLength: 100, description: 'New start time (RFC 3339).' },
        end: { type: 'string', maxLength: 100, description: 'New end time (RFC 3339).' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'calendar_delete_event',
    description:
      'Delete a single calendar event (default primary). Verify by reading the event back (expected not found).',
    inputSchema: {
      type: 'object',
      properties: {
        calendarId: { type: 'string', maxLength: 200, description: 'Google Calendar ID (default primary).' },
        eventId: { type: 'string', maxLength: 500, description: 'Google Calendar event ID.' },
      },
      required: ['eventId'],
    },
  },
]

startMcpServer({
  name: 'google-calendar',
  version: '0.1.0',
  tools: TOOLS,
  callTool: async (name, args) => {
    try {
      const token = await import('../shared/google/auth').then((m) => m.getAccessToken())
      switch (name) {
        case 'calendar_list_calendars':
          return await listCalendars(token, args)
        case 'calendar_get_calendar':
          return await getCalendar(token, args)
        case 'calendar_list_events':
          return await listEvents(token, args)
        case 'calendar_create_event':
          return await createEvent(token, args)
        case 'calendar_update_event':
          return await updateEvent(token, args)
        case 'calendar_delete_event':
          return await deleteEvent(token, args)
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
      }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${calendarError(err).message}` }], isError: true }
    }
  },
})