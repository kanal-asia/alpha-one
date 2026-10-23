/**
 * TASK-ALPHA-SUBSCRIBER-010: unified product-access decision.
 *
 * Single source for "what may this caller use": it composes the independent
 * account-enforcement decision with the subscription effective-access rule.
 * The layers stay separate models — account denial dominates the combined
 * signal but never rewrites subscription state, and subscription state never
 * influences account standing.
 *
 * Rules (all from approved contracts, no invented limits):
 * - account denied (suspended/banned/invalid/failed) → access 'free'.
 * - no subscription row → effective Free default.
 * - unknown stored plan → 'free' + repair (never paid access by accident).
 * - otherwise the shared effectiveAccess() rule (active/past_due →
 *   plan incl. grace; canceled keeps plan until period end; expired → free).
 */
import {
  checkAccountAccess,
  type AccountAccessDecision,
} from '../account/enforcement'
import {
  getSubscriptionByOwner,
  type SubscriptionRecord,
} from '../../lib/sqlite-persistence'
import { SUBSCRIPTION_PLANS } from '../../lib/subscription-plans'
import { effectiveAccess } from './transitions'
import type { SubscriptionStatus } from './router'

export interface ProductAccess {
  account: AccountAccessDecision
  subscription: SubscriptionStatus
  access: 'plan' | 'free'
  warning: boolean
  repair: boolean
}

export type SubscriptionLoader = (
  ownerSub: string
) => Promise<SubscriptionRecord | null>

function defaultSubscription(
  record: SubscriptionRecord | null
): SubscriptionStatus {
  if (!record) {
    return { planId: 'free', source: 'default', hasRecord: false }
  }
  return {
    planId: record.planId,
    status: record.status,
    source: 'record',
    hasRecord: true,
  }
}

export async function resolveProductAccess(
  productUserId: string | null,
  loaders: {
    checkAccount?: typeof checkAccountAccess
    loadSubscription?: SubscriptionLoader
  } = {}
): Promise<ProductAccess> {
  const checkAccount = loaders.checkAccount ?? checkAccountAccess
  const loadSubscription = loaders.loadSubscription ?? getSubscriptionByOwner

  const account = await checkAccount(productUserId)
  if (!account.allowed) {
    return {
      account,
      subscription: { planId: 'free', source: 'default', hasRecord: false },
      access: 'free',
      warning: false,
      repair: false,
    }
  }

  if (!productUserId) {
    return {
      account,
      subscription: { planId: 'free', source: 'default', hasRecord: false },
      access: 'free',
      warning: false,
      repair: false,
    }
  }

  let record: SubscriptionRecord | null = null
  try {
    record = await loadSubscription(productUserId)
  } catch {
    return {
      account,
      subscription: { planId: 'free', source: 'default', hasRecord: false },
      access: 'free',
      warning: false,
      repair: true,
    }
  }

  const subscription = defaultSubscription(record)
  if (!record) {
    return { account, subscription, access: 'free', warning: false, repair: false }
  }
  if (!SUBSCRIPTION_PLANS.some((plan) => plan.id === record.planId)) {
    return { account, subscription, access: 'free', warning: false, repair: true }
  }
  const effective = effectiveAccess(
    { status: record.status, currentPeriodEnd: record.currentPeriodEnd },
    new Date().toISOString()
  )
  return {
    account,
    subscription,
    access: effective.access,
    warning: effective.warning,
    repair: effective.repair,
  }
}
