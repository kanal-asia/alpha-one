/**
 * TASK-ALPHA-SUBSCRIBER-003: subscription status endpoint, unavailable store.
 *
 * ALPHA_DATA_DIR points at a regular FILE, so the sqlite store cannot open
 * and every read fails. The endpoint must answer 500 with a machine code —
 * never a fabricated plan success.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
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

const TMP_DATA = mkdtempSync(join(tmpdir(), 'alpha-subscription-db-fail-'))
const NOT_A_DIR = join(TMP_DATA, 'not-a-directory')
writeFileSync(NOT_A_DIR, 'this is a file, not a data directory')
process.env['ALPHA_DATA_DIR'] = NOT_A_DIR
const CLIENT_ID = 'subscription-db-fail-client.apps.googleusercontent.com'
process.env['GOOGLE_CLIENT_ID'] = CLIENT_ID

const { createSubscriptionRouter } = await import('./router')
const { __setRemoteKeysForTests } = await import('../opencode/google-id-token')

const ISSUER = 'https://accounts.google.com'
const keyId = 'subscription-db-fail-kid-1'
let signingKey: CryptoKey

async function mintIdToken(sub: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({
    iss: ISSUER,
    aud: CLIENT_ID,
    iat: now,
    exp: now + 3600,
    sub,
    email_verified: true,
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyId, typ: 'JWT' })
    .sign(signingKey)
}

let server: Server
let baseUrl: string

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

describe('GET /api/subscription/status with unavailable database', () => {
  it('verified caller receives 500 with a machine code, never plan data', async () => {
    const token = await mintIdToken('verified-sub-db-down')
    const res = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = (await res.json()) as Record<string, unknown>
    expect(res.status).toBe(500)
    expect(body.code).toBe('SUBSCRIPTION_STATUS_FAILED')
    expect(body.planId).toBeUndefined()
    expect(body.hasRecord).toBeUndefined()
  })

  it('anonymous caller still receives effective Free (no store read needed)', async () => {
    // The anonymous default must not depend on the database at all.
    const res = await fetch(`${baseUrl}/status`)
    const body = (await res.json()) as Record<string, unknown>
    expect(res.status).toBe(200)
    expect(body).toMatchObject({
      planId: 'free',
      source: 'default',
      hasRecord: false,
    })
  })
})
