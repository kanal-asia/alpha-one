/**
 * TASK-ALPHA-SUBSCRIBER-010: unified product-access decision tests.
 *
 * Pure composition over stubbed loaders (no database): account denial
 * dominates without rewriting subscription state; unknown plans never yield
 * paid access; lifecycle rules flow through unchanged.
 */
import { describe, expect, it } from 'vitest'
import { resolveProductAccess } from './access'
import type { AccountAccessDecision } from '../account/enforcement'
import type { SubscriptionRecord } from '../../lib/sqlite-persistence'

const ALLOW_ACTIVE: AccountAccessDecision = {
  allowed: true,
  accountStatus: 'active',
  restricted: false,
}
const DENY_BANNED: AccountAccessDecision = {
  allowed: false,
  accountStatus: 'banned',
  code: 'ACCOUNT_BANNED',
  reviewDueAt: null,
  appealBy: '2026-12-15T00:00:00.000Z',
}

function row(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  const now = new Date().toISOString()
  return {
    ownerSub: 'sub-1',
    planId: 'pro',
    status: 'active',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('resolveProductAccess', () => {
  it('anonymous callers get effective Free with an active account', async () => {
    const access = await resolveProductAccess(null, {
      checkAccount: async () => ALLOW_ACTIVE,
      loadSubscription: async () => {
        throw new Error('must not query subscriptions for anonymous')
      },
    })
    expect(access).toMatchObject({
      access: 'free',
      warning: false,
      repair: false,
    })
    expect(access.subscription).toMatchObject({
      planId: 'free',
      source: 'default',
      hasRecord: false,
    })
  })

  it('verified users without rows get effective Free', async () => {
    const access = await resolveProductAccess('sub-1', {
      checkAccount: async () => ALLOW_ACTIVE,
      loadSubscription: async () => null,
    })
    expect(access.access).toBe('free')
    expect(access.subscription.hasRecord).toBe(false)
  })

  it('active pro rows yield plan access', async () => {
    const access = await resolveProductAccess('sub-1', {
      checkAccount: async () => ALLOW_ACTIVE,
      loadSubscription: async () => row(),
    })
    expect(access).toMatchObject({ access: 'plan', warning: false })
    expect(access.subscription).toMatchObject({
      planId: 'pro',
      status: 'active',
      source: 'record',
      hasRecord: true,
    })
  })

  it('past_due rows yield plan access with warning', async () => {
    const access = await resolveProductAccess('sub-1', {
      checkAccount: async () => ALLOW_ACTIVE,
      loadSubscription: async () => row({ status: 'past_due' }),
    })
    expect(access).toMatchObject({ access: 'plan', warning: true })
  })

  it('canceled rows keep access until a valid period end', async () => {
    const withPeriod = await resolveProductAccess('sub-1', {
      checkAccount: async () => ALLOW_ACTIVE,
      loadSubscription: async () =>
        row({
          status: 'canceled',
          currentPeriodEnd: '2027-01-01T00:00:00.000Z',
          cancelAtPeriodEnd: true,
        }),
    })
    expect(withPeriod.access).toBe('plan')
    const withoutPeriod = await resolveProductAccess('sub-1', {
      checkAccount: async () => ALLOW_ACTIVE,
      loadSubscription: async () =>
        row({ status: 'canceled', currentPeriodEnd: null }),
    })
    expect(withoutPeriod).toMatchObject({ access: 'free', repair: true })
  })

  it('unknown stored plans never yield paid access', async () => {
    const access = await resolveProductAccess('sub-1', {
      checkAccount: async () => ALLOW_ACTIVE,
      loadSubscription: async () => row({ planId: 'ultra' }),
    })
    expect(access).toMatchObject({ access: 'free', repair: true })
    expect(access.subscription.planId).toBe('ultra')
  })

  it('account denial dominates without touching subscription state', async () => {
    const access = await resolveProductAccess('sub-1', {
      checkAccount: async () => DENY_BANNED,
      loadSubscription: async () => row(),
    })
    expect(access.access).toBe('free')
    expect(access.account).toEqual(DENY_BANNED)
    expect(access.subscription).toMatchObject({
      planId: 'free',
      source: 'default',
      hasRecord: false,
    })
  })

  it('subscription loader failure fails safe with repair signal', async () => {
    const access = await resolveProductAccess('sub-1', {
      checkAccount: async () => ALLOW_ACTIVE,
      loadSubscription: async () => {
        throw new Error('db down')
      },
    })
    expect(access).toMatchObject({ access: 'free', repair: true })
  })
})
