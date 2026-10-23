/**
 * TASK-ALPHA-SUBSCRIBER-007: pure subscription lifecycle transition validator.
 *
 * Implements the founder-approved lifecycle contract (see
 * spint/TASK-ALPHA-SUBSCRIBER-006.md): states, legal transitions, period
 * requirements, and the canceled-period fail-safe. Pure function — no wall
 * clock (`now` is injected), no persistence, no side effects.
 *
 * Owner authorization is a separate caller responsibility: future mutation
 * endpoints must bind the transition to the verified product identity, as
 * GET /api/subscription/status does for reads. This module never sees owners.
 */

export type LifecycleState = 'active' | 'past_due' | 'canceled' | 'expired'

/** Transition source: a stored state, or 'none' when no subscription row exists. */
export type LifecycleFrom = LifecycleState | 'none'

export type TransitionErrorCode =
  | 'UNKNOWN_STATE'
  | 'ILLEGAL_TRANSITION'
  | 'PERIOD_REQUIRED'
  | 'PERIOD_MALFORMED'

export interface TransitionPeriodView {
  currentPeriodEnd?: string | null
}

export interface TransitionInput {
  from: LifecycleFrom
  to: LifecycleState
  /** ISO-8601 evaluation instant, supplied by the caller. */
  now: string
  /** Stored period view for transitions evaluated against an existing row. */
  record?: TransitionPeriodView | null
  /** Period end to enforce or store (e.g. the paid period being canceled). */
  periodEnd?: string | null
}

export interface TransitionPatch {
  status: LifecycleState
  /** Present when the transition sets or preserves a period end. */
  currentPeriodEnd?: string
  /** Present when the transition sets or clears the end-of-period flag. */
  cancelAtPeriodEnd?: boolean
  /** Present when the transition stamps or clears the cancellation time. */
  canceledAt?: string | null
}

export type TransitionResult =
  | { ok: true; patch: TransitionPatch; repair?: 'PERIOD_MISSING' }
  | { ok: false; code: TransitionErrorCode }

/** Approved legal transitions (founder-approved matrix, incl. past_due → canceled). */
const LEGAL_TRANSITIONS: ReadonlySet<string> = new Set([
  'none>active',
  'active>past_due',
  'past_due>active',
  'past_due>expired',
  'active>canceled',
  'past_due>canceled',
  'canceled>expired',
  'canceled>active',
  'expired>active',
])

const KNOWN_STATES: ReadonlySet<string> = new Set([
  'none',
  'active',
  'past_due',
  'canceled',
  'expired',
])

function parseInstant(value: string): number | null {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function validPeriodEnd(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    parseInstant(value) !== null
  )
}

/**
 * Validate a lifecycle transition and describe the resulting patch.
 * Never invents period dates: a missing period where one is required is
 * PERIOD_REQUIRED, a malformed one is PERIOD_MALFORMED.
 */
export function transitionSubscription(
  input: TransitionInput
): TransitionResult {
  const { from, to, now, record = null, periodEnd = null } = input

  if (!KNOWN_STATES.has(from) || !KNOWN_STATES.has(to)) {
    return { ok: false, code: 'UNKNOWN_STATE' }
  }
  if (parseInstant(now) === null) {
    return { ok: false, code: 'PERIOD_MALFORMED' }
  }
  if (!LEGAL_TRANSITIONS.has(`${from}>${to}`)) {
    return { ok: false, code: 'ILLEGAL_TRANSITION' }
  }

  // Transitions into canceled require a valid period end (founder decision 1:
  // paid access continues until current_period_end).
  if (to === 'canceled') {
    const end = periodEnd ?? record?.currentPeriodEnd ?? null
    if (end === null || end === undefined || end === '') {
      return { ok: false, code: 'PERIOD_REQUIRED' }
    }
    if (!validPeriodEnd(end)) {
      return { ok: false, code: 'PERIOD_MALFORMED' }
    }
    return {
      ok: true,
      patch: {
        status: 'canceled',
        currentPeriodEnd: end,
        cancelAtPeriodEnd: true,
        canceledAt: now,
      },
    }
  }

  // Reactivation clears cancellation fields (approved contract).
  if (to === 'active' && (from === 'canceled' || from === 'expired')) {
    return {
      ok: true,
      patch: {
        status: 'active',
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    }
  }

  return { ok: true, patch: { status: to } }
}

export type EffectiveAccess = 'plan' | 'free'

export interface EffectiveAccessResult {
  access: EffectiveAccess
  /** True when access continues under a billing warning (past_due). */
  warning: boolean
  /** True when stored period data needs repair (missing/malformed). */
  repair: boolean
}

/**
 * Resolve effective access for a stored row (or no row) at `now`.
 * Fail-safe: a canceled row with missing or malformed period data behaves as
 * expired (Free) and raises the repair signal. Unknown statuses fail closed.
 */
export function effectiveAccess(
  record: { status: string; currentPeriodEnd?: string | null } | null,
  now: string
): EffectiveAccessResult {
  if (!record) return { access: 'free', warning: false, repair: false }
  if (parseInstant(now) === null) {
    return { access: 'free', warning: false, repair: true }
  }
  switch (record.status) {
    case 'active':
      return { access: 'plan', warning: false, repair: false }
    case 'past_due':
      return { access: 'plan', warning: true, repair: false }
    case 'expired':
      return { access: 'free', warning: false, repair: false }
    case 'canceled': {
      const end = record.currentPeriodEnd ?? null
      if (!validPeriodEnd(end)) {
        return { access: 'free', warning: false, repair: true }
      }
      const hasAccess = parseInstant(now) as number < (parseInstant(end) as number)
      return { access: hasAccess ? 'plan' : 'free', warning: false, repair: false }
    }
    default:
      return { access: 'free', warning: false, repair: true }
  }
}
