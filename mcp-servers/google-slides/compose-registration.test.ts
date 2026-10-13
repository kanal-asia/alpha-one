/**
 * TASK-086R2 §11.1–2: the built Slides MCP bundle exposes slides_compose_slide
 * exactly once via live tools/list (same JSON-RPC path OpenCode discovery uses).
 * Spawns mcp-servers-dist/google-slides.js — no Google traffic (list only).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = process.cwd()
const EXPECTED_TOOLS = [
  'slides_get_presentation',
  'slides_list_presentations',
  'slides_create_presentation',
  'slides_update_presentation',
  'slides_get_page',
  'slides_create_element',
  'slides_update_element',
  'slides_delete_object',
  'slides_duplicate_object',
  'slides_update_page',
  'slides_create_slide',
  'slides_compose_slide',
  'slides_list_themes',
  'slides_compose_deck',
  'slides_batch_update',
]

interface RpcResponse {
  result?: { tools?: Array<{ name?: string; description?: string }> }
  error?: unknown
}

function start(): { proc: ChildProcess; call: (method: string, params?: unknown) => Promise<RpcResponse> } {
  const proc = spawn(process.execPath, [join(REPO, 'mcp-servers-dist', 'google-slides.js')], {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let buf = ''
  let nextId = 1
  const pending = new Map<number, (msg: RpcResponse) => void>()
  proc.stdout?.on('data', (d: Buffer) => {
    buf += d.toString('utf8')
    let idx: number
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      try {
        const msg = JSON.parse(line) as RpcResponse & { id?: number }
        if (msg.id !== undefined && pending.has(msg.id)) {
          pending.get(msg.id)?.(msg)
          pending.delete(msg.id)
        }
      } catch {
        /* non-JSON stdout ignored */
      }
    }
  })
  const call = (method: string, params: unknown = {}): Promise<RpcResponse> =>
    new Promise((resolve, reject) => {
      const id = nextId++
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error(`RPC timeout for ${method}`))
      }, 15000)
      pending.set(id, (msg) => {
        clearTimeout(timer)
        resolve(msg)
      })
      proc.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    })
  return { proc, call }
}

describe('built Slides bundle exposes compose (§11.1–2)', () => {
  it('tools/list returns 15/15 with deck-level Alpha Beautify tools exactly once', async () => {
    const { proc, call } = start()
    try {
      await call('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'compose-registration-test', version: '1' },
      })
      const out = await call('tools/list', {})
      expect(out.error).toBeFalsy()
      const names = (out.result?.tools ?? []).map((t) => t.name)
      expect(names).toHaveLength(15)
      for (const name of EXPECTED_TOOLS) expect(names).toContain(name)
      expect(names.filter((n) => n === 'slides_compose_slide')).toHaveLength(1)
      expect(names.filter((n) => n === 'slides_list_themes')).toHaveLength(1)
      expect(names.filter((n) => n === 'slides_compose_deck')).toHaveLength(1)
    } finally {
      proc.kill()
    }
  }, 30000)

  it('routes new multi-slide deck generation to slides_compose_deck', async () => {
    const { proc, call } = start()
    try {
      await call('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'compose-routing-test', version: '1' },
      })
      const out = await call('tools/list', {})
      expect(out.error).toBeFalsy()
      const tools = out.result?.tools ?? []
      const composeSlide = tools.find((t) => t.name === 'slides_compose_slide')?.description ?? ''
      const composeDeck = tools.find((t) => t.name === 'slides_compose_deck')?.description ?? ''

      expect(composeSlide).toMatch(/explicit single-slide request/i)
      expect(composeSlide).toMatch(/new deck with 2 or more slides/i)
      expect(composeSlide).toMatch(/use slides_compose_deck exactly once/i)
      expect(composeSlide).toMatch(/do not create deck-generation loops/i)

      expect(composeDeck).toMatch(/new deck with 2 or more slides/i)
      expect(composeDeck).toMatch(/call it exactly once/i)
      expect(composeDeck).toMatch(/Do not pre-create the deck/i)
      expect(composeDeck).toMatch(/call slides_compose_slide per slide/i)
      expect(composeDeck).toMatch(/agent-driven archetype retries/i)
    } finally {
      proc.kill()
    }
  }, 30000)
})
