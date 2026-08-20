/**
 * TASK-071: Google Apps Script custom MCP.
 *
 * Built on the shared Google MCP foundation:
 *   mcp-servers/shared/google/auth.ts  - local OAuth/token access + refresh
 *   mcp-servers/shared/google/rest.ts  - authenticated REST + error normalization
 *   mcp-servers/shared/google/mcp.ts   - MCP stdio JSON-RPC bootstrap
 *
 * Service-specific surface only: Apps Script REST (projects), Drive discovery
 * (list only), Executable API (run + bounded operation polling), argument
 * validation, and response shaping. No duplicate OAuth/token/bootstrap logic.
 * No arbitrary REST passthrough, no source mutation, no deployment/version/
 * trigger management, no credential leakage, no unbounded polling.
 */

import { googleRequest, GoogleApiError } from '../shared/google/rest'
import { startMcpServer, type McpTool, type McpToolResult } from '../shared/google/mcp'

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const SCRIPT_ID_RE = /^[A-Za-z0-9_-]{1,120}$/
const FN_RE = /^[A-Za-z_$][\w$]{0,127}$/
const MAX_PAGE_TOKEN = 2000
const MAX_PAGE_SIZE = 100
const MAX_PARAMS_LEN = 50
const MAX_PARAMS_JSON = 20_000
const MAX_RUN_TIMEOUT = 300
const POLL_INTERVAL_MS = 2_000
const POLL_MAX_TOTAL_MS = 120_000
const MAX_FILE_SOURCE = 100_000

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

function validateScriptId(v: unknown, label = 'scriptId'): string {
  const id = asString(v, label, 120)
  if (!SCRIPT_ID_RE.test(id)) {
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

function asRunTimeout(v: unknown): number {
  if (v === undefined || v === null) return 60
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > MAX_RUN_TIMEOUT) {
    throw new Error(`timeout must be an integer between 1 and ${MAX_RUN_TIMEOUT} seconds.`)
  }
  return n
}

function asParameters(v: unknown): unknown[] {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v)) throw new Error('parameters must be an array.')
  if (v.length > MAX_PARAMS_LEN) throw new Error(`parameters must have at most ${MAX_PARAMS_LEN} elements.`)
  const json = JSON.stringify(v)
  if (json.length > MAX_PARAMS_JSON) throw new Error(`parameters total size must be at most ${MAX_PARAMS_JSON} characters.`)
  return v
}

// ---------------------------------------------------------------------------
// Google API helpers
// ---------------------------------------------------------------------------

function scriptError(err: unknown): Error {
  if (err instanceof GoogleApiError) {
    return new Error(`Google Apps Script API ${err.status}${err.reason ? ` (${err.reason})` : ''}: ${err.message}`)
  }
  return err instanceof Error ? err : new Error(String(err))
}

function toTextResult(result: unknown): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Tool implementations
// ---------------------------------------------------------------------------

async function listProjects(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const pageSize = asPageSize(args.pageSize)
  const pageToken = asOptionalString(args.pageToken, 'pageToken', MAX_PAGE_TOKEN)

  const res = await googleRequest<{ files?: Array<{ id: string; name: string; modifiedTime?: string; parents?: string[] }>; nextPageToken?: string }>({
    method: 'GET',
    url: 'https://www.googleapis.com/drive/v3/files',
    params: {
      q: "mimeType='application/vnd.google-apps.script' and trashed=false",
      pageSize: pageSize ?? 20,
      fields: 'files(id,name,modifiedTime,parents),nextPageToken',
      ...(pageToken ? { pageToken } : {}),
    },
    token,
  })

  return toTextResult({
    projects: (res.files ?? []).map((f) => ({
      scriptId: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime ?? null,
      parentId: f.parents?.[0] ?? null,
    })),
    count: (res.files ?? []).length,
    nextPageToken: res.nextPageToken ?? null,
  })
}

async function getProject(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const scriptId = validateScriptId(args.scriptId)
  const res = await googleRequest<{ scriptId: string; title: string; parentId?: string; updateTime?: string; createTime?: string }>({
    method: 'GET',
    url: `https://script.googleapis.com/v1/projects/${scriptId}`,
    token,
  })
  return toTextResult({
    scriptId: res.scriptId,
    title: res.title,
    parentId: res.parentId ?? null,
    createTime: res.createTime ?? null,
    updateTime: res.updateTime ?? null,
  })
}

async function getContent(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const scriptId = validateScriptId(args.scriptId)
  const res = await googleRequest<{
    scriptId: string
    files?: Array<{ name: string; type: string; source?: string; updateTime?: string }>
  }>({
    method: 'GET',
    url: `https://script.googleapis.com/v1/projects/${scriptId}/content`,
    token,
  })
  const files = (res.files ?? []).map((f) => {
    const src = f.source ?? ''
    const truncated = src.length > MAX_FILE_SOURCE
    return {
      name: f.name,
      type: f.type,
      characters: src.length,
      truncated,
      source: truncated ? src.slice(0, MAX_FILE_SOURCE) : src,
    }
  })
  return toTextResult({
    scriptId: res.scriptId,
    files,
    fileCount: files.length,
    totalCharacters: files.reduce((acc, f) => acc + f.characters, 0),
  })
}

async function runFunction(token: string, args: Record<string, unknown>): Promise<McpToolResult> {
  const scriptId = validateScriptId(args.scriptId)
  const fn = asString(args.function, 'function', 128)
  if (!FN_RE.test(fn)) {
    throw new Error('function is malformed. Expected a valid Apps Script function name (letters, digits, _, $).')
  }
  const parameters = asParameters(args.parameters)
  const timeout = asRunTimeout(args.timeout)

  // Note: the RunRequest body does not accept a `timeout` field (API rejects it).
  // `timeout` is used here as the bounded total-wait budget for polling.
  const body: Record<string, unknown> = { function: fn, parameters, devMode: false }

  const op = await googleRequest<{
    name?: string
    done: boolean
    metadata?: { state?: string }
    response?: { result?: unknown }
    error?: { code?: number; message?: string; details?: Array<Record<string, unknown>> }
  }>({
    method: 'POST',
    url: `https://script.googleapis.com/v1/scripts/${scriptId}:run`,
    body,
    token,
  })

  let current = op
  const totalWaitMs = Math.min(timeout * 1000, POLL_MAX_TOTAL_MS)
  const started = Date.now()
  while (!current.done) {
    if (Date.now() - started > totalWaitMs) {
      throw new Error(`Apps Script execution polling timed out after ${Math.round(totalWaitMs / 1000)}s.`)
    }
    const opName = current.name
    if (!opName) {
      throw new Error('Apps Script returned an incomplete operation without a name.')
    }
    await sleep(POLL_INTERVAL_MS)
    current = await googleRequest<{
      done: boolean
      metadata?: { state?: string }
      response?: { result?: unknown }
      error?: { code?: number; message?: string; details?: Array<Record<string, unknown>> }
    }>({
      method: 'GET',
      url: `https://script.googleapis.com/v1/${opName}`,
      token,
    })
  }

  if (current.error) {
    const exec = Array.isArray(current.error.details)
      ? (current.error.details as Array<Record<string, unknown>>).find((d) =>
          typeof d['@type'] === 'string' && d['@type'].includes('ExecutionError'),
        )
      : undefined
    return toTextResult({
      scriptId,
      function: fn,
      status: 'ERROR',
      errorType: (exec?.errorType as string) ?? null,
      errorMessage: (exec?.errorMessage as string) ?? current.error.message ?? 'Unknown script error',
      apiCode: current.error.code ?? null,
    })
  }

  return toTextResult({
    scriptId,
    function: fn,
    status: 'SUCCESS',
    result: current.response?.result ?? null,
  })
}

// ---------------------------------------------------------------------------
// MCP registration
// ---------------------------------------------------------------------------

const TOOLS: McpTool[] = [
  {
    name: 'apps_script_list_projects',
    description:
      'Discover Google Apps Script projects accessible to the connected identity (Drive discovery filtered to application/vnd.google-apps.script).',
    inputSchema: {
      type: 'object',
      properties: {
        pageSize: { type: 'integer', minimum: 1, maximum: 100, description: 'Results per page (default 20).' },
        pageToken: { type: 'string', description: 'Pagination token from a previous call.' },
      },
    },
  },
  {
    name: 'apps_script_get_project',
    description: 'Retrieve normalized metadata for one Apps Script project (title, parentId, timestamps).',
    inputSchema: {
      type: 'object',
      properties: {
        scriptId: { type: 'string', description: 'Google Apps Script project ID.' },
      },
      required: ['scriptId'],
    },
  },
  {
    name: 'apps_script_get_content',
    description:
      'Retrieve the source/content of one Apps Script project (file name, type, and source per file). Source is read-only and bounded per file.',
    inputSchema: {
      type: 'object',
      properties: {
        scriptId: { type: 'string', description: 'Google Apps Script project ID.' },
      },
      required: ['scriptId'],
    },
  },
  {
    name: 'apps_script_run',
    description:
      'Execute an Apps Script function via the Executable API with bounded operation polling. Requires script.scriptapp scope and an API-executable deployment. Never executes arbitrary unknown functions automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        scriptId: { type: 'string', description: 'Google Apps Script project ID.' },
        function: { type: 'string', maxLength: 128, description: 'Function name to execute.' },
        parameters: { type: 'array', items: {}, maxItems: 50, description: 'Optional arguments (bounded size).' },
        timeout: { type: 'integer', minimum: 1, maximum: 300, description: 'Execution timeout in seconds (default 60).' },
      },
      required: ['scriptId', 'function'],
    },
  },
]

startMcpServer({
  name: 'google-apps-script',
  version: '0.1.0',
  tools: TOOLS,
  callTool: async (name, args) => {
    try {
      const token = await import('../shared/google/auth').then((m) => m.getAccessToken())
      switch (name) {
        case 'apps_script_list_projects':
          return await listProjects(token, args)
        case 'apps_script_get_project':
          return await getProject(token, args)
        case 'apps_script_get_content':
          return await getContent(token, args)
        case 'apps_script_run':
          return await runFunction(token, args)
        default:
          return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
      }
    } catch (err) {
      return { content: [{ type: 'text', text: `Error: ${scriptError(err).message}` }], isError: true }
    }
  },
})