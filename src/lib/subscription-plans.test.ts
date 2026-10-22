/**
 * TASK-ALPHA-SUBSCRIBER-002: static plan catalog contract.
 *
 * Guards the honesty rules: four plans in spec order, Free settled at Rp0,
 * every paid price flagged candidate, no checkout/transaction targets, and
 * positioning text present. Pure module — runs in the node test project.
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLAN_ID,
  SUBSCRIPTION_PLANS,
  getPlan,
  isCandidatePrice,
  planPriceIdr,
} from './subscription-plans'

describe('subscription plan catalog', () => {
  it('exposes exactly the four spec plans in order', () => {
    expect(SUBSCRIPTION_PLANS.map((p) => p.id)).toEqual([
      'free',
      'member',
      'pro',
      'business',
    ])
  })

  it('keeps Free settled at Rp0 and flags every paid price as candidate', () => {
    const free = getPlan('free')
    expect(planPriceIdr(free)).toBe(0)
    expect(isCandidatePrice(free.monthlyPriceIdr)).toBe(false)
    for (const id of ['member', 'pro', 'business'] as const) {
      const plan = getPlan(id)
      expect(planPriceIdr(plan)).toBeGreaterThan(0)
      expect(isCandidatePrice(plan.monthlyPriceIdr)).toBe(true)
    }
  })

  it('carries positioning and benefits for every plan', () => {
    for (const plan of SUBSCRIPTION_PLANS) {
      expect(plan.name.trim().length).toBeGreaterThan(0)
      expect(plan.positioning.trim().length).toBeGreaterThan(0)
      expect(plan.benefits.length).toBeGreaterThan(0)
    }
  })

  it('exposes no checkout or transaction targets', () => {
    const serialized = JSON.stringify(SUBSCRIPTION_PLANS)
    expect(serialized).not.toMatch(/https?:\/\//)
    expect(serialized).not.toMatch(/checkout|payment_url|invoice_url|transaction/i)
  })

  it('defaults local use to the Free plan', () => {
    expect(DEFAULT_PLAN_ID).toBe('free')
    expect(getPlan(DEFAULT_PLAN_ID).name).toBe('Free')
  })

  it('rejects unknown plan ids', () => {
    expect(() =>
      getPlan('enterprise' as unknown as 'free')
    ).toThrow('Unknown plan')
  })
})
