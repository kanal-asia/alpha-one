import { afterEach, describe, expect, it, vi } from 'vitest'
import { HTTPTransport } from './http-transport'

/**
 * MSI-077 (Scope C): reasoning-variant request-payload proof.
 * The selected variant must reach the backend request body verbatim, and an
 * empty selection must send no variant (preserving default runtime behavior).
 * The backend maps a present body.variant to CLI `--variant` (server.ts).
 */
describe('HTTPTransport.sendPrompt variant payload', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function captureBody(variant?: string): Promise<Record<string, unknown>> {
    let seen: Record<string, unknown> = {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        seen = JSON.parse(String(init?.body)) as Record<string, unknown>
        // Non-OK short-circuits the SSE path: error chunk, then return.
        return { ok: false, json: async () => ({ error: 'stop' }) }
      })
    )
    const transport = new HTTPTransport()
    const chunks: unknown[] = []
    await transport.sendPrompt(
      '',
      'hi',
      (c) => chunks.push(c),
      undefined,
      { id: 'm/x', provider: 'p', slug: 'x', displayName: 'X' } as never,
      undefined,
      undefined,
      variant
    )
    return seen
  }

  it('sends a selected variant verbatim', async () => {
    const body = await captureBody('high')
    expect(body.variant).toBe('high')
  })

  it('omits variant when selection is empty (default behavior)', async () => {
    const body = await captureBody('')
    expect('variant' in body && body.variant !== undefined).toBe(false)
  })

  it('omits variant when undefined', async () => {
    const body = await captureBody(undefined)
    expect('variant' in body && body.variant !== undefined).toBe(false)
  })
})
