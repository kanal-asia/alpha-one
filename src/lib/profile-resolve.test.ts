import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * TASK-ALPHA-VPS-078R2: Canonical Google Profile Read Endpoint tests.
 *
 * Uses an isolated temp data root (ALPHA_DATA_DIR). Seeds a canonical
 * profile, then proves exact-match, mismatch, and malformed-request semantics.
 */

const DATA_DIR = mkdtempSync(join(tmpdir(), 'alpha-profile-resolve-db-'))
process.env.ALPHA_DATA_DIR = DATA_DIR

const { upsertCanonicalProfile, getCanonicalProfile } = await import(
  '@/lib/sqlite-persistence'
)

const PROVIDER_USER_ID = 'sub-profile-resolve-1'
const EMAIL = 'test.profile@example.com'
const DISPLAY_NAME = 'Test Profile'
const AVATAR_URL = 'https://example.com/avatar.jpg'

describe('getCanonicalProfile (helper)', () => {
  beforeAll(async () => {
    await upsertCanonicalProfile({
      providerUserId: PROVIDER_USER_ID,
      provider: 'google',
      email: EMAIL,
      displayName: DISPLAY_NAME,
      avatarUrl: AVATAR_URL,
      observedAt: '2026-09-07T10:00:00.000Z',
    })
  })

  it('returns profile for known providerUserId', async () => {
    const profile = await getCanonicalProfile(PROVIDER_USER_ID)
    expect(profile).not.toBeNull()
    expect(profile!.providerUserId).toBe(PROVIDER_USER_ID)
    expect(profile!.email).toBe(EMAIL)
    expect(profile!.displayName).toBe(DISPLAY_NAME)
    expect(profile!.avatarUrl).toBe(AVATAR_URL)
  })

  it('returns null for unknown providerUserId', async () => {
    const profile = await getCanonicalProfile('unknown-sub')
    expect(profile).toBeNull()
  })
})

describe('POST /google/profile/resolve endpoint', () => {
  let proc: ChildProcess | null = null
  let port = 0

  beforeAll(async () => {
    port = await new Promise<number>((resolve, reject) => {
      const s = createServer()
      s.once('error', reject)
      s.listen(0, '127.0.0.1', () => {
        const p = (s.address() as { port: number }).port
        s.close(() => resolve(p))
      })
    })
    proc = spawn(
      process.execPath,
      [join(process.cwd(), 'dist/server/alpha-infra-server.js')],
      {
        env: {
          ...process.env,
          PORT: String(port),
          GOOGLE_CLIENT_ID: 'test-client',
          GOOGLE_CLIENT_SECRET: 'test-secret',
          GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3000/cb',
          ALPHA_DATA_DIR: DATA_DIR,
          NODE_PATH: join(process.cwd(), 'node_modules'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }
    )
    const deadline = Date.now() + 30000
    for (;;) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(2000),
        })
        if (res.ok) break
      } catch {
        /* booting */
      }
      if (Date.now() > deadline) throw new Error('infra server did not boot')
      await new Promise((r) => setTimeout(r, 500))
    }
  }, 60000)

  afterAll(async () => {
    proc?.kill()
  })

  async function resolveProfile(body: unknown): Promise<{ status: number; json: unknown }> {
    const res = await fetch(`http://127.0.0.1:${port}/google/profile/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, json: await res.json().catch(() => ({})) }
  }

  it('returns profile for exact providerUserId + email match', async () => {
    const out = await resolveProfile({
      providerUserId: PROVIDER_USER_ID,
      email: EMAIL,
    })
    expect(out.status).toBe(200)
    const j = out.json as Record<string, unknown>
    expect(j.providerUserId).toBe(PROVIDER_USER_ID)
    expect(j.email).toBe(EMAIL)
    expect(j.displayName).toBe(DISPLAY_NAME)
    expect(j.avatarUrl).toBe(AVATAR_URL)
  })

  it('normalizes email case', async () => {
    const out = await resolveProfile({
      providerUserId: PROVIDER_USER_ID,
      email: 'TEST.PROFILE@EXAMPLE.COM',
    })
    expect(out.status).toBe(200)
    const j = out.json as Record<string, unknown>
    expect(j.email).toBe(EMAIL)
  })

  it('returns 404 for correct providerUserId + wrong email', async () => {
    const out = await resolveProfile({
      providerUserId: PROVIDER_USER_ID,
      email: 'wrong.email@example.com',
    })
    expect(out.status).toBe(404)
  })

  it('returns 404 for wrong providerUserId + correct email', async () => {
    const out = await resolveProfile({
      providerUserId: 'wrong-sub',
      email: EMAIL,
    })
    expect(out.status).toBe(404)
  })

  it('returns 404 for unknown identity', async () => {
    const out = await resolveProfile({
      providerUserId: 'ghost-sub',
      email: 'ghost@example.com',
    })
    expect(out.status).toBe(404)
  })

  it('returns 400 for missing providerUserId', async () => {
    const out = await resolveProfile({ email: EMAIL })
    expect(out.status).toBe(400)
  })

  it('returns 400 for missing email', async () => {
    const out = await resolveProfile({ providerUserId: PROVIDER_USER_ID })
    expect(out.status).toBe(400)
  })

  it('returns 400 for empty providerUserId', async () => {
    const out = await resolveProfile({ providerUserId: '', email: EMAIL })
    expect(out.status).toBe(400)
  })

  it('returns 400 for empty email', async () => {
    const out = await resolveProfile({ providerUserId: PROVIDER_USER_ID, email: '' })
    expect(out.status).toBe(400)
  })

  it('returns 400 for non-string providerUserId', async () => {
    const out = await resolveProfile({ providerUserId: 123, email: EMAIL })
    expect(out.status).toBe(400)
  })

  it('returns 400 for non-string email', async () => {
    const out = await resolveProfile({ providerUserId: PROVIDER_USER_ID, email: 123 })
    expect(out.status).toBe(400)
  })

  it('returns 400 for empty body', async () => {
    const out = await resolveProfile({})
    expect(out.status).toBe(400)
  })

  it('response excludes token/credential fields', async () => {
    const out = await resolveProfile({
      providerUserId: PROVIDER_USER_ID,
      email: EMAIL,
    })
    expect(out.status).toBe(200)
    const j = out.json as Record<string, unknown>
    expect(j).not.toHaveProperty('accessToken')
    expect(j).not.toHaveProperty('refreshToken')
    expect(j).not.toHaveProperty('tokenExpiry')
    expect(j).not.toHaveProperty('scopes')
    expect(j).not.toHaveProperty('provider')
  })
})
