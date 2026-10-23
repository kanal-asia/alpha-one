/**
 * TASK-ALPHA-SUBSCRIBER-008: self-service cancellation contract.
 *
 * Real router + sqlite against an isolated DATA_ROOT; identity via real
 * RS256 ID tokens (injected JWKS, offline). Proven here:
 * - verified owner cancels an eligible row (period preserved, stamp set);
 * - repeat cancel is idempotent (original canceled_at preserved, no rewrite);
 * - user B cannot touch user A's row (B has no row → 404; A's row intact);
 * - anonymous and forged requests mutate nothing;
 * - missing/malformed period fails safely without writes;
 * - exact period-end boundary still cancels (transition needs validity only);
 * - expired rows reject with ILLEGAL_TRANSITION;
 * - no-record cancel creates no row.
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

const TMP_DATA = mkdtempSync(join(tmpdir(), 'alpha-subscription-cancel-'))
process.env['ALPHA_DATA_DIR'] = TMP_DATA
const CLIENT_ID = 'subscription-cancel-client.apps.googleusercontent.com'
process.env['GOOGLE_CLIENT_ID'] = CLIENT_ID

const { createSubscriptionRouter } = await import('./router')
const {
  getSubscriptionByOwner,
  saveSubscription,
} = await import('../../lib/sqlite-persistence')
const { __setRemoteKeysForTests } = await import('../opencode/google-id-token')

const ISSUER = 'https://accounts.google.com'
const keyId = 'subscription-cancel-kid-1'
const FUTURE_END = '2027-01-01T00:00:00.000Z'
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

async function postCancel(headers?: Record<string, string>): Promise<{
  status: number
  body: Record<string, unknown>
}> {
  const res = await fetch(`${baseUrl}/cancel`, { method: 'POST', headers })
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

async function seedActive(
  owner: string,
  overrides: { planId?: string; currentPeriodEnd?: string | null } = {}
): Promise<void> {
  const now = new Date().toISOString()
  await saveSubscription({
    ownerSub: owner,
    planId: overrides.planId ?? 'pro',
    status: 'active',
    currentPeriodEnd:
      'currentPeriodEnd' in overrides
        ? (overrides.currentPeriodEnd ?? null)
        : FUTURE_END,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    createdAt: now,
    updatedAt: now,
  })
}

describe('POST /api/subscription/cancel', () => {
  it('verified owner cancels: period preserved, flags stamped', async () => {
    await seedActive('owner-cancel-ok')
    const token = await mintIdToken('owner-cancel-ok')
    const { status, body } = await postCancel({
      Authorization: `Bearer ${token}`,
    })
    expect(status).toBe(200)
    expect(body).toMatchObject({
      planId: 'pro',
      status: 'canceled',
      source: 'record',
      hasRecord: true,
      canceled: true,
    })
    const row = await getSubscriptionByOwner('owner-cancel-ok')
    expect(row).toMatchObject({
      status: 'canceled',
      currentPeriodEnd: FUTURE_END,
      cancelAtPeriodEnd: true,
    })
    expect(typeof row?.canceledAt).toBe('string')
  })

  it('repeat cancellation is idempotent and preserves the original stamp', async () => {
    const token = await mintIdToken('owner-cancel-ok')
    const before = await getSubscriptionByOwner('owner-cancel-ok')
    const { status, body } = await postCancel({
      Authorization: `Bearer ${token}`,
    })
    expect(status).toBe(200)
    expect(body).toMatchObject({ status: 'canceled', canceled: true })
    const after = await getSubscriptionByOwner('owner-cancel-ok')
    expect(after?.canceledAt).toBe(before?.canceledAt)
    expect(after?.updatedAt).toBe(before?.updatedAt)
  })

  it('user B cannot cancel user A’s row (B sees no-record, A intact)', async () => {
    await seedActive('owner-a-protected')
    const tokenB = await mintIdToken('owner-b-stranger')
    const { status, body } = await postCancel({
      Authorization: `Bearer ${tokenB}`,
    })
    expect(status).toBe(404)
    expect(body.code).toBe('SUBSCRIPTION_NOT_FOUND')
    expect(await getSubscriptionByOwner('owner-b-stranger')).toBeNull()
    const rowA = await getSubscriptionByOwner('owner-a-protected')
    expect(rowA?.status).toBe('active')
  })

  it('anonymous requests cannot mutate records', async () => {
    await seedActive('owner-anon-guard')
    const { status, body } = await postCancel()
    expect(status).toBe(401)
    expect(body.code).toBe('AUTHENTICATION_REQUIRED')
    expect((await getSubscriptionByOwner('owner-anon-guard'))?.status).toBe(
      'active'
    )
  })

  it('forged credentials cannot mutate records', async () => {
    await seedActive('owner-forged-guard')
    const forged = await mintIdToken('owner-forged-guard', true)
    const { status, body } = await postCancel({
      Authorization: `Bearer ${forged}`,
    })
    expect(status).toBe(401)
    expect(body.code).toBe('AUTHENTICATION_INVALID')
    expect((await getSubscriptionByOwner('owner-forged-guard'))?.status).toBe(
      'active'
    )
  })

  it('missing period fails safely without writes', async () => {
    await seedActive('owner-no-period', { currentPeriodEnd: null })
    const token = await mintIdToken('owner-no-period')
    const { status, body } = await postCancel({
      Authorization: `Bearer ${token}`,
    })
    expect(status).toBe(409)
    expect(body.code).toBe('PERIOD_REQUIRED')
    expect((await getSubscriptionByOwner('owner-no-period'))?.status).toBe(
      'active'
    )
  })

  it('malformed period fails safely without writes', async () => {
    await seedActive('owner-bad-period', { currentPeriodEnd: 'someday' })
    const token = await mintIdToken('owner-bad-period')
    const { status, body } = await postCancel({
      Authorization: `Bearer ${token}`,
    })
    expect(status).toBe(409)
    expect(body.code).toBe('PERIOD_MALFORMED')
    expect((await getSubscriptionByOwner('owner-bad-period'))?.status).toBe(
      'active'
    )
  })

  it('exact period-end boundary still cancels (validity only, not access)', async () => {
    const boundary = new Date().toISOString()
    await seedActive('owner-boundary', { currentPeriodEnd: boundary })
    const token = await mintIdToken('owner-boundary')
    const { status, body } = await postCancel({
      Authorization: `Bearer ${token}`,
    })
    expect(status).toBe(200)
    expect(body).toMatchObject({ status: 'canceled', canceled: true })
  })

  it('expired rows reject with ILLEGAL_TRANSITION', async () => {
    const now = new Date().toISOString()
    await saveSubscription({
      ownerSub: 'owner-expired',
      planId: 'pro',
      status: 'expired',
      currentPeriodEnd: '2020-01-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      canceledAt: null,
      createdAt: now,
      updatedAt: now,
    })
    const token = await mintIdToken('owner-expired')
    const { status, body } = await postCancel({
      Authorization: `Bearer ${token}`,
    })
    expect(status).toBe(409)
    expect(body.code).toBe('ILLEGAL_TRANSITION')
    expect((await getSubscriptionByOwner('owner-expired'))?.status).toBe(
      'expired'
    )
  })

  it('unknown stored status fails closed without writes', async () => {
    const now = new Date().toISOString()
    await saveSubscription({
      ownerSub: 'owner-weird-status',
      planId: 'pro',
      status: 'suspended',
      currentPeriodEnd: FUTURE_END,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      createdAt: now,
      updatedAt: now,
    })
    const token = await mintIdToken('owner-weird-status')
    const { status, body } = await postCancel({
      Authorization: `Bearer ${token}`,
    })
    expect(status).toBe(500)
    expect(body.code).toBe('SUBSCRIPTION_STATUS_FAILED')
    expect(body.planId).toBeUndefined()
    expect((await getSubscriptionByOwner('owner-weird-status'))?.status).toBe(
      'suspended'
    )
  })

  it('no-record cancel creates no row', async () => {
    const token = await mintIdToken('owner-ghost')
    const { status, body } = await postCancel({
      Authorization: `Bearer ${token}`,
    })
    expect(status).toBe(404)
    expect(body.code).toBe('SUBSCRIPTION_NOT_FOUND')
    expect(await getSubscriptionByOwner('owner-ghost')).toBeNull()
  })
})
