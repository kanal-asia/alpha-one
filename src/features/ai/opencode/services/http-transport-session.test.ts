/**
 * TASK-ALPHA-SUBSCRIBER-013: product session token carriage contract.
 *
 * The sign-out fix (`SignOutDialog` → `setProductSessionToken(null)`) ends
 * the verified product session only if clearing the token actually removes
 * the Authorization header from execution requests. This pins that contract
 * at the transport level (node-runnable; the component wiring itself is
 * covered by `sign-out-dialog.test.tsx` in the browser project):
 * - token set → `Authorization: Bearer <token>` present on requests;
 * - token cleared → header absent (logout truly de-authenticates execution).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HTTPTransport,
  setProductSessionToken,
} from './http-transport'

afterEach(() => {
  setProductSessionToken(null)
  vi.unstubAllGlobals()
})

async function captureHeaders(): Promise<Record<string, string>> {
  let seen: Record<string, string> = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      seen = { ...((init?.headers as Record<string, string>) ?? {}) }
      return { ok: false, json: async () => ({ error: 'stop' }) }
    })
  )
  const transport = new HTTPTransport()
  await transport.sendPrompt(
    '',
    'hi',
    () => {},
    undefined,
    { id: 'm/x', provider: 'p', slug: 'x', displayName: 'X' } as never,
    undefined,
    undefined,
    undefined
  )
  return seen
}

describe('product session token carriage', () => {
  it('attaches the verified session token to execution requests', async () => {
    setProductSessionToken('id-token-from-login')
    const headers = await captureHeaders()
    expect(headers['Authorization']).toBe('Bearer id-token-from-login')
  })

  it('clearing the token removes authentication from requests (logout)', async () => {
    setProductSessionToken('id-token-from-login')
    setProductSessionToken(null)
    const headers = await captureHeaders()
    expect(headers['Authorization']).toBeUndefined()
  })

  it('requests carry no Authorization header by default', async () => {
    const headers = await captureHeaders()
    expect(headers['Authorization']).toBeUndefined()
  })
})
