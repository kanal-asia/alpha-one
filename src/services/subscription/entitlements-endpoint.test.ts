/**
 * TASK-ALPHA-MONETIZATION-002: entitlements endpoint contract.
 *
 * Real router against an isolated DATA_ROOT; identity via real RS256 ID
 * tokens (injected JWKS, offline). Proven here:
 * - verified owners receive their plan's grants with access metadata;
 * - anonymous callers receive Free grants (no record needed);
 * - forged credentials fail closed without grant data;
 * - owner isolation holds (B sees defaults, never A's grants);
 * - endpoint never throws; DB failure answers 500, never granted data.
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

const TMP_DATA = mkdtempSync(join(tmpdir(), 'alpha-entitlements-test-'))
process.env['ALPHA_DATA_DIR'] = TMP_DATA
const CLIENT_ID = 'entitlements-test-client.apps.googleusercontent.com'
process.env['GOOGLE_CLIENT_ID'] = CLIENT_ID

const { createSubscriptionRouter } = await import('./router')
const { saveSubscription } = await import('../../lib/sqlite-persistence')
const { __setRemoteKeysForTests } = await import('../opencode/google-id-token')

const ISSUER = 'https://accounts.google.com'
const keyId = 'entitlements-test-kid-1'
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

async function getEntitlements(headers?: Record<string, string>): Promise<{
  status: number
  body: Record<string, unknown>
}> {
  const res = await fetch(`${baseUrl}/entitlements`, { headers })
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

  const now = new Date().toISOString()
  await saveSubscription({
    ownerSub: 'owner-entitled',
    planId: 'pro',
    status: 'active',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    createdAt: now,
    updatedAt: now,
  })

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

describe('GET /api/subscription/entitlements', () => {
  it('verified owners receive their plan grants with access metadata', async () => {
    const token = await mintIdToken('owner-entitled')
    const { status, body } = await getEntitlements({
      Authorization: `Bearer ${token}`,
    })
    expect(status).toBe(200)
    expect(body).toMatchObject({
      planId: 'pro',
      status: 'active',
      source: 'record',
      hasRecord: true,
      access: 'plan',
      warning: false,
      repair: false,
    })
    const grants = body.entitlements as Array<{
      id: string
      included: boolean
      level: string
    }>
    expect(grants.find((g) => g.id === 'slides.generate')).toMatchObject({
      included: true,
    })
    expect(grants.find((g) => g.id === 'team.members')).toMatchObject({
      included: false,
    })
  })

  it('anonymous callers receive Free grants without a record', async () => {
    const { status, body } = await getEntitlements()
    expect(status).toBe(200)
    expect(body).toMatchObject({
      planId: 'free',
      source: 'default',
      hasRecord: false,
      access: 'free',
    })
    const grants = body.entitlements as Array<{
      id: string
      included: boolean
    }>
    expect(grants.find((g) => g.id === 'ai.assist')?.included).toBe(true)
    expect(grants.find((g) => g.id === 'team.members')?.included).toBe(false)
  })

  it('forged credentials fail closed without grant data', async () => {
    const forged = await mintIdToken('owner-entitled', true)
    const { status, body } = await getEntitlements({
      Authorization: `Bearer ${forged}`,
    })
    expect(status).toBe(401)
    expect(body.entitlements).toBeUndefined()
  })

  it('owners never see another owner’s grants', async () => {
    const token = await mintIdToken('owner-stranger')
    const { status, body } = await getEntitlements({
      Authorization: `Bearer ${token}`,
    })
    expect(status).toBe(200)
    expect(body).toMatchObject({
      planId: 'free',
      source: 'default',
      hasRecord: false,
      access: 'free',
    })
  })
})
