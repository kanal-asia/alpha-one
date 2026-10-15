/**
 * TASK-ALPHA-SUBSCRIPTION-002A: Google ID-token verifier security gate.
 *
 * Uses cryptographically REAL fixtures: a local RS256 keypair mints tokens
 * and a test JWKS (injected via __setRemoteKeysForTests) verifies them —
 * the same jose code path as production, minus the network. This proves
 * application logic under valid cryptography; it does not prove Google's
 * live JWKS answers (labeled accordingly).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createRemoteJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
} from 'jose'
import {
  __setRemoteKeysForTests,
  isGoogleIdVerificationConfigured,
  verifyGoogleIdToken,
} from './google-id-token'
import { resolveAuthContextAsync } from './auth-context'

const CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
const ISSUER = 'https://accounts.google.com'
let signingKey: CryptoKey
let keyId = 'test-kid-1'

async function mintToken(overrides: {
  sub?: string | null
  iss?: string
  aud?: string | string[]
  expSecondsFromNow?: number
  mutateSignature?: boolean
  key?: CryptoKey
  kid?: string
  extra?: Record<string, unknown>
}): Promise<string> {
  const {
    sub = 'google-sub-123',
    iss = ISSUER,
    aud = CLIENT_ID,
    expSecondsFromNow = 3600,
    mutateSignature = false,
    key = signingKey,
    kid = keyId,
    extra = {},
  } = overrides
  const now = Math.floor(Date.now() / 1000)
  const claims: Record<string, unknown> = {
    iss,
    aud,
    iat: now,
    exp: now + expSecondsFromNow,
    email: 'user@example.com',
    email_verified: true,
    name: 'Test User',
    ...extra,
  }
  if (sub !== null) claims['sub'] = sub
  const jwt = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid, typ: 'JWT' })
    .sign(key)
  if (!mutateSignature) return jwt
  const parts = jwt.split('.')
  const sig = parts[2] ?? ''
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
  return `${parts[0]}.${parts[1]}.${flipped}`
}

beforeAll(async () => {
  vi.stubEnv('GOOGLE_CLIENT_ID', CLIENT_ID)
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  signingKey = privateKey
  const jwk = await exportJWK(publicKey)
  // Serve the public key as the JWKS (data: URL keeps the test offline).
  const jwksUrl = new URL(
    `data:application/json,${encodeURIComponent(JSON.stringify({ keys: [{ ...jwk, kid: keyId, use: 'sig', alg: 'RS256' }] }))}`
  )
  __setRemoteKeysForTests(createRemoteJWKSet(jwksUrl))
})

afterEach(() => {
  vi.stubEnv('GOOGLE_CLIENT_ID', CLIENT_ID)
})

describe('google-id-token: valid token verifies to the canonical sub', () => {
  it('accepts a well-formed token and derives productUserId from sub', async () => {
    const token = await mintToken({})
    const v = await verifyGoogleIdToken(token)
    expect(v).toMatchObject({ ok: true, productUserId: 'google-sub-123', email: 'user@example.com', emailVerified: true, name: 'Test User' })
  })
  it('isGoogleIdVerificationConfigured reflects GOOGLE_CLIENT_ID presence', () => {
    expect(isGoogleIdVerificationConfigured()).toBe(true)
    vi.stubEnv('GOOGLE_CLIENT_ID', '')
    expect(isGoogleIdVerificationConfigured()).toBe(false)
  })
})

describe('google-id-token: rejection cases', () => {
  it('expired token → AUTHENTICATION_EXPIRED', async () => {
    const token = await mintToken({ expSecondsFromNow: -600 })
    expect(await verifyGoogleIdToken(token)).toMatchObject({ ok: false, reason: 'AUTHENTICATION_EXPIRED' })
  })
  it('tampered signature → AUTHENTICATION_INVALID', async () => {
    const token = await mintToken({ mutateSignature: true })
    expect(await verifyGoogleIdToken(token)).toMatchObject({ ok: false, reason: 'AUTHENTICATION_INVALID' })
  })
  it('wrong issuer → AUTHENTICATION_INVALID', async () => {
    const token = await mintToken({ iss: 'https://evil.example.com' })
    expect(await verifyGoogleIdToken(token)).toMatchObject({ ok: false, reason: 'AUTHENTICATION_INVALID' })
  })
  it('wrong audience (another app client id) → AUTHENTICATION_INVALID', async () => {
    const token = await mintToken({ aud: 'other-app.apps.googleusercontent.com' })
    expect(await verifyGoogleIdToken(token)).toMatchObject({ ok: false, reason: 'AUTHENTICATION_INVALID' })
  })
  it('missing sub → AUTHENTICATION_INVALID (never derive identity from email)', async () => {
    const token = await mintToken({ sub: null })
    expect(await verifyGoogleIdToken(token)).toMatchObject({ ok: false, reason: 'AUTHENTICATION_INVALID' })
  })
  it('malformed token → AUTHENTICATION_INVALID (never throws)', async () => {
    for (const bad of ['', 'not-a-jwt', 'a.b', 'a.b.c.d']) {
      expect(await verifyGoogleIdToken(bad)).toMatchObject({ ok: false, reason: 'AUTHENTICATION_INVALID' })
    }
  })
  it('token signed by an unknown key → AUTHENTICATION_INVALID (rotation-safe)', async () => {
    const { privateKey } = await generateKeyPair('RS256')
    const token = await mintToken({ key: privateKey, kid: 'unknown-kid-9' })
    expect(await verifyGoogleIdToken(token)).toMatchObject({ ok: false, reason: 'AUTHENTICATION_INVALID' })
  })
  it('missing configuration fails closed with GOOGLE_NOT_CONFIGURED', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', '')
    expect(await verifyGoogleIdToken(await mintToken({}))).toMatchObject({ ok: false, reason: 'GOOGLE_NOT_CONFIGURED' })
  })
})

describe('auth-context async path: verified Google identity reaches execution context', () => {
  it('valid Bearer ID token resolves verified context with the sub', async () => {
    const token = await mintToken({ sub: 'google-sub-999' })
    const { context, error } = await resolveAuthContextAsync({ authorization: `Bearer ${token}` })
    expect(error).toBeUndefined()
    expect(context).toEqual({ kind: 'verified', productUserId: 'google-sub-999', provider: 'google', verified: true })
  })
  it('frontend-supplied identity fields cannot override the verified sub', async () => {
    const token = await mintToken({ sub: 'google-sub-999' })
    const { context } = await resolveAuthContextAsync({
      authorization: `Bearer ${token}`,
      userId: 'attacker-id',
      email: 'victim@example.com',
      productUserId: 'attacker-id',
    })
    expect(context.productUserId).toBe('google-sub-999')
  })
  it('garbage Bearer token fails closed (401-class, never anonymous success)', async () => {
    const { context, error } = await resolveAuthContextAsync({ authorization: 'Bearer forged-token' })
    expect(context.verified).toBe(false)
    expect(error?.code).toBe('AUTHENTICATION_INVALID')
    expect(error?.status).toBe(401)
  })
  it('no credential stays anonymous without error (local usage preserved)', async () => {
    const { context, error } = await resolveAuthContextAsync({})
    expect(error).toBeUndefined()
    expect(context.kind).toBe('anonymous')
  })
})
