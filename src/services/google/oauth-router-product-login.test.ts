/**
 * TASK-ALPHA-AUTH-002: product-login router branch — focused security gate.
 *
 * Exercises the REAL router + oauth-service product-login implementation
 * (state store, PKCE, one-time completion codes, ID-token verification)
 * against an ephemeral Express listener. Google is simulated at the two
 * network edges only:
 *   - the token endpoint (global fetch stub)
 *   - the JWKS (injected via __setRemoteKeysForTests, same offline pattern
 *     as google-id-token.test.ts — real RS256 crypto, no live Google)
 *
 * No security check is weakened: state single-use + TTL, PKCE binding,
 * completion-code single-use + TTL, and verified-sub-only identity all run
 * through the production code paths.
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
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
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

// ---------------------------------------------------------------------------
// Environment must be fixed BEFORE the oauth modules load: DATA_ROOT is
// resolved (and the login-states dir computed) at module evaluation time.
// ---------------------------------------------------------------------------
const TMP_DATA = mkdtempSync(join(tmpdir(), 'alpha-product-login-test-'))
process.env['ALPHA_DATA_DIR'] = TMP_DATA
const CLIENT_ID = 'product-login-test-client.apps.googleusercontent.com'
process.env['GOOGLE_CLIENT_ID'] = CLIENT_ID
process.env['GOOGLE_CLIENT_SECRET'] = 'test-client-secret-not-a-real-one'
process.env['GOOGLE_OAUTH_REDIRECT_URI'] =
  'http://localhost:3001/api/google/oauth/callback'
process.env['CLIENT_URL'] = 'http://localhost:3001'
// TASK-ALPHA-SUBSCRIBER-022: this suite proves the legacy LOCAL exchange.
process.env['PRODUCT_OAUTH_LOCAL_EXCHANGE'] = '1'

const { createGoogleOAuthRouter } = await import('./oauth-router')
const { __setRemoteKeysForTests } = await import('../opencode/google-id-token')

const LOGIN_STATES_DIR = join(TMP_DATA, '.alpha', 'google', 'login-states')
const ISSUER = 'https://accounts.google.com'
const REAL_FETCH = globalThis.fetch

let signingKey: CryptoKey
const keyId = 'product-login-kid-1'
let server: Server
let baseUrl: string
let mintedIdTokens: string[] = []
let tokenEndpointCalls = 0

async function mintIdToken(overrides: {
  sub?: string | null
  iss?: string
  aud?: string
  expSecondsFromNow?: number
  mutateSignature?: boolean
  email?: string
} = {}): Promise<string> {
  const {
    sub = 'verified-google-sub-001',
    iss = ISSUER,
    aud = CLIENT_ID,
    expSecondsFromNow = 3600,
    mutateSignature = false,
    email = 'subscriber@example.com',
  } = overrides
  const now = Math.floor(Date.now() / 1000)
  const claims: Record<string, unknown> = {
    iss,
    aud,
    iat: now,
    exp: now + expSecondsFromNow,
    email,
    email_verified: true,
    name: 'Verified Subscriber',
  }
  if (sub !== null) claims['sub'] = sub
  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: keyId, typ: 'JWT' })
    .sign(signingKey)
  if (!mutateSignature) return jwt
  const parts = jwt.split('.')
  const sig = parts[2] ?? ''
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
  return `${parts[0]}.${parts[1]}.${flipped}`
}

/** Next token-endpoint response: fresh valid (or overridden) id_token. */
function programTokenEndpoint(overrides: Parameters<typeof mintIdToken>[0] = {}): void {
  mintedIdTokens = [] // consumed by the fetch stub on next call
  nextTokenResponse = overrides
}

let nextTokenResponse: Parameters<typeof mintIdToken>[0] = {}

function stateFilePath(state: string): string {
  return join(LOGIN_STATES_DIR, `${state}.json`)
}

function backdate(filePath: string, minutes: number): void {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>
  raw['createdAt'] = new Date(Date.now() - minutes * 60 * 1000).toISOString()
  writeFileSync(filePath, JSON.stringify(raw))
}

async function startLogin(): Promise<{ url: URL; state: string }> {
  const res = await fetch(`${baseUrl}/login`, { method: 'POST' })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { url: string }
  // The router returns only { url }; the CSRF state travels inside the
  // authorize URL (never as a separate response field).
  const url = new URL(body.url)
  const state = url.searchParams.get('state')
  expect(state).toBeTruthy()
  return { url, state: state as string }
}

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  signingKey = privateKey
  const jwk = await exportJWK(publicKey)
  const jwksPayload = JSON.stringify({ keys: [{ ...jwk, kid: keyId, use: 'sig', alg: 'RS256' }] })
  const jwksUrl = new URL(`data:application/json,${encodeURIComponent(jwksPayload)}`)
  __setRemoteKeysForTests(createRemoteJWKSet(jwksUrl))

  // Token-endpoint simulation: only Google's token URL is intercepted.
  vi.stubGlobal('fetch', vi.fn(simulatedFetch))

  const app = express()
  app.use(express.json())
  app.use('/api/google/oauth', createGoogleOAuthRouter())
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}/api/google/oauth`
})

/** Default simulation: token endpoint answers with a freshly minted id_token. */
async function simulatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = String(input)
  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    tokenEndpointCalls += 1
    expect(init?.method).toBe('POST')
    const params = new URLSearchParams(String(init?.body ?? ''))
    // PKCE binding: the code_verifier sent to Google must match the
    // challenge issued in the authorization URL (checked by caller
    // assertions via stored state; here we only require presence).
    expect(params.get('code_verifier')).toBeTruthy()
    expect(params.get('client_secret')).toBe('test-client-secret-not-a-real-one')
    expect(params.get('redirect_uri')).toBe(
      'http://localhost:3001/api/google/oauth/callback'
    )
    const idToken = await mintIdToken(nextTokenResponse)
    mintedIdTokens.push(idToken)
    return new Response(
      JSON.stringify({
        access_token: 'ya29.test-access-token',
        id_token: idToken,
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'openid email profile',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }
  return REAL_FETCH(input, init)
}

/** Variant for the missing-id_token case: same endpoint, no id_token field. */
async function simulatedFetchNoIdToken(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const url = String(input)
  if (url.startsWith('https://oauth2.googleapis.com/token')) {
    return new Response(
      JSON.stringify({
        access_token: 'ya29.no-id-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'openid email profile',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  }
  return REAL_FETCH(input, init)
}

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  )
  vi.unstubAllGlobals()
})

afterEach(() => {
  vi.unstubAllEnvs()
  // Restore configured env after any per-test stub.
  vi.stubEnv('GOOGLE_CLIENT_ID', CLIENT_ID)
  vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret-not-a-real-one')
  vi.stubEnv('GOOGLE_OAUTH_REDIRECT_URI', 'http://localhost:3001/api/google/oauth/callback')
  vi.stubEnv('CLIENT_URL', 'http://localhost:3001')
  // TASK-ALPHA-SUBSCRIBER-022: this suite proves the LEGACY local exchange;
  // the default is VPS-broker delegation (covered in the delegation suite).
  vi.stubEnv('PRODUCT_OAUTH_LOCAL_EXCHANGE', '1')
})

// ---------------------------------------------------------------------------
// Login initiation
// ---------------------------------------------------------------------------

describe('product login: initiation', () => {
  it('issues an authorize URL with minimal OIDC scopes, the configured redirect URI, and PKCE bound to the stored state', async () => {
    const { url, state } = await startLogin()
    expect(url.hostname).toBe('accounts.google.com')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3001/api/google/oauth/callback'
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('scope')).toBe('openid email profile')
    expect(url.searchParams.get('state')).toBe(state)
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    // Workspace scopes must never appear on the product-login consent.
    expect(url.searchParams.get('scope')).not.toContain('drive')
    expect(url.searchParams.get('scope')).not.toContain('gmail')
    // PKCE: challenge is the S256 of the server-held verifier.
    const stored = JSON.parse(readFileSync(stateFilePath(state), 'utf-8')) as {
      codeVerifier: string
    }
    const expected = createHash('sha256')
      .update(stored.codeVerifier)
      .digest('base64url')
    expect(url.searchParams.get('code_challenge')).toBe(expected)
  })

  it('fails closed with 503 AUTH_PROVIDER_NOT_CONFIGURED when configuration is missing', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '')
    const res = await fetch(`${baseUrl}/login`, { method: 'POST' })
    expect(res.status).toBe(503)
    const body = (await res.json()) as { code?: string }
    expect(body.code).toBe('AUTH_PROVIDER_NOT_CONFIGURED')
  })
})

// ---------------------------------------------------------------------------
// Callback handling
// ---------------------------------------------------------------------------

describe('product login: callback', () => {
  it('valid state: exchanges the code, verifies the ID token, redirects with a one-time completion code (no tokens in the URL)', async () => {
    programTokenEndpoint({ sub: 'sub-valid-callback-1' })
    const { state } = await startLogin()
    const res = await fetch(
      `${baseUrl}/callback?code=google-auth-code&state=${state}`,
      { redirect: 'manual' }
    )
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location.startsWith('http://localhost:3001/sign-in?product_login=')).toBe(true)
    const code = new URL(location).searchParams.get('product_login') ?? ''
    expect(code.length).toBeGreaterThanOrEqual(16)
    // Tokens never travel in the redirect URL.
    expect(location).not.toContain('ya29.')
    expect(location).not.toContain('id_token')
    // The state file was consumed (single-use).
    expect(() => readFileSync(stateFilePath(state))).toThrow()
    // Redemption returns the verified sub as the product identity.
    const complete = await fetch(`${baseUrl}/login/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(complete.status).toBe(200)
    const result = (await complete.json()) as {
      identity: { productUserId: string; email: string | null }
      idToken: string
      expiresIn: number
    }
    expect(result.identity.productUserId).toBe('sub-valid-callback-1')
    expect(result.identity.email).toBe('subscriber@example.com')
    expect(result.idToken).toBe(mintedIdTokens[mintedIdTokens.length - 1])
  })

  it('invalid state: rejected (never reaches token exchange)', async () => {
    const callsBefore = tokenEndpointCalls
    const res = await fetch(
      `${baseUrl}/callback?code=x&state=definitely-not-a-real-state`,
      { redirect: 'manual' }
    )
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('google_error=')
    expect(location).not.toContain('product_login=')
    expect(tokenEndpointCalls).toBe(callsBefore)
  })

  it('expired state: rejected even when well-formed', async () => {
    programTokenEndpoint({})
    const { state } = await startLogin()
    backdate(stateFilePath(state), 11)
    const callsBefore = tokenEndpointCalls
    const res = await fetch(`${baseUrl}/callback?code=x&state=${state}`, {
      redirect: 'manual',
    })
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('google_error=')
    expect(location).not.toContain('product_login=')
    expect(tokenEndpointCalls).toBe(callsBefore)
  })

  it('replayed state (second use of the same state) is rejected', async () => {
    programTokenEndpoint({ sub: 'sub-replay-state-1' })
    const { state } = await startLogin()
    const first = await fetch(`${baseUrl}/callback?code=x&state=${state}`, {
      redirect: 'manual',
    })
    expect(first.status).toBe(302)
    expect(first.headers.get('location') ?? '').toContain('product_login=')
    const second = await fetch(`${baseUrl}/callback?code=x&state=${state}`, {
      redirect: 'manual',
    })
    expect(second.status).toBe(302)
    const location = second.headers.get('location') ?? ''
    expect(location).toContain('google_error=')
    expect(location).not.toContain('product_login=')
  })

  it('Google authorization denial (access_denied) surfaces a clean error redirect', async () => {
    const res = await fetch(
      `${baseUrl}/callback?error=access_denied&state=whatever`,
      { redirect: 'manual' }
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(
      'http://localhost:3001/settings?google_error=access_denied'
    )
  })

  it('missing code/state is rejected before any state lookup', async () => {
    for (const qs of ['', '?code=only', '?state=only']) {
      const res = await fetch(`${baseUrl}/callback${qs}`, { redirect: 'manual' })
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe(
        'http://localhost:3001/settings?google_error=missing_params'
      )
    }
  })

  it('unverifiable identity token (tampered signature) fails the login, never mints a completion code', async () => {
    programTokenEndpoint({ mutateSignature: true })
    const { state } = await startLogin()
    const res = await fetch(`${baseUrl}/callback?code=x&state=${state}`, {
      redirect: 'manual',
    })
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('product_login_error=')
    expect(location).not.toContain('product_login=')
  })

  it('token without an id_token fails the login', async () => {
    const stub = globalThis.fetch as ReturnType<typeof vi.fn>
    stub.mockImplementation(simulatedFetchNoIdToken)
    try {
      const { state } = await startLogin()
      const res = await fetch(`${baseUrl}/callback?code=x&state=${state}`, {
        redirect: 'manual',
      })
      expect(res.status).toBe(302)
      const location = res.headers.get('location') ?? ''
      expect(location).toContain('product_login_error=')
      expect(location).not.toContain('product_login=')
    } finally {
      stub.mockImplementation(simulatedFetch)
    }
  })
})

// ---------------------------------------------------------------------------
// Completion-code redemption
// ---------------------------------------------------------------------------

describe('product login: completion redemption', () => {
  async function mintCompletionCode(sub: string): Promise<string> {
    programTokenEndpoint({ sub })
    const { state } = await startLogin()
    const res = await fetch(`${baseUrl}/callback?code=x&state=${state}`, {
      redirect: 'manual',
    })
    const location = res.headers.get('location') ?? ''
    return new URL(location).searchParams.get('product_login') ?? ''
  }

  it('single-use: a completion code redeems exactly once; replay is rejected', async () => {
    const code = await mintCompletionCode('sub-single-use-1')
    expect(code.length).toBeGreaterThanOrEqual(16)
    const first = await fetch(`${baseUrl}/login/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(first.status).toBe(200)
    const replay = await fetch(`${baseUrl}/login/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(replay.status).toBe(403)
    const body = (await replay.json()) as { code?: string }
    expect(body.code).toBe('AUTHENTICATION_INVALID')
  })

  it('expired completion code is rejected', async () => {
    const code = await mintCompletionCode('sub-expired-code-1')
    backdate(join(LOGIN_STATES_DIR, `complete-${code}.json`), 11)
    const res = await fetch(`${baseUrl}/login/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    expect(res.status).toBe(403)
  })

  it('missing or malformed code is rejected', async () => {
    for (const body of [{}, { code: '' }, { code: 'short' }, null]) {
      const res = await fetch(`${baseUrl}/login/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      expect(res.status).toBe(403)
    }
  })

  it('identity is the verified Google sub — body-supplied identity fields are ignored', async () => {
    const code = await mintCompletionCode('sub-canonical-999')
    const res = await fetch(`${baseUrl}/login/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        identity: {
          productUserId: 'attacker-chosen-id',
          email: 'victim@example.com',
        },
        productUserId: 'attacker-chosen-id',
        email: 'victim@example.com',
        userId: 'attacker-chosen-id',
      }),
    })
    expect(res.status).toBe(200)
    const result = (await res.json()) as {
      identity: { productUserId: string; email: string | null }
    }
    expect(result.identity.productUserId).toBe('sub-canonical-999')
    expect(result.identity.email).not.toBe('victim@example.com')
  })

  it('id_token with no sub claim can never produce a completion code', async () => {
    programTokenEndpoint({ sub: null })
    const { state } = await startLogin()
    const res = await fetch(`${baseUrl}/callback?code=x&state=${state}`, {
      redirect: 'manual',
    })
    expect(res.status).toBe(302)
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('product_login_error=')
    expect(location).not.toContain('product_login=')
  })
})

// ---------------------------------------------------------------------------
// TASK-ALPHA-SUBSCRIBER-017: dynamic loopback return base.
// The packaged backend serves the SPA at a dynamic port, so the OAuth
// callback must return to the per-request origin - never to a static default
// that points at nothing. Evil origins must fall back, never redirect.
// ---------------------------------------------------------------------------

async function startLoginWithReturnTo(
  returnTo: string
): Promise<{ url: URL; state: string }> {
  const res = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnTo }),
  })
  expect(res.status).toBe(200)
  const body = (await res.json()) as { url: string }
  const url = new URL(body.url)
  const state = url.searchParams.get('state')
  expect(state).toBeTruthy()
  return { url, state: state as string }
}

async function callbackLocation(state: string): Promise<string> {
  programTokenEndpoint({ sub: 'sub-return-base-1' })
  const res = await fetch(
    `${baseUrl}/callback?code=google-auth-code&state=${state}`,
    { redirect: 'manual' }
  )
  expect(res.status).toBe(302)
  return res.headers.get('location') ?? ''
}

describe('product login: callback return base', () => {
  it('stored loopback returnTo drives the redirect (dynamic packaged port)', async () => {
    const { state } = await startLoginWithReturnTo('http://127.0.0.1:58490')
    const location = await callbackLocation(state)
    expect(
      location.startsWith('http://127.0.0.1:58490/sign-in?product_login=')
    ).toBe(true)
  })

  it('evil returnTo falls back to the configured client URL', async () => {
    const { state } = await startLoginWithReturnTo(
      'https://evil.example/phish'
    )
    const location = await callbackLocation(state)
    expect(location).not.toContain('evil.example')
    expect(
      location.startsWith('http://localhost:3001/sign-in?product_login=')
    ).toBe(true)
  })

  it('javascript: returnTo falls back instead of executing', async () => {
    const { state } = await startLoginWithReturnTo(
      'javascript:alert(document.domain)'
    )
    const location = await callbackLocation(state)
    expect(location.startsWith('http://localhost:3001/sign-in?')).toBe(true)
  })
})

describe('resolveSafeReturnBase', () => {
  it('accepts loopback origins and returns their origin', async () => {
    const { resolveSafeReturnBase } = await import('./oauth-service')
    expect(
      resolveSafeReturnBase('http://127.0.0.1:64621/some/path?q=1', 'http://localhost:3000')
    ).toBe('http://127.0.0.1:64621')
    expect(
      resolveSafeReturnBase('http://localhost:3001', 'http://localhost:3000')
    ).toBe('http://localhost:3001')
  })

  it('rejects non-loopback, non-URL, and empty candidates', async () => {
    const { resolveSafeReturnBase } = await import('./oauth-service')
    const fallback = 'http://localhost:3000'
    for (const bad of [
      'https://evil.example/phish',
      'javascript:alert(1)',
      'not-a-url',
      '',
      null,
      undefined,
    ]) {
      expect(resolveSafeReturnBase(bad as string, fallback)).toBe(fallback)
    }
  })

  it('accepts the configured CLIENT_URL origin for non-loopback deployments', async () => {
    const { resolveSafeReturnBase } = await import('./oauth-service')
    expect(
      resolveSafeReturnBase(
        'https://alpha.kanal.asia/workspace',
        'https://alpha.kanal.asia'
      )
    ).toBe('https://alpha.kanal.asia')
  })
})
