/**
 * TASK-ALPHA-SUBSCRIBER-022: desktop → VPS broker delegation — contract gate.
 *
 * Exercises the REAL oauth-router product endpoints in broker mode (the
 * packaged default) against an ephemeral Express listener, with the VPS
 * broker simulated over fetch. Proves:
 *  - the SPA contract is unchanged ({url} then {identity, idToken, expiresIn});
 *  - the redemption secret never reaches the SPA and is never persisted;
 *  - code/secret association is bound to the initiating runtime (single-use);
 *  - non-loopback returnTo is rejected before any broker call;
 *  - broker failures propagate without leaking internals.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'

const TMP_DATA = mkdtempSync(join(tmpdir(), 'alpha-broker-delegation-test-'))
process.env['ALPHA_DATA_DIR'] = TMP_DATA
// Broker mode is the default; PRODUCT_OAUTH_LOCAL_EXCHANGE stays unset.
process.env['PRODUCT_OAUTH_BROKER_URL'] = 'https://broker.test'

const { createGoogleOAuthRouter } = await import('./oauth-router')

const REAL_FETCH = globalThis.fetch
const BROKER_SECRET = 'redemption-secret-value-for-delegation-tests'
const BROKER_TX = 'tx-delegation-0001'
const BROKER_ID_TOKEN = 'delegation.test.idtoken'

interface BrokerCall {
  path: string
  body: Record<string, unknown>
}
const brokerCalls: BrokerCall[] = []
let brokerMode: 'ok' | 'http503' | 'down' = 'ok'

async function simulatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = String(input)
  if (url.startsWith('https://broker.test/')) {
    const path = url.replace('https://broker.test', '')
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    brokerCalls.push({ path, body })
    if (brokerMode === 'down') {
      throw new TypeError('fetch failed')
    }
    if (brokerMode === 'http503') {
      return new Response(JSON.stringify({ error: 'Product login is not configured.', code: 'AUTH_PROVIDER_NOT_CONFIGURED' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      })
    }
    if (path === '/api/google/oauth/product/login') {
      return new Response(
        JSON.stringify({
          url: 'https://accounts.google.com/o/oauth2/v2/auth?broker=1',
          transactionId: BROKER_TX,
          redemptionSecret: BROKER_SECRET,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }
    return new Response(
      JSON.stringify({
        identity: {
          productUserId: 'delegation-verified-sub',
          email: 'delegate@example.com',
          name: 'Delegate User',
          picture: null,
        },
        idToken: BROKER_ID_TOKEN,
        expiresIn: 3600,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }
  return REAL_FETCH(input, init)
}

let server: Server
let baseUrl: string

beforeAll(async () => {
  vi.stubGlobal('fetch', vi.fn(simulatedFetch))
  const app = express()
  app.use(express.json())
  app.use('/api/google/oauth', createGoogleOAuthRouter())
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}/api/google/oauth`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  )
  vi.unstubAllGlobals()
})

afterEach(() => {
  brokerCalls.length = 0
  brokerMode = 'ok'
})

function walkFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walkFiles(full))
    else out.push(full)
  }
  return out
}

describe('desktop delegation to the VPS broker', () => {
  it('POST /login returns only the authorize URL to the SPA and keeps the redemption secret in runtime memory', async () => {
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo: 'http://127.0.0.1:5555' }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    // SPA contract: exactly { url } — no secret/transaction material.
    expect(Object.keys(body)).toEqual(['url'])
    expect(body.url).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth?broker=1'
    )
    // returnTo was forwarded to the broker verbatim.
    expect(brokerCalls).toHaveLength(1)
    expect(brokerCalls[0].path).toBe('/api/google/oauth/product/login')
    expect(brokerCalls[0].body).toEqual({ returnTo: 'http://127.0.0.1:5555' })
  })

  it('rejects non-loopback returnTo with 400 LOGIN_RETURN_INVALID before any broker call', async () => {
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo: 'https://evil.example.com' }),
    })
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code?: string }).code).toBe(
      'LOGIN_RETURN_INVALID'
    )
    expect(brokerCalls).toHaveLength(0)
  })

  it('POST /login/complete forwards code + in-memory secret to the broker and returns the verified identity', async () => {
    // Start a login so the runtime remembers the secret for BROKER_TX.
    await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo: 'http://127.0.0.1:5555' }),
    })
    const res = await fetch(`${baseUrl}/login/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: `${BROKER_TX}.one-time-code-part` }),
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      identity: { productUserId: string }
      idToken: string
      expiresIn: number
    }
    expect(body.identity.productUserId).toBe('delegation-verified-sub')
    expect(body.idToken).toBe(BROKER_ID_TOKEN)
    expect(body.expiresIn).toBe(3600)
    const complete = brokerCalls.find(
      (c) => c.path === '/api/google/oauth/product/complete'
    )
    expect(complete).toBeDefined()
    expect(complete?.body).toEqual({
      code: `${BROKER_TX}.one-time-code-part`,
      redemptionSecret: BROKER_SECRET,
    })
  })

  it('local single-use: the same completion code cannot be redeemed twice through the runtime', async () => {
    await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo: 'http://127.0.0.1:5555' }),
    })
    const body = JSON.stringify({ code: `${BROKER_TX}.replay-attempt` })
    const first = await fetch(`${baseUrl}/login/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    expect(first.status).toBe(200)
    const second = await fetch(`${baseUrl}/login/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    expect(second.status).toBe(403)
  })

  it('unknown transaction ids and malformed codes are rejected without a broker call', async () => {
    for (const code of ['unknown-tx.somecode', 'nodot-here', '.x', 'tx.']) {
      const res = await fetch(`${baseUrl}/login/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      expect(res.status).toBe(403)
    }
    expect(
      brokerCalls.filter((c) => c.path.endsWith('/complete'))
    ).toHaveLength(0)
  })

  it('propagates broker configuration failures as 503 AUTH_PROVIDER_NOT_CONFIGURED', async () => {
    brokerMode = 'http503'
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo: 'http://127.0.0.1:5555' }),
    })
    expect(res.status).toBe(503)
    expect(((await res.json()) as { code?: string }).code).toBe(
      'AUTH_PROVIDER_NOT_CONFIGURED'
    )
  })

  it('unreachable broker fails closed (503) without leaking internals', async () => {
    brokerMode = 'down'
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo: 'http://127.0.0.1:5555' }),
    })
    expect(res.status).toBe(503)
    const body = (await res.json()) as { error?: string }
    expect(body.error).not.toContain('fetch failed')
  })

  it('the redemption secret is never persisted to disk (memory-only)', async () => {
    await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnTo: 'http://127.0.0.1:5555' }),
    })
    for (const file of walkFiles(TMP_DATA)) {
      const content = readFileSync(file, 'utf-8')
      expect(content).not.toContain(BROKER_SECRET)
    }
  })
})
