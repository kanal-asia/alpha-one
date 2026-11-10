/**
 * TASK-ALPHA-MONETIZATION-002: canonical entitlement resolution tests.
 *
 * The backend is authoritative: grants resolve from the shared access
 * decision plus an explicit per-plan table — never from display names.
 * Covered: Free grants, paid mapping, inactive/expired/unknown denial,
 * resolver-failure closure, anonymous Free access, and requireEntitlement
 * decisions. No database; stubbed loaders.
 */
import { describe, expect, it } from 'vitest'
import {
  ENTITLEMENT_IDS,
  requireEntitlement,
  resolveEntitlements,
} from './entitlements'
import type { SubscriptionRecord } from '../../lib/sqlite-persistence'

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

const ACTIVE = { allowed: true as const, accountStatus: 'active' as const, restricted: false }

describe('entitlement catalog', () => {
  it('covers every id exactly once per plan with traceable levels', async () => {
    const resolution = await resolveEntitlements('sub-1', {
      checkAccount: async () => ACTIVE,
      loadSubscription: async () => row({ planId: 'member' }),
    })
    expect(resolution.entitlements.map((g) => g.id)).toEqual([...ENTITLEMENT_IDS])
    const byId = new Map(resolution.entitlements.map((g) => [g.id, g]))
    expect(byId.get('ai.assist')).toMatchObject({ included: true, level: 'Included' })
    expect(byId.get('analysis.spreadsheet')).toMatchObject({ included: true, level: 'Standard' })
    expect(byId.get('team.members')).toMatchObject({ included: false })
  })

  it('free catalog grants basics and denies team/advanced capabilities', async () => {
    const resolution = await resolveEntitlements(null, {
      checkAccount: async () => ACTIVE,
      loadSubscription: async () => {
        throw new Error('must not query subscriptions for anonymous')
      },
    })
    const byId = new Map(resolution.entitlements.map((g) => [g.id, g]))
    expect(byId.get('ai.assist')?.included).toBe(true)
    expect(byId.get('analysis.marketing')?.included).toBe(false)
    expect(byId.get('team.members')?.included).toBe(false)
    expect(resolution.access).toBe('free')
  })

  it('paid mapping follows the plan table, not display names', async () => {
    const business = await resolveEntitlements('sub-1', {
      checkAccount: async () => ACTIVE,
      loadSubscription: async () => row({ planId: 'business' }),
    })
    const byId = new Map(business.entitlements.map((g) => [g.id, g]))
    expect(byId.get('team.members')).toMatchObject({ included: true, level: 'Included' })
    expect(byId.get('workspace.team')).toMatchObject({ included: true, level: 'Team' })
    const pro = await resolveEntitlements('sub-1', {
      checkAccount: async () => ACTIVE,
      loadSubscription: async () => row({ planId: 'pro' }),
    })
    const proById = new Map(pro.entitlements.map((g) => [g.id, g]))
    expect(proById.get('team.members')?.included).toBe(false)
  })
})

describe('inactive, expired, and unknown states', () => {
  it('expired rows resolve denied grants with repair-free access state', async () => {
    const resolution = await resolveEntitlements('sub-1', {
      checkAccount: async () => ACTIVE,
      loadSubscription: async () => row({ status: 'expired' }),
    })
    expect(resolution.access).toBe('free')
    expect(
      resolution.entitlements.find((g) => g.id === 'slides.generate')?.included
    ).toBe(true)
  })

  it('unknown plans resolve all-denied with repair', async () => {
    const resolution = await resolveEntitlements('sub-1', {
      checkAccount: async () => ACTIVE,
      loadSubscription: async () => row({ planId: 'ultra' }),
    })
    expect(resolution.access).toBe('free')
    expect(resolution.repair).toBe(true)
    expect(resolution.entitlements.every((g) => !g.included)).toBe(true)
  })

  it('loader failure resolves closed with repair', async () => {
    const resolution = await resolveEntitlements('sub-1', {
      checkAccount: async () => ACTIVE,
      loadSubscription: async () => {
        throw new Error('db down')
      },
    })
    expect(resolution.access).toBe('free')
    expect(resolution.repair).toBe(true)
    expect(resolution.entitlements.every((g) => !g.included)).toBe(true)
  })
})

describe('requireEntitlement', () => {
  const loaders = {
    checkAccount: async () => ACTIVE,
    loadSubscription: async () => row(),
  }

  it('grants included capabilities on active plans', async () => {
    expect(
      await requireEntitlement('sub-1', 'slides.generate', loaders)
    ).toMatchObject({
      allowed: true,
      planId: 'pro',
      code: 'ENTITLEMENT_GRANTED',
    })
  })

  it('denies non-included capabilities without touching access', async () => {
    expect(
      await requireEntitlement('sub-1', 'team.members', loaders)
    ).toMatchObject({
      allowed: false,
      planId: 'pro',
      code: 'ENTITLEMENT_NOT_INCLUDED',
    })
  })

  it('denies unknown entitlement ids closed', async () => {
    expect(
      await requireEntitlement('sub-1', 'teleport.self', loaders)
    ).toMatchObject({ allowed: false, code: 'ENTITLEMENT_NOT_INCLUDED' })
  })

  it('denies expired subscriptions distinctly from missing grants', async () => {
    const expiredLoaders = {
      checkAccount: async () => ACTIVE,
      loadSubscription: async () => row({ status: 'expired' }),
    }
    expect(
      await requireEntitlement('sub-1', 'slides.generate', expiredLoaders)
    ).toMatchObject({ allowed: false, code: 'SUBSCRIPTION_EXPIRED' })
  })

  it('denies on resolver failure distinctly from denial', async () => {
    const brokenLoaders = {
      checkAccount: async () => ACTIVE,
      loadSubscription: async (): Promise<SubscriptionRecord> => {
        throw new Error('db down')
      },
    }
    expect(
      await requireEntitlement('sub-1', 'slides.generate', brokenLoaders)
    ).toMatchObject({ allowed: false, code: 'ENTITLEMENT_RESOLVER_FAILED' })
  })

  it('keeps anonymous Free capabilities allowed', async () => {
    expect(
      await requireEntitlement(null, 'ai.assist', {
        checkAccount: async () => ACTIVE,
        loadSubscription: async () => {
          throw new Error('must not query subscriptions for anonymous')
        },
      })
    ).toMatchObject({ allowed: true, code: 'ENTITLEMENT_GRANTED' })
    expect(
      await requireEntitlement(null, 'team.members', {
        checkAccount: async () => ACTIVE,
        loadSubscription: async () => null,
      })
    ).toMatchObject({ allowed: false, code: 'ENTITLEMENT_NOT_INCLUDED' })
  })

  it('denied accounts stay denied regardless of grants', async () => {
    const deniedLoaders = {
      checkAccount: async () =>
        ({
          allowed: false,
          accountStatus: 'banned',
          code: 'ACCOUNT_BANNED',
          reviewDueAt: null,
          appealBy: null,
        }) as const,
      loadSubscription: async () => row(),
    }
    const decision = await requireEntitlement(
      'sub-1',
      'slides.generate',
      deniedLoaders
    )
    expect(decision).toMatchObject({
      allowed: false,
      code: 'ACCOUNT_DENIED',
    })
  })
})

describe('catalog completeness', () => {
  it('every entitlement id is a non-empty stable string', () => {
    for (const id of ENTITLEMENT_IDS as readonly string[]) {
      expect(id).toMatch(/^[a-z]+\.[a-z-]+$/)
    }
  })

  it('every plan id in the static catalog has a grant row', async () => {
    const { SUBSCRIPTION_PLANS } = await import(
      '../../lib/subscription-plans'
    )
    for (const plan of SUBSCRIPTION_PLANS) {
      const resolution = await resolveEntitlements('sub-1', {
        checkAccount: async () => ACTIVE,
        loadSubscription: async () => row({ planId: plan.id }),
      })
      expect(resolution.entitlements).toHaveLength(ENTITLEMENT_IDS.length)
      expect(resolution.repair).toBe(false)
    }
  })
})
