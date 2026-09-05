import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * TASK-ALPHA-LOCAL-072: execution-boundary proof against REAL artifacts.
 *
 * - A test-only MCP server built on the shared `startMcpServer` wrapper
 *   proves the shared success/failure wiring end to end (the exact code path
 *   all six shared Google MCP servers use).
 * - Compiled `mcp-servers-dist` bundles prove failure paths emit zero
 *   activity events without ever touching Google (localhost stubs only).
 */

const REPO = process.cwd()

interface CapturedEvent {
  provider?: unknown
  provider_user_id?: unknown
  tool_name?: unknown
  occurred_at?: unknown
  [k: string]: unknown
}

let stub: Server
let stubPort = 0
let captured: CapturedEvent[] = []

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let s = ''
    req.on('data', (c: Buffer) => {
      s += c.toString()
    })
    req.on('end', () => resolve(s))
  })
}

beforeAll(async () => {
  captured = []
  stub = createServer(async (req, res) => {
    if (req.url === '/api/google/oauth/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          connected: true,
          email: 'tester@example.com',
          providerUserId: 'sub-123',
        })
      )
      return
    }
    if (req.url === '/google/activity' && req.method === 'POST') {
      try {
        captured.push(JSON.parse(await readBody(req)))
      } catch {
        /* ignore malformed */
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ updated: true }))
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not found' }))
  })
  await new Promise<void>((resolve) => {
    stub.listen(0, '127.0.0.1', () => {
      stubPort = (stub.address() as { port: number }).port
      resolve()
    })
  })
})

afterAll(async () => {
  await new Promise<void>((resolve) => stub.close(() => resolve()))
})

function spawnMcp(
  target: string[],
  extraEnv: Record<string, string> = {}
): ChildProcess {
  return spawn(process.execPath, target, {
    env: {
      ...process.env,
      PORT: String(stubPort),
      GOOGLE_ACTIVITY_URL: `http://127.0.0.1:${stubPort}/google/activity`,
      NODE_PATH: join(REPO, 'node_modules'),
      ...extraEnv,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
}

function rpc(
  proc: ChildProcess,
  method: string,
  params?: unknown,
  id = 1
): Promise<{ result?: unknown; error?: unknown }> {
  return new Promise((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => {
      proc.stdout?.off('data', onData)
      reject(new Error(`timeout waiting for ${method}`))
    }, 10000)
    const onData = (chunk: Buffer) => {
      buf += chunk.toString()
      let idx: number
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 1)
        if (!line.startsWith('{')) continue
        try {
          const msg = JSON.parse(line) as {
            id?: unknown
            result?: unknown
            error?: unknown
          }
          if (msg.id === id) {
            clearTimeout(timer)
            proc.stdout?.off('data', onData)
            resolve({ result: msg.result, error: msg.error })
            return
          }
        } catch {
          /* ignore */
        }
      }
    }
    proc.stdout?.on('data', onData)
    proc.stdin?.write(
      JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    )
  })
}

async function settle(ms = 800): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

describe('shared wrapper wiring (test harness server)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-activity-'))
  const harnessPath = join(dir, 'harness.ts')
  writeFileSync(
    harnessPath,
    `import { startMcpServer } from ${JSON.stringify(
      join(REPO, 'mcp-servers/shared/google/mcp.ts').replace(/\\/g, '/')
    )};
startMcpServer({
  name: 'test-activity',
  version: '0.0.0-test',
  tools: [
    { name: 'test_ok', description: 'ok', inputSchema: { type: 'object' } },
    { name: 'test_boom', description: 'boom', inputSchema: { type: 'object' } },
    { name: 'test_soft', description: 'soft', inputSchema: { type: 'object' } },
  ],
  callTool: async (toolName: string) => {
    if (toolName === 'test_ok') return { content: [{ type: 'text' as const, text: 'fine' }] };
    if (toolName === 'test_soft') return { content: [{ type: 'text' as const, text: 'Error: soft' }], isError: true };
    throw new Error('boom');
  },
});\n`
  )

  let proc: ChildProcess
  let nextId = 10

  const call = (method: string, params?: unknown) =>
    rpc(proc, method, params, nextId++)

  it('lists tools (sanity)', async () => {
    proc = spawnMcp(['--import', 'tsx/esm', harnessPath])
    const out = await call('tools/list', {});
    expect((out.result as { tools: unknown[] }).tools).toHaveLength(3)
  }, 20000)

  it('successful call returns correct result plus exactly one event', async () => {
    captured = []
    const out = await call('tools/call', {
      name: 'test_ok',
      arguments: {},
    });
    const result = out.result as {
      content: Array<{ text: string }>
      isError?: boolean
    }
    expect(result.isError).toBeFalsy()
    expect(result.content[0].text).toBe('fine')
    await settle()
    expect(captured).toHaveLength(1)
    const e = captured[0]
    expect(Object.keys(e).sort()).toEqual([
      'occurred_at',
      'provider',
      'provider_user_id',
      'tool_name',
    ])
    expect(e.provider).toBe('google')
    expect(e.provider_user_id).toBe('sub-123')
    expect(e.tool_name).toBe('test-activity_test_ok')
    expect(Number.isNaN(Date.parse(String(e.occurred_at)))).toBe(false)
  }, 20000)

  it('thrown failure emits zero events', async () => {
    captured = []
    const out = await call('tools/call', {
      name: 'test_boom',
      arguments: {},
    });
    const result = out.result as { isError?: boolean }
    expect(result.isError).toBe(true)
    await settle()
    expect(captured).toHaveLength(0)
  }, 20000)

  it('resolved isError emits zero events', async () => {
    captured = []
    const out = await call('tools/call', {
      name: 'test_soft',
      arguments: {},
    });
    expect((out.result as { isError?: boolean }).isError).toBe(true)
    await settle()
    expect(captured).toHaveLength(0)
  }, 20000)

  it('unknown tool emits zero events', async () => {
    captured = []
    const out = await call('tools/call', {
      name: 'nope',
      arguments: {},
    });
    expect(out.error).toBeTruthy()
    await settle()
    expect(captured).toHaveLength(0)
    proc.kill()
  }, 20000)
})

describe('compiled Google bundles: failures emit zero events', () => {
  const bundles = [
    'google-drive.js',
    'gmail.js',
    'google-sheets.js',
    'google-calendar.js',
  ]

  it.each(bundles)('%s unknown tool → JSON-RPC error, zero events', async (bundle) => {
    captured = []
    const proc = spawnMcp([join(REPO, 'mcp-servers-dist', bundle)])
    try {
      const out = await rpc(proc, 'tools/call', {
        name: 'definitely_not_a_tool',
        arguments: {},
      }, 31)
      expect(out.error).toBeTruthy()
      await settle(600)
      expect(captured).toHaveLength(0)
    } finally {
      proc.kill()
    }
  }, 20000)

  it('sheets missing-arg validation emits zero events', async () => {
    captured = []
    const proc = spawnMcp([join(REPO, 'mcp-servers-dist', 'google-sheets.js')])
    try {
      const out = await rpc(
        proc,
        'tools/call',
        { name: 'google_sheets.list_sheets', arguments: {} },
        32
      )
      expect(
        (out.result as { isError?: boolean }).isError
      ).toBe(true)
      await settle(600)
      expect(captured).toHaveLength(0)
    } finally {
      proc.kill()
    }
  }, 20000)

  it('gmail missing-arg validation emits zero events', async () => {
    captured = []
    const proc = spawnMcp([join(REPO, 'mcp-servers-dist', 'gmail.js')])
    try {
      const out = await rpc(
        proc,
        'tools/call',
        { name: 'gmail_read_message', arguments: {} },
        33
      )
      expect((out.result as { isError?: boolean }).isError).toBe(true)
      await settle(600)
      expect(captured).toHaveLength(0)
    } finally {
      proc.kill()
    }
  }, 20000)
})
