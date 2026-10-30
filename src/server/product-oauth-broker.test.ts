/**
 * TASK-ALPHA-SUBSCRIBER-022: VPS Product Identity OAuth broker — security
 * gate. Exercises the REAL broker router + REAL SQLite transaction store
 * (isolated temp data root) against an ephemeral Express listener. Google is
 * simulated only at the token endpoint (fetch stub); ID tokens are REAL
 * RS256 fixtures verified through the production jose code path via an
 * injected JWKS (same offline pattern as google-id-token.test.ts).
 *
 * Covers: state validation, PKCE issuance, OIDC nonce binding, strict
 * loopback return allowlist, single-use atomic completion redemption,
 * redemption-secret binding, expiry, replay + concurrent redemption,
 * rate limiting, and log/URL secret hygiene. No security check is weakened.
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
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import express from 'express'
import {
  createRemoteJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from 'jose'

// Environment must be fixed BEFORE the broker modules load (stores resolve
// their DB path from ALPHA_DATA_DIR at first use).
const TMP_DATA = mkdtempSync(join(tmpdir(), 'alpha-product-broker-test-'))
process.env['ALPHA_DATA_DIR'] = TMP_DATA
const CLIENT_ID = 'broker-test-client.apps.googleusercontent.com'
process.env['GOOGLE_CLIENT_ID'] = CLIENT_ID
process.env['GOOGLE_CLIENT_SECRET'] = 'test-client-secret-not-a-real-one'
process.env['GOOGLE_OAUTH_REDIRECT_URI'] =
  'https://alpha.kanal.asia/api/google/oauth/callback'
process.env['CLIENT_URL'] = 'https://alpha.kanal.asia'

const { createProductOAuthRouter } = await import('./product-oauth-broker')
const { __setRemoteKeysForTests } = await import(
  '../services/opencode/google-id-token'
)

const REAL_FETCH = globalThis.fetch
const ISSUER = 'https://accounts.google.com'
const PRODUCT_REDIRECT =
  'https://alpha.kanal.asia/api/google/oauth/product/callback'

let signingKey: CryptoKey
const keyId = 'broker-kid-1'
let server: Server
let baseUrl: string
let nextTokenOverrides: {
  sub?: string | null
  nonce?: string | null
  aud?: string
  mutateSignature?: boolean
} = {}
let tokenEndpointRequests: URLSearchParams[] = []
const auditLogLines: string[] = []

async function mintIdToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const claims: Record<string, unknown> = {
    iss: ISSUER,
    aud: nextTokenOverrides.aud ?? CLIENT_ID,
    iat: now,
    exp: now + 3600,
    email: 'broker-subscriber@example.com',
    email_verified: true,
    name: 'Broker Subscriber',
  }
  if (typeof nextTokenOverrides.nonce === 'string') {
    claims['nonce'] = nextTokenOverrides.nonce
  }
  if (nextTokenOverrides.sub !== null) {
    claims['sub'] = nextTokenOverrides.sub ?? 'broker-verified-sub-1'
  }
  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: keyId, typ: 'JWT' })
    .sign(signingKey)
  if (!nextTokenOverrides.mutateSignature) return jwt
  const parts = jwt.split('.')
  const sig = parts[2] ?? ''
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
  return `${parts[0]}.${parts[1]}.${flipped}`
}

async function simulatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = String(input)
  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    tokenEndpointRequests.push(new URLSearchParams(String(init?.body ?? '')))
    return new Response(
      JSON.stringify({
        access_token: 'ya29.broker-test-access',
        id_token: await mintIdToken(),
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'openid email profile',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }
  return REAL_FETCH(input, init)
}

let requestCounter = 0
/** Distinct client key per test isolates the per-IP rate limiter. */
function testIp(): string {
  requestCounter += 1
  return `203.0.113.${requestCounter}`
}

async function startLogin(
  returnTo = 'http://127.0.0.1:5555',
  ip = testIp()
): Promise<{
  url: URL
  state: string
  transactionId: string
  redemptionSecret: string
  ip: string
}> {
  const res = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip,
    },
    body: JSON.stringify({ returnTo }),
  })
  expect(res.status).toBe(200)
  const body = (await res.json()) as {
    url: string
    transactionId: string
    redemptionSecret: string
  }
  const url = new URL(body.url)
  return {
    url,
    state: url.searchParams.get('state') ?? '',
    transactionId: body.transactionId,
    redemptionSecret: body.redemptionSecret,
    ip,
  }
}

async function hitCallback(
  query: string,
  ip = testIp()
): Promise<{ status: number; location: string }> {
  const res = await fetch(`${baseUrl}/callback${query}`, {
    redirect: 'manual',
    headers: { 'X-Forwarded-For': ip },
  })
  return { status: res.status, location: res.headers.get('location') ?? '' }
}

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  signingKey = privateKey
  const jwk = await exportJWK(publicKey)
  const jwksPayload = JSON.stringify({
    keys: [{ ...jwk, kid: keyId, use: 'sig', alg: 'RS256' }],
  })
  __setRemoteKeysForTests(
    createRemoteJWKSet(
      new URL(`data:application/json,${encodeURIComponent(jwksPayload)}`)
    )
  )
  vi.stubGlobal('fetch', vi.fn(simulatedFetch))
  const infoSpy = vi.spyOn(console, 'info')
  infoSpy.mockImplementation((...args: unknown[]) => {
    auditLogLines.push(args.map((a) => String(a)).join(' '))
  })

  const app = express()
  app.use(express.json())
  app.use('/google/oauth/product', createProductOAuthRouter())
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}/google/oauth/product`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  )
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv('GOOGLE_CLIENT_ID', CLIENT_ID)
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret-not-a-real-one')
  vi.stubEnv('GOOGLE_OAUTH_REDIRECT_URI', PRODUCT_REDIRECT.replace('/product', ''))
  nextTokenOverrides = {}
})

// ---------------------------------------------------------------------------
// Login initiation
// ---------------------------------------------------------------------------

describe('broker login', () => {
  it('issues an authorize URL with the product redirect URI, minimal OIDC scopes, PKCE S256, and a nonce; returns transaction id + redemption secret', async () => {
    const { url, state, transactionId, redemptionSecret } = await startLogin()
    expect(url.hostname).toBe('accounts.google.com')
    expect(url.searchParams.get('redirect_uri')).toBe(PRODUCT_REDIRECT)
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).toBeTruthy()
    expect(url.searchParams.get('nonce')).toBeTruthy()
    expect(url.searchParams.get('state')).toBe(state)
    expect(state.length).toBeGreaterThanOrEqual(32)
    expect(transactionId.length).toBeGreaterThanOrEqual(16)
    expect(redemptionSecret.length).toBeGreaterThanOrEqual(32)
    // Product consent must never request Workspace permissions.
    expect(url.searchParams.get('scope')).not.toContain('drive')
    expect(url.searchParams.get('scope')).not.toContain('gmail')
    // No offline access: no Google refresh token is ever requested.
    expect(url.searchParams.get('access_type')).toBeNull()
  })

  it('rejects non-loopback, malformed, and unsafe-scheme returnTo with 400 LOGIN_RETURN_INVALID', async () => {
    for (const bad of [
      'https://evil.example.com/steal',
      'javascript:alert(1)',
      'not-a-url',
      '',
      undefined,
    ]) {
      const res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': testIp() },
        body: JSON.stringify({ returnTo: bad }),
      })
      expect(res.status).toBe(400)
      expect(((await res.json()) as { code?: string }).code).toBe(
        'LOGIN_RETURN_INVALID'
      )
    }
  })

  it('fails closed with 503 AUTH_PROVIDER_NOT_CONFIGURED when configuration is missing', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '')
    const res = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': testIp() },
      body: JSON.stringify({ returnTo: 'http://127.0.0.1:5555' }),
    })
    expect(res.status).toBe(503)
    expect(((await res.json()) as { code?: string }).code).toBe(
      'AUTH_PROVIDER_NOT_CONFIGURED'
    )
  })

  it('rate-limits repeated login attempts from one client', async () => {
    vi.stubEnv('PRODUCT_LOGIN_RATE_LIMIT', '2')
    const ip = testIp()
    const statuses: number[] = []
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': ip,
        },
        body: JSON.stringify({ returnTo: 'http://127.0.0.1:5555' }),
      })
      statuses.push(res.status)
    }
    expect(statuses).toEqual([200, 200, 429])
  })
})

// ---------------------------------------------------------------------------
// Callback
// ---------------------------------------------------------------------------

describe('broker callback', () => {
  it('valid state: exchanges the code server-side, verifies the ID token + nonce, redirects with a one-time code bound to the transaction', async () => {
    const login = await startLogin()
    tokenEndpointRequests = []
    // The mock returns the nonce the broker issued (bound at login time).
    const expectedNonce = login.url.searchParams.get('nonce') ?? ''
    nextTokenOverrides = { sub: 'broker-sub-valid-1', nonce: expectedNonce }

    const { status, location } = await hitCallback(
      `?code=google-auth-code&state=${login.state}`,
      login.ip
    )
    expect(status).toBe(302)
    expect(
      location.startsWith('http://127.0.0.1:5555/sign-in?product_login=')
    ).toBe(true)
    const completionCode = decodeURIComponent(
      new URL(location).searchParams.get('product_login') ?? ''
    )
    expect(completionCode.startsWith(`${login.transactionId}.`)).toBe(true)
    // No credential material in the redirect.
    expect(location).not.toContain('ya29.')
    expect(location).not.toContain('id_token')
    expect(location).not.toContain(login.redemptionSecret)

    // The exchange happened server-side with PKCE verifier + client secret.
    expect(tokenEndpointRequests).toHaveLength(1)
    const sent = tokenEndpointRequests[0]
    expect(sent.get('code')).toBe('google-auth-code')
    expect(sent.get('code_verifier')).toBeTruthy()
    expect(sent.get('client_secret')).toBe('test-client-secret-not-a-real-one')
    expect(sent.get('redirect_uri')).toBe(PRODUCT_REDIRECT)
    expect(sent.get('grant_type')).toBe('authorization_code')

    // Redemption with the desktop-held secret yields the verified sub.
    const complete = await fetch(`${baseUrl}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': login.ip },
      body: JSON.stringify({
        code: completionCode,
        redemptionSecret: login.redemptionSecret,
      }),
    })
    expect(complete.status).toBe(200)
    const body = (await complete.json()) as {
      identity: { productUserId: string }
      idToken: string
      expiresIn: number
    }
    expect(body.identity.productUserId).toBe('broker-sub-valid-1')
    expect(typeof body.idToken).toBe('string')
    expect(body.expiresIn).toBeGreaterThan(0)
  })

  it('unknown state is rejected without any token exchange', async () => {
    const before = tokenEndpointRequests.length
    const { status, location } = await hitCallback(
      '?code=x&state=not-a-real-state-at-all',
      testIp()
    )
    expect(status).toBe(302)
    expect(location).toContain('product_login_error=login_state_invalid')
    expect(location).toContain('alpha.kanal.asia')
    expect(tokenEndpointRequests.length).toBe(before)
  })

  it('missing code/state parameters are rejected', async () => {
    for (const qs of ['', '?code=only', '?state=only']) {
      const { location } = await hitCallback(qs, testIp())
      expect(location).toContain('product_login_error=login_state_invalid')
    }
  })

  it('replayed state (second callback with the same state) is rejected', async () => {
    const login = await startLogin()
    const expectedNonce = login.url.searchParams.get('nonce') ?? ''
    nextTokenOverrides = { sub: 'broker-sub-replay-1', nonce: expectedNonce }
    const first = await hitCallback(
      `?code=x&state=${login.state}`,
      login.ip
    )
    expect(first.location).toContain('product_login=')
    const second = await hitCallback(`?code=x&state=${login.state}`, login.ip)
    expect(second.location).toContain('product_login_error=login_state_invalid')
    expect(second.location).not.toContain('product_login=')
  })

  it('expired state is rejected', async () => {
    vi.stubEnv('PRODUCT_LOGIN_TTL_MS', '50')
    const login = await startLogin()
    await new Promise((r) => setTimeout(r, 80))
    const { location } = await hitCallback(
      `?code=x&state=${login.state}`,
      login.ip
    )
    expect(location).toContain('product_login_error=login_state_invalid')
  })

  it('Google authorization denial (access_denied) redirects with login_denied', async () => {
    const login = await startLogin()
    const { location } = await hitCallback(
      `?error=access_denied&state=${login.state}`,
      login.ip
    )
    expect(location).toBe(
      'http://127.0.0.1:5555/sign-in?product_login_error=login_denied'
    )
  })

  it('tampered ID-token signature fails the login', async () => {
    const login = await startLogin()
    nextTokenOverrides = {
      mutateSignature: true,
      nonce: login.url.searchParams.get('nonce') ?? '',
    }
    const { location } = await hitCallback(
      `?code=x&state=${login.state}`,
      login.ip
    )
    expect(location).toContain('product_login_error=login_identity_invalid')
    expect(location).not.toContain('product_login=')
  })

  it('ID token with a mismatched nonce fails the login (OIDC binding)', async () => {
    const login = await startLogin()
    nextTokenOverrides = { nonce: 'a-completely-different-nonce' }
    const { location } = await hitCallback(
      `?code=x&state=${login.state}`,
      login.ip
    )
    expect(location).toContain('product_login_error=login_identity_invalid')
  })

  it('ID token with the wrong audience fails the login', async () => {
    const login = await startLogin()
    nextTokenOverrides = {
      aud: 'other-app.apps.googleusercontent.com',
      nonce: login.url.searchParams.get('nonce') ?? '',
    }
    const { location } = await hitCallback(
      `?code=x&state=${login.state}`,
      login.ip
    )
    expect(location).toContain('product_login_error=login_identity_invalid')
  })

  it('ID token without a sub claim fails the login (identity never from email)', async () => {
    const login = await startLogin()
    nextTokenOverrides = {
      sub: null,
      nonce: login.url.searchParams.get('nonce') ?? '',
    }
    const { location } = await hitCallback(
      `?code=x&state=${login.state}`,
      login.ip
    )
    expect(location).toContain('product_login_error=login_identity_invalid')
  })
})

// ---------------------------------------------------------------------------
// Completion redemption
// ---------------------------------------------------------------------------

describe('broker completion redemption', () => {
  async function mintCompletion(): Promise<{
    login: Awaited<ReturnType<typeof startLogin>>
    completionCode: string
    ip: string
  }> {
    const login = await startLogin()
    nextTokenOverrides = {
      sub: 'broker-sub-redemption-1',
      nonce: login.url.searchParams.get('nonce') ?? '',
    }
    const { location } = await hitCallback(
      `?code=x&state=${login.state}`,
      login.ip
    )
    const completionCode = decodeURIComponent(
      new URL(location).searchParams.get('product_login') ?? ''
    )
    return { login, completionCode, ip: login.ip }
  }

  it('redeems exactly once with the matching secret; replay is rejected', async () => {
    const { login, completionCode, ip } = await mintCompletion()
    const body = JSON.stringify({
      code: completionCode,
      redemptionSecret: login.redemptionSecret,
    })
    const first = await fetch(`${baseUrl}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body,
    })
    expect(first.status).toBe(200)
    const replay = await fetch(`${baseUrl}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body,
    })
    expect(replay.status).toBe(403)
    expect(((await replay.json()) as { code?: string }).code).toBe(
      'AUTHENTICATION_INVALID'
    )
  })

  it('a code without the desktop-held secret is unusable (URL leak alone is not enough)', async () => {
    const { completionCode, ip } = await mintCompletion()
    for (const secret of ['', 'wrong-secret-value-of-sufficient-length', completionCode]) {
      const res = await fetch(`${baseUrl}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify({ code: completionCode, redemptionSecret: secret }),
      })
      expect(res.status).toBe(403)
    }
  })

  it('concurrent redemption of the same code yields exactly one success (atomic)', async () => {
    const { login, completionCode, ip } = await mintCompletion()
    const body = JSON.stringify({
      code: completionCode,
      redemptionSecret: login.redemptionSecret,
    })
    const results = await Promise.all(
      [1, 2].map(() =>
        fetch(`${baseUrl}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
          body,
        })
      )
    )
    const statuses = results.map((r) => r.status).sort()
    expect(statuses).toEqual([200, 403])
  })

  it('expired completion codes are rejected', async () => {
    vi.stubEnv('PRODUCT_LOGIN_TTL_MS', '300')
    const { login, completionCode, ip } = await mintCompletion()
    await new Promise((r) => setTimeout(r, 350))
    const res = await fetch(`${baseUrl}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
      body: JSON.stringify({
        code: completionCode,
        redemptionSecret: login.redemptionSecret,
      }),
    })
    expect(res.status).toBe(403)
  })

  it('malformed or missing fields are rejected', async () => {
    for (const body of [
      {},
      { code: 'nodot-in-this-value-nodot' },
      { code: '.starts-with-dot' },
      { code: 'ends-with-dot.' },
      { code: 'tx.short', redemptionSecret: '' },
      { code: 'tx.somecode', redemptionSecret: 'short' },
    ]) {
      const res = await fetch(`${baseUrl}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': testIp(),
        },
        body: JSON.stringify(body),
      })
      expect(res.status).toBe(403)
    }
  })

  it('rate-limits repeated completion attempts', async () => {
    vi.stubEnv('PRODUCT_LOGIN_RATE_LIMIT', '2')
    const ip = testIp()
    const statuses: number[] = []
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
        body: JSON.stringify({ code: 'tx.randomcode', redemptionSecret: 'x'.repeat(32) }),
      })
      statuses.push(res.status)
    }
    expect(statuses).toEqual([403, 403, 429])
  })
})

// ---------------------------------------------------------------------------
// Hygiene
// ---------------------------------------------------------------------------

describe('broker logging and redirect hygiene', () => {
  it('audit logs never contain secrets, codes, or tokens', async () => {
    const login = await startLogin()
    nextTokenOverrides = {
      sub: 'broker-sub-hygiene-1',
      nonce: login.url.searchParams.get('nonce') ?? '',
    }
    const { location } = await hitCallback(
      `?code=x&state=${login.state}`,
      login.ip
    )
    const completionCode = decodeURIComponent(
      new URL(location).searchParams.get('product_login') ?? ''
    )
    await fetch(`${baseUrl}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': login.ip },
      body: JSON.stringify({
        code: completionCode,
        redemptionSecret: login.redemptionSecret,
      }),
    })
    const joined = auditLogLines.join('\n')
    expect(auditLogLines.length).toBeGreaterThan(0)
    expect(joined).not.toContain(login.redemptionSecret)
    expect(joined).not.toContain(completionCode)
    expect(joined).not.toContain(login.state)
    expect(joined).not.toContain('ya29.')
    expect(joined).not.toContain('test-client-secret-not-a-real-one')
    expect(joined).toMatch(/login_completed/)
    expect(joined).toMatch(/login_redeemed/)
  })
})
