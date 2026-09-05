/**
 * TASK-066: Minimal MCP stdio bootstrap (JSON-RPC 2.0).
 *
 * Extracted from the proven google-sheets MCP transport
 * (mcp-servers/google-sheets/server.ts, stdio + handleRequest section).
 *
 * Boundary:
 * - Owns only transport framing, protocol lifecycle, and process lifecycle.
 * - Service MCPs explicitly register their own tools and dispatch logic
 *   (tool registration is intentionally NOT abstracted).
 * - TASK-ALPHA-LOCAL-072: observes exactly one successful-activity telemetry
 *   event per successful tools/call (fire-and-forget; never alters results).
 */

import {
  emitGoogleActivitySuccess,
  shouldEmitActivityForResult,
} from './activity'

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpToolResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

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

export interface McpServerOptions {
  name: string
  version: string
  tools: McpTool[]
  callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolResult> | McpToolResult
}

export function startMcpServer(options: McpServerOptions): void {
  let buffer = ''
  const pending = new Set<Promise<unknown>>()

  function writeResponse(res: JsonRpcResponse): void {
    process.stdout.write(JSON.stringify(res) + '\n')
  }

  function handleRequest(req: JsonRpcRequest): JsonRpcResponse | Promise<JsonRpcResponse> {
    if (req.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: req.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: options.name, version: options.version },
        },
      }
    }

    if (req.method === 'notifications/initialized') {
      return { jsonrpc: '2.0', id: null }
    }

    if (req.method === 'tools/list') {
      return { jsonrpc: '2.0', id: req.id, result: { tools: options.tools } }
    }

    if (req.method === 'tools/call') {
      const params = req.params as { name: string; arguments?: Record<string, unknown> } | undefined
      if (!params) {
        return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: 'Missing params' } }
      }
      const { name, arguments: args = {} } = params
      const known = options.tools.some((t) => t.name === name)
      if (!known) {
        return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Unknown tool: ${name}` } }
      }
      const result = options.callTool(name, args)
      return Promise.resolve(result).then(
        (r) => {
          // TASK-ALPHA-LOCAL-072: exactly one successful-activity event per
          // successful handler execution. Fire-and-forget AFTER the result is
          // computed: never blocks/alters the response; resolved isError and
          // rejections (below) emit nothing.
          if (shouldEmitActivityForResult(r)) {
            emitGoogleActivitySuccess(options.name, name)
          }
          return { jsonrpc: '2.0' as const, id: req.id, result: r }
        },
        (err) => ({
          jsonrpc: '2.0' as const,
          id: req.id,
          result: {
            content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : 'Unknown error'}` }],
            isError: true,
          },
        })
      )
    }

    if (req.method === 'ping') {
      return { jsonrpc: '2.0', id: req.id, result: {} }
    }

    return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `Method not found: ${req.method}` } }
  }

  function handleAndRespond(req: JsonRpcRequest): void {
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
    if (pending.size === 0) {
      process.exit(0)
    }
    Promise.allSettled([...pending]).then(() => process.exit(0))
  })

  process.stderr.write(`${options.name} MCP server started\n`)
}