import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyAndPersistProductionOAuth } from './production-oauth-client'

/**
 * MSI-069: OAuth completion contract proof. Approval/redirect alone is never
 * success — persistence non-2xx and unverified status must both throw, so the
 * UI can never report Connected from a failed local persist.
 */
describe('verifyAndPersistProductionOAuth', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mockFetch(
    impl: (url: string, init?: RequestInit) => unknown
  ): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => impl(url, init))
    )
  }

  const identity = {
    provider: 'google',
    providerUserId: 'u1',
    email: 'user@example.com',
    displayName: 'User',
    avatarUrl: null,
    createdAt: '2026-09-04T00:00:00.000Z',
    updatedAt: '2026-09-04T00:00:00.000Z',
  }
  const tokens = { accessToken: 'a', refreshToken: 'r', expiresAt: 123 }

  const ok = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })

  it('throws when local persistence is non-2xx', async () => {
    mockFetch((url) => {
      if (String(url).includes('/verify')) return ok({ identity, tokens })
      return ok({ error: 'db locked' }, 500)
    })
    await expect(verifyAndPersistProductionOAuth('s1')).rejects.toThrow(
      /persistence failed/i
    )
  })

  it('throws when local status does not confirm connected', async () => {
    mockFetch((url) => {
      if (String(url).includes('/verify')) return ok({ identity, tokens })
      if (String(url).includes('/persist-production')) return ok({})
      return ok({ connected: false })
    })
    await expect(verifyAndPersistProductionOAuth('s1')).rejects.toThrow(
      /not verified/i
    )
  })

  it('returns identity only after persist + verified status', async () => {
    const calls: string[] = []
    mockFetch((url) => {
      calls.push(String(url))
      if (String(url).includes('/verify')) return ok({ identity, tokens })
      if (String(url).includes('/persist-production')) return ok({})
      return ok({ connected: true })
    })
    const result = await verifyAndPersistProductionOAuth('s1')
    expect(result.identity.email).toBe('user@example.com')
    expect(calls.some((c) => c.includes('/persist-production'))).toBe(true)
    expect(calls.some((c) => c.includes('/oauth/status'))).toBe(true)
  })
})
