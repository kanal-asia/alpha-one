/**
 * TASK-ALPHA-SUBSCRIBER-008: warning-only Slides entitlement observation.
 *
 * Boundary (traced, not assumed): Slides generation runs inside the opencode
 * CLI subprocess via the local MCP tools `slides_compose_deck` /
 * `slides_compose_slide`. There is no HTTP generation endpoint, and the MCP
 * server process itself carries no product identity — so the only proven
 * server-side observation point with a reliable owner is the chat/stream
 * handler's `tool_use` interception, which sees the CLI's structured compose
 * events together with the request's verified auth context.
 *
 * Contract:
 * - warning-only: generation is ALWAYS allowed; this module can only log.
 * - provisional rule evaluated with the shared effective-access helper
 *   (past_due keeps access; canceled keeps access until period end; unknown
 *   plans warn). No invented prices, quotas, or limits.
 * - fire-and-forget: the caller never awaits; observation failures
 *   (including database errors) are swallowed and can never break or slow
 *   generation.
 * - owner is the verified sub or the literal 'anonymous' (never email, never
 *   client input).
 */
import type { ProductAuthContext } from '../opencode/auth-context'
import { getSubscriptionByOwner } from '../../lib/sqlite-persistence'
import { SUBSCRIPTION_PLANS } from '../../lib/subscription-plans'
import { effectiveAccess } from './transitions'

/** Local MCP compose tools that constitute Slides generation. */
export const SLIDES_COMPOSE_TOOLS: ReadonlySet<string> = new Set([
  'slides_compose_deck',
  'slides_compose_slide',
])

export interface SlidesObservation {
  feature: 'slides.generate'
  tool: string
  owner: string
  planId: string
  status: string | null
  decision: 'allow'
  warning: boolean
  reason:
    | 'MEETS_PROVISIONAL_RULE'
    | 'ANONYMOUS'
    | 'BELOW_FUTURE_THRESHOLD'
    | 'PLAN_UNKNOWN'
}

export interface SlidesEntitlementSnapshot {
  planId: string
  status: string | null
  currentPeriodEnd: string | null
  hasRecord: boolean
}

/**
 * Pure observation decision. Returns null when the tool is not a Slides
 * compose tool (no observation). Never denies: decision is always 'allow'.
 */
export function buildSlidesObservation(input: {
  tool: string
  owner: string
  snapshot: SlidesEntitlementSnapshot | null
  now?: string
}): SlidesObservation | null {
  const { tool, owner, snapshot, now = new Date().toISOString() } = input
  if (!SLIDES_COMPOSE_TOOLS.has(tool)) return null
  if (!snapshot) {
    // No record loaded: anonymous callers and verified users without a row
    // share the effective-Free position; the reason names which one.
    const anonymous = owner === 'anonymous'
    return {
      feature: 'slides.generate',
      tool,
      owner,
      planId: 'free',
      status: null,
      decision: 'allow',
      warning: true,
      reason: anonymous ? 'ANONYMOUS' : 'BELOW_FUTURE_THRESHOLD',
    }
  }
  if (!SUBSCRIPTION_PLANS.some((plan) => plan.id === snapshot.planId)) {
    return {
      feature: 'slides.generate',
      tool,
      owner,
      planId: snapshot.planId,
      status: snapshot.status,
      decision: 'allow',
      warning: true,
      reason: 'PLAN_UNKNOWN',
    }
  }
  const access = effectiveAccess(
    {
      // A snapshot without a record carries no lifecycle status; evaluate it
      // as expired-equivalent so Free-without-record always warns. Stored
      // rows always carry a status.
      status: snapshot.status ?? (snapshot.hasRecord ? 'active' : 'expired'),
      currentPeriodEnd: snapshot.currentPeriodEnd,
    },
    now
  )
  if (access.access === 'plan') {
    return {
      feature: 'slides.generate',
      tool,
      owner,
      planId: snapshot.planId,
      status: snapshot.status,
      decision: 'allow',
      warning: false,
      reason: 'MEETS_PROVISIONAL_RULE',
    }
  }
  return {
    feature: 'slides.generate',
    tool,
    owner,
    planId: snapshot.planId,
    status: snapshot.status,
    decision: 'allow',
    warning: true,
    reason: 'BELOW_FUTURE_THRESHOLD',
  }
}

export interface ObserveDeps {
  loadSnapshot: (
    ownerSub: string | null
  ) => Promise<SlidesEntitlementSnapshot | null>
  emit: (observation: SlidesObservation) => void
}

async function defaultLoadSnapshot(
  ownerSub: string | null
): Promise<SlidesEntitlementSnapshot | null> {
  if (!ownerSub) return null
  const record = await getSubscriptionByOwner(ownerSub)
  if (!record) return null
  return {
    planId: record.planId,
    status: record.status,
    currentPeriodEnd: record.currentPeriodEnd,
    hasRecord: true,
  }
}

function defaultEmit(observation: SlidesObservation): void {
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.log('[entitlement.observation]', JSON.stringify(observation))
  }
}

/**
 * Observe one MCP tool event. Synchronous no-op for non-compose tools;
 * otherwise resolves the snapshot and emits in the background. Never throws,
 * never rejects, never blocks the caller.
 */
export function observeSlidesComposeUsage(
  tool: string | undefined,
  auth: ProductAuthContext,
  deps: ObserveDeps = {
    loadSnapshot: defaultLoadSnapshot,
    emit: defaultEmit,
  }
): void {
  if (typeof tool !== 'string' || !SLIDES_COMPOSE_TOOLS.has(tool)) return
  const verifiedSub =
    auth.verified && auth.productUserId ? auth.productUserId : null
  const owner = verifiedSub ?? 'anonymous'
  void (async () => {
    try {
      const snapshot = await deps.loadSnapshot(verifiedSub)
      const observation = buildSlidesObservation({ tool, owner, snapshot })
      if (observation) deps.emit(observation)
    } catch {
      // Observation must never break or slow generation.
    }
  })()
}
