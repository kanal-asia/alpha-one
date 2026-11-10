/**
 * TASK-ALPHA-MONETIZATION-002: canonical entitlement catalog and resolver.
 *
 * Stable capability identifiers, explicitly mapped per plan. These IDs are
 * the contract — they are NOT inferred from plan display names, benefit
 * labels, or marketing copy. Levels mirror the spec comparison matrix
 * (`Included/Limited/Basic/Standard/Advanced/Team` count as granted;
 * `Preview`, `Not included`, and `To be defined` do not).
 *
 * The backend is authoritative: this module composes the shared
 * `resolveProductAccess` decision (account enforcement + subscription
 * effective access) and only then attaches grants. Unknown plans, inactive
 * or expired states, and resolver failures all resolve to denied —
 * paid entitlements are never granted silently.
 */

import {
  resolveProductAccess,
  type ProductAccess,
} from './access'

/** Stable capability identifiers (the entitlement contract). */
export const ENTITLEMENT_IDS = [
  'ai.assist',
  'workflows.guided',
  'documents.summarize',
  'analysis.spreadsheet',
  'analysis.data-quality',
  'analysis.marketing',
  'analysis.ads',
  'analysis.operations',
  'reports.generate',
  'slides.generate',
  'workflows.reusable',
  'history.saved',
  'workspace.personal',
  'workspace.team',
  'team.members',
  'team.usage-overview',
] as const

export type EntitlementId = (typeof ENTITLEMENT_IDS)[number]

/** Matrix level that counts as granted. Everything else is denied. */
const GRANTED_LEVELS: ReadonlySet<string> = new Set([
  'Included',
  'Limited',
  'Basic',
  'Standard',
  'Advanced',
  'Team',
])

export type PlanGrantLevels = Record<EntitlementId, string>

/**
 * Explicit per-plan grant table. Each cell names the spec-matrix level so a
 * reviewer can trace every grant to the comparison matrix without guessing.
 */
const PLAN_GRANTS: Record<string, PlanGrantLevels> = {
  free: {
    'ai.assist': 'Limited',
    'workflows.guided': 'Basic',
    'documents.summarize': 'Limited',
    'analysis.spreadsheet': 'Preview',
    'analysis.data-quality': 'Basic',
    'analysis.marketing': 'Preview',
    'analysis.ads': 'Preview',
    'analysis.operations': 'Preview',
    'reports.generate': 'Limited',
    'slides.generate': 'Limited',
    'workflows.reusable': 'Limited',
    'history.saved': 'Limited',
    'workspace.personal': 'Included',
    'workspace.team': 'Not included',
    'team.members': 'Not included',
    'team.usage-overview': 'Not included',
  },
  member: {
    'ai.assist': 'Included',
    'workflows.guided': 'Standard',
    'documents.summarize': 'Included',
    'analysis.spreadsheet': 'Standard',
    'analysis.data-quality': 'Standard',
    'analysis.marketing': 'Basic',
    'analysis.ads': 'Basic',
    'analysis.operations': 'Basic',
    'reports.generate': 'Standard',
    'slides.generate': 'Standard',
    'workflows.reusable': 'Standard',
    'history.saved': 'Standard',
    'workspace.personal': 'Included',
    'workspace.team': 'Not included',
    'team.members': 'Not included',
    'team.usage-overview': 'Not included',
  },
  pro: {
    'ai.assist': 'Included',
    'workflows.guided': 'Advanced',
    'documents.summarize': 'Included',
    'analysis.spreadsheet': 'Advanced',
    'analysis.data-quality': 'Advanced',
    'analysis.marketing': 'Advanced',
    'analysis.ads': 'Advanced',
    'analysis.operations': 'Advanced',
    'reports.generate': 'Advanced',
    'slides.generate': 'Advanced',
    'workflows.reusable': 'Advanced',
    'history.saved': 'Advanced',
    'workspace.personal': 'Included',
    'workspace.team': 'Not included',
    'team.members': 'Not included',
    'team.usage-overview': 'Not included',
  },
  business: {
    'ai.assist': 'Included',
    'workflows.guided': 'Advanced',
    'documents.summarize': 'Included',
    'analysis.spreadsheet': 'Advanced',
    'analysis.data-quality': 'Advanced',
    'analysis.marketing': 'Advanced',
    'analysis.ads': 'Advanced',
    'analysis.operations': 'Advanced',
    'reports.generate': 'Advanced',
    'slides.generate': 'Advanced',
    'workflows.reusable': 'Advanced',
    'history.saved': 'Advanced',
    'workspace.personal': 'Included',
    'workspace.team': 'Team',
    'team.members': 'Included',
    'team.usage-overview': 'Included',
  },
}

export interface EntitlementGrant {
  id: EntitlementId
  included: boolean
  level: string
}

function grantsForPlan(planId: string): EntitlementGrant[] {
  const levels = PLAN_GRANTS[planId]
  return ENTITLEMENT_IDS.map((id) => {
    const level = levels?.[id] ?? 'Not included'
    return { id, included: GRANTED_LEVELS.has(level), level }
  })
}

export interface EntitlementResolution extends ProductAccess {
  entitlements: EntitlementGrant[]
}

/**
 * Resolve the full entitlement picture for a caller. Anonymous and
 * record-less callers resolve against the Free catalog. Unknown plans and
 * resolver failures resolve to denied grants (fail closed) with the repair
 * flag from the underlying access decision.
 */
export async function resolveEntitlements(
  productUserId: string | null,
  loaders?: Parameters<typeof resolveProductAccess>[1]
): Promise<EntitlementResolution> {
  const access = await resolveProductAccess(productUserId, loaders)
  if (access.repair || !(access.subscription.planId in PLAN_GRANTS)) {
    return {
      ...access,
      access: 'free',
      entitlements: grantsForPlan('__unknown__'),
      repair: true,
    }
  }
  const effectivePlanId =
    access.access === 'plan' ? access.subscription.planId : 'free'
  return { ...access, entitlements: grantsForPlan(effectivePlanId) }
}

export type EntitlementDecisionCode =
  | 'ENTITLEMENT_GRANTED'
  | 'ENTITLEMENT_NOT_INCLUDED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'ACCOUNT_DENIED'
  | 'ENTITLEMENT_RESOLVER_FAILED'

export interface EntitlementDecision {
  allowed: boolean
  entitlementId: string
  planId: string
  code: EntitlementDecisionCode
}

/**
 * Authoritative per-capability decision for protected routes to query.
 * Pure pass-through of the resolution — no side effects, no ambient auth.
 * Free-intended capabilities stay allowed for anonymous/default callers;
 * anything else fails closed with a distinct code for auth (handled
 * upstream by the guard), denial, expiry, and infrastructure failure.
 */
export async function requireEntitlement(
  productUserId: string | null,
  entitlementId: string,
  loaders?: Parameters<typeof resolveProductAccess>[1]
): Promise<EntitlementDecision> {
  let resolution: EntitlementResolution
  try {
    resolution = await resolveEntitlements(productUserId, loaders)
  } catch {
    return {
      allowed: false,
      entitlementId,
      planId: 'free',
      code: 'ENTITLEMENT_RESOLVER_FAILED',
    }
  }
  if (resolution.repair) {
    return {
      allowed: false,
      entitlementId,
      planId: resolution.subscription.planId,
      code: 'ENTITLEMENT_RESOLVER_FAILED',
    }
  }
  // Account denial dominates: a suspended/banned caller gets nothing, even
  // for Free-level capabilities. Authentication itself stays enforced
  // upstream by the guard; this keeps the decision safe standalone.
  if (!resolution.account.allowed) {
    return {
      allowed: false,
      entitlementId,
      planId: resolution.subscription.planId,
      code: 'ACCOUNT_DENIED',
    }
  }
  const grant = resolution.entitlements.find((g) => g.id === entitlementId)
  if (!grant || !grant.included) {
    return {
      allowed: false,
      entitlementId,
      planId: resolution.subscription.planId,
      code: 'ENTITLEMENT_NOT_INCLUDED',
    }
  }
  // Included grants are usable on active access and on the no-record Free
  // default. A stored-but-lapsed subscription denies distinctly so the UI
  // can offer renewal instead of a generic refusal.
  if (
    resolution.access === 'plan' ||
    !resolution.subscription.hasRecord
  ) {
    return {
      allowed: true,
      entitlementId,
      planId: resolution.subscription.planId,
      code: 'ENTITLEMENT_GRANTED',
    }
  }
  return {
    allowed: false,
    entitlementId,
    planId: resolution.subscription.planId,
    code: 'SUBSCRIPTION_EXPIRED',
  }
}
