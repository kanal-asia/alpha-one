/**
 * TASK-ALPHA-SUBSCRIBER-014: subscriber fetch identity carriage.
 *
 * The account experience can only show a verified user's own record when its
 * fetches carry the product session. Pins, for both subscriber read paths:
 * - logged-in (token set) → `Authorization: Bearer` sent;
 * - logged-out (token cleared) → header absent (anonymous effective default).
 * Fetch is stubbed; no network, no database.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSubscriptionStatus } from '@/lib/subscription-status'
import { fetchUsage } from '@/hooks/use-subscription-usage'
import { setProductSessionToken } from '@/features/ai/opencode/services/http-transport'

function stubFetchJson(payload: unknown, ok = true): {
  seenHeaders: () => Record<string, string>
} {
  let seen: Record<string, string> = {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      seen = { ...((init?.headers as Record<string, string>) ?? {}) }
      return {
        ok,
        status: ok ? 200 : 401,
        json: async () => payload,
      }
    })
  )
  return { seenHeaders: () => seen }
}

afterEach(() => {
  setProductSessionToken(null)
  vi.unstubAllGlobals()
})

describe('subscriber fetch identity carriage', () => {
  it('status fetch sends the verified session when logged in', async () => {
    setProductSessionToken('verified-id-token')
    const { seenHeaders } = stubFetchJson({
      planId: 'pro',
      status: 'active',
      source: 'record',
      hasRecord: true,
    })
    const { status, error } = await fetchSubscriptionStatus()
    expect(error).toBeNull()
    expect(status?.planId).toBe('pro')
    expect(seenHeaders()['Authorization']).toBe('Bearer verified-id-token')
  })

  it('status fetch sends no identity when logged out', async () => {
    const { seenHeaders } = stubFetchJson({
      planId: 'free',
      source: 'default',
      hasRecord: false,
    })
    const { status, error } = await fetchSubscriptionStatus()
    expect(error).toBeNull()
    expect(status?.planId).toBe('free')
    expect(seenHeaders()['Authorization']).toBeUndefined()
  })

  it('usage fetch sends the verified session when logged in', async () => {
    setProductSessionToken('verified-id-token')
    const { seenHeaders } = stubFetchJson({ runs: [], total: 0 })
    const { data, error } = await fetchUsage()
    expect(error).toBeNull()
    expect(data?.total).toBe(0)
    expect(seenHeaders()['Authorization']).toBe('Bearer verified-id-token')
  })

  it('usage fetch sends no identity when logged out', async () => {
    const { seenHeaders } = stubFetchJson({ runs: [], total: 0 })
    const { data, error } = await fetchUsage()
    expect(error).toBeNull()
    expect(data?.total).toBe(0)
    expect(seenHeaders()['Authorization']).toBeUndefined()
  })
})
