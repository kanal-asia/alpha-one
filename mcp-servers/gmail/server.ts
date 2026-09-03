/**
 * MSI-065: Google Gmail custom MCP.
 *
 * Built on the shared Google MCP foundation:
 *   mcp-servers/shared/google/auth.ts  - local OAuth/token access + refresh
 *   mcp-servers/shared/google/rest.ts  - authenticated REST + error normalization
 *   mcp-servers/shared/google/mcp.ts   - MCP stdio JSON-RPC bootstrap
 *
 * Minimum useful Gmail surface: search/list, read, draft, send.
 * No delete, trash, bulk mutation, or unrestricted mailbox modification.
 */

import { googleRequest } from '../shared/google/rest'
import { startMcpServer, type McpTool, type McpToolResult } from '../shared/google/mcp'

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const MAX_QUERY = 500
const MAX_PAGE_SIZE = 50
const MAX_PAGE_TOKEN = 2000
const MAX_EMAIL = 254
const MAX_SUBJECT = 500
const MAX_BODY = 100_000
const MESSAGE_ID_RE = /^[A-Za-z0-9_-]{1,256}$/

function asString(v: unknown, label: string, maxLen: number, required = true): string {
  if (v === undefined || v === null) {
    if (required) throw new Error(`${label} is required.`)
    return ''
  }
  if (typeof v !== 'string' || v.trim() === '') {
    throw new Error(`${label} must be a non-empty string.`)
  }
  if (v.length > maxLen) throw new Error(`${label} must be at most ${maxLen} characters.`)
  return v.trim()
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

function validateMessageId(v: unknown): string {
  const id = asString(v, 'messageId', 256)
  if (!MESSAGE_ID_RE.test(id)) {
    throw new Error('messageId is malformed.')
  }
  return id
}

function validateEmail(v: unknown, label: string): string {
  const email = asString(v, label, MAX_EMAIL)
  if (!email.includes('@')) throw new Error(`${label} must be a valid email address.`)
  return email
}

// ---------------------------------------------------------------------------
// Gmail API helpers
// ---------------------------------------------------------------------------

interface GmailMessage {
  id: string
  threadId?: string
  snippet?: string
  payload?: {
    mimeType?: string
    headers?: Array<{ name: string; value: string }>
    body?: { data?: string; size?: number }
    parts?: Array<{
      mimeType?: string
      body?: { data?: string; size?: number }
      parts?: Array<{ mimeType?: string; body?: { data?: string; size?: number } }>
    }>
  }
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId?: string }>
  nextPageToken?: string
  resultSizeEstimate?: number
}

interface GmailDraft {
  id: string
  message?: GmailMessage
}

function extractHeader(msg: GmailMessage, name: string): string | undefined {
  return msg.payload?.headers?.find(h => h.name.toLowerCase() === name.toLowerCase())?.value
}

function extractTextBody(msg: GmailMessage): string {
  // Try top-level body
  if (msg.payload?.body?.data) {
    return Buffer.from(msg.payload.body.data, 'base64url').toString('utf-8')
  }
  // Try text/plain part
  const textPart = findPart(msg.payload, 'text/plain')
  if (textPart?.body?.data) {
    return Buffer.from(textPart.body.data, 'base64url').toString('utf-8')
  }
  // Try text/html part as fallback
  const htmlPart = findPart(msg.payload, 'text/html')
  if (htmlPart?.body?.data) {
    return Buffer.from(htmlPart.body.data, 'base64url').toString('utf-8')
  }
  return msg.snippet ?? ''
}

function findPart(
  payload: GmailMessage['payload'],
  mimeType: string,
): { body?: { data?: string; size?: number } } | undefined {
  if (!payload) return undefined
  if (payload.mimeType === mimeType && payload.body?.data) return payload
  for (const part of payload.parts ?? []) {
    if (part.mimeType === mimeType && part.body?.data) return part
    for (const sub of part.parts ?? []) {
      if (sub.mimeType === mimeType && sub.body?.data) return sub
    }
  }
  return undefined
}

function buildRfc2822(opts: {
  to: string
  subject: string
  body: string
  from?: string
  inReplyTo?: string
}): string {
  const lines: string[] = []
  if (opts.from) lines.push(`From: ${opts.from}`)
  lines.push(`To: ${opts.to}`)
  lines.push(`Subject: ${opts.subject}`)
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`)
  lines.push('Content-Type: text/plain; charset=utf-8')
  lines.push('')
  lines.push(opts.body)
  return lines.join('\r\n')
}

function toBase64Url(str: string): string {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function toTextResult(data: Record<string, unknown>): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function searchMessages(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const query = asOptionalString(args.query, 'query', MAX_QUERY) ?? ''
  const maxResults = asPageSize(args.maxResults) ?? 10
  const pageToken = asOptionalString(args.pageToken, 'pageToken', MAX_PAGE_TOKEN)

  const params = new URLSearchParams({ maxResults: String(maxResults) })
  if (query) params.set('q', query)
  if (pageToken) params.set('pageToken', pageToken)

  const res = await googleRequest<GmailListResponse>({
    method: 'GET',
    url: `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
    token,
  })

  const messages = (res.messages ?? []).map(m => ({
    id: m.id,
    threadId: m.threadId ?? null,
  }))

  return toTextResult({
    messages,
    nextPageToken: res.nextPageToken ?? null,
    resultSizeEstimate: res.resultSizeEstimate ?? 0,
    count: messages.length,
  })
}

async function readMessage(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const messageId = validateMessageId(args.messageId)
  const format = asOptionalString(args.format, 'format', 20) || 'full'

  const params = new URLSearchParams({ format })
  const msg = await googleRequest<GmailMessage>({
    method: 'GET',
    url: `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?${params.toString()}`,
    token,
  })

  return toTextResult({
    id: msg.id,
    threadId: msg.threadId ?? null,
    subject: extractHeader(msg, 'subject') ?? null,
    from: extractHeader(msg, 'from') ?? null,
    to: extractHeader(msg, 'to') ?? null,
    date: extractHeader(msg, 'date') ?? null,
    snippet: msg.snippet ?? null,
    body: extractTextBody(msg),
  })
}

async function createDraft(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const to = validateEmail(args.to, 'to')
  const subject = asString(args.subject, 'subject', MAX_SUBJECT)
  const body = asString(args.body, 'body', MAX_BODY)
  const from = asOptionalString(args.from, 'from', MAX_EMAIL)

  const raw = buildRfc2822({ to, subject, body, from })
  const encoded = toBase64Url(raw)

  const res = await googleRequest<GmailDraft>({
    method: 'POST',
    url: 'https://gmail.googleapis.com/gmail/v1/users/me/drafts',
    body: { message: { raw: encoded } },
    token,
  })

  return toTextResult({
    draftId: res.id,
    messageId: res.message?.id ?? null,
    threadId: res.message?.threadId ?? null,
    note: 'Draft created. Use gmail_send_message to send, or verify in Gmail UI.',
  })
}

async function sendMessage(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const to = validateEmail(args.to, 'to')
  const subject = asString(args.subject, 'subject', MAX_SUBJECT)
  const body = asString(args.body, 'body', MAX_BODY)
  const from = asOptionalString(args.from, 'from', MAX_EMAIL)
  const inReplyTo = asOptionalString(args.inReplyTo, 'inReplyTo', 256)

  const raw = buildRfc2822({ to, subject, body, from, inReplyTo })
  const encoded = toBase64Url(raw)

  const res = await googleRequest<{ id: string; threadId?: string }>({
    method: 'POST',
    url: 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    body: { raw: encoded },
    token,
  })

  return toTextResult({
    messageId: res.id,
    threadId: res.threadId ?? null,
    note: 'Message sent.',
  })
}

// ---------------------------------------------------------------------------
// Tool definitions + dispatch
// ---------------------------------------------------------------------------

const tools: McpTool[] = [
  {
    name: 'gmail_search_messages',
    description:
      'Search or list Gmail messages. Returns message IDs, thread IDs, and a snippet for each match. Supports Gmail search query syntax (from:, to:, subject:, has:attachment, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Gmail search query (e.g. "from:user@example.com subject:hello"). Empty string lists recent messages.',
          maxLength: MAX_QUERY,
        },
        maxResults: {
          type: 'integer',
          minimum: 1,
          maximum: MAX_PAGE_SIZE,
          description: 'Maximum messages to return (default 10, max 50).',
        },
        pageToken: {
          type: 'string',
          description: 'Token for the next page of results.',
          maxLength: MAX_PAGE_TOKEN,
        },
      },
    },
  },
  {
    name: 'gmail_read_message',
    description:
      'Read a Gmail message by ID. Returns subject, from, to, date, snippet, and body text.',
    inputSchema: {
      type: 'object',
      properties: {
        messageId: {
          type: 'string',
          description: 'Gmail message ID (obtained from gmail_search_messages).',
          maxLength: 256,
        },
        format: {
          type: 'string',
          enum: ['full', 'metadata', 'minimal'],
          description: 'Response format (default "full" includes body).',
        },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'gmail_create_draft',
    description:
      'Create a Gmail draft. The draft is saved in the user\'s Drafts folder and can be reviewed before sending.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address.',
          maxLength: MAX_EMAIL,
        },
        subject: {
          type: 'string',
          description: 'Email subject line.',
          maxLength: MAX_SUBJECT,
        },
        body: {
          type: 'string',
          description: 'Plain text email body.',
          maxLength: MAX_BODY,
        },
        from: {
          type: 'string',
          description: 'Sender email address (optional, defaults to authenticated user).',
          maxLength: MAX_EMAIL,
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'gmail_send_message',
    description:
      'Send an email message directly. The message is sent immediately and cannot be undone.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Recipient email address.',
          maxLength: MAX_EMAIL,
        },
        subject: {
          type: 'string',
          description: 'Email subject line.',
          maxLength: MAX_SUBJECT,
        },
        body: {
          type: 'string',
          description: 'Plain text email body.',
          maxLength: MAX_BODY,
        },
        from: {
          type: 'string',
          description: 'Sender email address (optional, defaults to authenticated user).',
          maxLength: MAX_EMAIL,
        },
        inReplyTo: {
          type: 'string',
          description: 'Message ID to reply to (optional).',
          maxLength: 256,
        },
      },
      required: ['to', 'subject', 'body'],
    },
  },
]

async function callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
  try {
    const { getAccessToken } = await import('../shared/google/auth.js')
    const token = await getAccessToken()

    switch (name) {
      case 'gmail_search_messages':
        return await searchMessages(token, args)
      case 'gmail_read_message':
        return await readMessage(token, args)
      case 'gmail_create_draft':
        return await createDraft(token, args)
      case 'gmail_send_message':
        return await sendMessage(token, args)
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true }
  }
}

// ---------------------------------------------------------------------------
// Start MCP server
// ---------------------------------------------------------------------------

startMcpServer({
  name: 'google-gmail',
  version: '1.0.0',
  tools,
  callTool,
})
