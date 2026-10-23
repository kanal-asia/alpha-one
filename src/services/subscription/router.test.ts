/**
 * TASK-ALPHA-SUBSCRIBER-003: subscription status router contract.
 *
 * Exercises the REAL router + sqlite persistence against an ephemeral
 * Express listener and an isolated DATA_ROOT (mkdtemp). Identity uses real
 * RS256 ID tokens (local keypair, injected JWKS — same offline pattern as
 * google-id-token.test.ts). No live Google, no production data.
 *
 * Proven here:
 * - anonymous → effective Free, and GET creates no row;
 * - verified without row → effective Free, still no row;
 * - verified with row → stored plan + status, source record;
 * - owner isolation (B never sees A's row);
 * - unknown stored plan → 500 SUBSCRIPTION_PLAN_UNKNOWN (fail closed);
 * - forged credential → 401 (never anonymous success).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

// DATA_ROOT (and the sqlite DB path) resolves at module evaluation time.
const TMP_DATA = mkdtempSync(join(tmpdir(), 'alpha-subscription-test-'))
process.env['ALPHA_DATA_DIR'] = TMP_DATA
const CLIENT_ID = 'subscription-test-client.apps.googleusercontent.com'
process.env['GOOGLE_CLIENT_ID'] = CLIENT_ID

const { createSubscriptionRouter } = await import('./router')
const {
  getSubscriptionByOwner,
  saveSubscription,
} = await import('../../lib/sqlite-persistence')
const { __setRemoteKeysForTests } = await import('../opencode/google-id-token')

const ISSUER = 'https://accounts.google.com'
const keyId = 'subscription-test-kid-1'
let signingKey: CryptoKey
let server: Server
let baseUrl: string

async function mintIdToken(
  sub: string,
  mutateSignature = false
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const jwt = await new SignJWT({
    iss: ISSUER,
    aud: CLIENT_ID,
    iat: now,
    exp: now + 3600,
    sub,
    email_verified: true,
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyId, typ: 'JWT' })
    .sign(signingKey)
  if (!mutateSignature) return jwt
  const parts = jwt.split('.')
  const sig = parts[2] ?? ''
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
  return `${parts[0]}.${parts[1]}.${flipped}`
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

async function getStatus(headers?: Record<string, string>): Promise<{
  status: number
  body: Record<string, unknown>
}> {
  const res = await fetch(`${baseUrl}/status`, { headers })
  const body = (await res.json()) as Record<string, unknown>
  return { status: res.status, body }
}

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  signingKey = privateKey
  const jwk = await exportJWK(publicKey)
  const jwksPayload = JSON.stringify({
    keys: [{ ...jwk, kid: keyId, use: 'sig', alg: 'RS256' }],
  })
  const jwksUrl = new URL(`data:application/json,${encodeURIComponent(jwksPayload)}`)
  __setRemoteKeysForTests(createRemoteJWKSet(jwksUrl))

  const app = express()
  app.use(express.json())
  app.use('/api/subscription', createSubscriptionRouter())
  server = app.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', () => resolve()))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}/api/subscription`
})

afterAll(async () => {
  __setRemoteKeysForTests(null)
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  )
})

describe('GET /api/subscription/status', () => {
  it('anonymous caller receives effective Free without creating a row', async () => {
    const { status, body } = await getStatus()
    expect(status).toBe(200)
    expect(body).toMatchObject({
      planId: 'free',
      source: 'default',
      hasRecord: false,
    })
    expect(await getSubscriptionByOwner('nobody')).toBeNull()
  })

  it('verified caller without a row receives effective Free and still creates no row', async () => {
    const token = await mintIdToken('verified-sub-no-row')
    const { status, body } = await getStatus(authHeaders(token))
    expect(status).toBe(200)
    expect(body).toMatchObject({
      planId: 'free',
      source: 'default',
      hasRecord: false,
    })
    expect(await getSubscriptionByOwner('verified-sub-no-row')).toBeNull()
  })

  it('verified caller with a row receives the stored plan and status', async () => {
    const now = new Date().toISOString()
    await saveSubscription({
      ownerSub: 'verified-sub-pro',
      planId: 'pro',
      status: 'active',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      createdAt: now,
      updatedAt: now,
    })
    const token = await mintIdToken('verified-sub-pro')
    const { status, body } = await getStatus(authHeaders(token))
    expect(status).toBe(200)
    expect(body).toMatchObject({
      planId: 'pro',
      status: 'active',
      source: 'record',
      hasRecord: true,
    })
  })

  it('does not leak records across owners', async () => {
    const tokenB = await mintIdToken('verified-sub-other')
    const { status, body } = await getStatus(authHeaders(tokenB))
    expect(status).toBe(200)
    expect(body).toMatchObject({
      planId: 'free',
      source: 'default',
      hasRecord: false,
    })
  })

  it('fails closed on a stored unknown plan id', async () => {
    const now = new Date().toISOString()
    await saveSubscription({
      ownerSub: 'verified-sub-corrupt',
      planId: 'ultra-mega-plan',
      status: 'active',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      createdAt: now,
      updatedAt: now,
    })
    const token = await mintIdToken('verified-sub-corrupt')
    const { status, body } = await getStatus(authHeaders(token))
    expect(status).toBe(500)
    expect(body.code).toBe('SUBSCRIPTION_PLAN_UNKNOWN')
    expect(body.planId).toBeUndefined()
  })

  it('rejects a forged credential instead of degrading to anonymous', async () => {
    const forged = await mintIdToken('verified-sub-pro', true)
    const { status, body } = await getStatus(authHeaders(forged))
    expect(status).toBe(401)
    expect(body.code).toBe('AUTHENTICATION_INVALID')
    expect(body.planId).toBeUndefined()
  })
})
