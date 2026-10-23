/**
 * TASK-ALPHA-SUBSCRIBER-012: read-only usage endpoint contract.
 *
 * Real router against an isolated DATA_ROOT; identity via real RS256 ID
 * tokens (injected JWKS, offline). Proven here:
 * - verified callers read only their own rows (owner isolation);
 * - anonymous callers read rows recorded under 'anonymous';
 * - forged credentials fail closed without data;
 * - ?limit= clamps to 1..200; garbage falls back to the default;
 * - total counts all owned rows, not just the returned page;
 * - rows expose presentation fields only (no prompts/secrets exist to leak).
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

const TMP_DATA = mkdtempSync(join(tmpdir(), 'alpha-usage-endpoint-'))
process.env['ALPHA_DATA_DIR'] = TMP_DATA
const CLIENT_ID = 'usage-endpoint-client.apps.googleusercontent.com'
process.env['GOOGLE_CLIENT_ID'] = CLIENT_ID

const { createSubscriptionRouter } = await import('./router')
const { recordUsageRun } = await import('../../lib/sqlite-persistence')
const { __setRemoteKeysForTests } = await import('../opencode/google-id-token')

const ISSUER = 'https://accounts.google.com'
const keyId = 'usage-endpoint-kid-1'
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

async function getUsage(
  query: string,
  headers?: Record<string, string>
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}/usage${query}`, { headers })
  const body = (await res.json()) as Record<string, unknown>
  return { status: res.status, body }
}

function seedRun(owner: string, index: number): void {
  const id = recordUsageRun({
    runId: `run-${owner}-${index}`,
    ownerSub: owner,
    model: 'opencode/beam-free',
    tokenCount: index,
  })
  expect(id).not.toBeNull()
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

  for (let i = 1; i <= 3; i++) seedRun('owner-seen', i)
  seedRun('owner-hidden', 1)
  seedRun('anonymous', 1)

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

describe('GET /api/subscription/usage', () => {
  it('verified callers read only their own rows with presentation fields', async () => {
    const token = await mintIdToken('owner-seen')
    const { status, body } = await getUsage('', {
      Authorization: `Bearer ${token}`,
    })
    expect(status).toBe(200)
    expect(body.total).toBe(3)
    const runs = body.runs as Array<Record<string, unknown>>
    expect(runs).toHaveLength(3)
    expect(runs.map((r) => r.runId).sort()).toEqual([
      'run-owner-seen-1',
      'run-owner-seen-2',
      'run-owner-seen-3',
    ])
    for (const run of runs) {
      expect(Object.keys(run).sort()).toEqual(
        [
          'agent',
          'continuationCount',
          'createdAt',
          'durationMs',
          'exitCode',
          'model',
          'runId',
          'sessionId',
          'terminal',
          'textLen',
          'tokenCount',
        ].sort()
      )
    }
  })

  it('anonymous callers read only anonymous rows', async () => {
    const { status, body } = await getUsage('')
    expect(status).toBe(200)
    expect(body.total).toBe(1)
    const runs = body.runs as Array<Record<string, unknown>>
    expect(runs.map((r) => r.runId)).toEqual(['run-anonymous-1'])
  })

  it('forged credentials fail closed without data', async () => {
    const forged = await mintIdToken('owner-seen', true)
    const { status, body } = await getUsage('', {
      Authorization: `Bearer ${forged}`,
    })
    expect(status).toBe(401)
    expect(body.runs).toBeUndefined()
    expect(body.total).toBeUndefined()
  })

  it('limit clamps to the valid range and total stays complete', async () => {
    const token = await mintIdToken('owner-seen')
    const headers = { Authorization: `Bearer ${token}` }
    const clamped = await getUsage('?limit=2', headers)
    expect(clamped.status).toBe(200)
    expect((clamped.body.runs as unknown[]).length).toBe(2)
    expect(clamped.body.total).toBe(3)
    const floored = await getUsage('?limit=0', headers)
    expect((floored.body.runs as unknown[]).length).toBe(1)
    const garbage = await getUsage('?limit=bogus', headers)
    expect(garbage.status).toBe(200)
    expect((garbage.body.runs as unknown[]).length).toBe(3)
  })

  it('owners without rows get an honest empty payload', async () => {
    const token = await mintIdToken('owner-fresh')
    const { status, body } = await getUsage('', {
      Authorization: `Bearer ${token}`,
    })
    expect(status).toBe(200)
    expect(body).toEqual({ runs: [], total: 0 })
  })
})
