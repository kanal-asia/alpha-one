/**
 * TASK-ALPHA-SUBSCRIBER-003: subscription status client + view model.
 *
 * Reads GET /api/subscription/status (relative URL, same origin). The fetch
 * never throws: failures surface as the `error` view model so the UI can
 * render its error state instead of fabricating plan data.
 */
import type { SubscriptionStatus } from '@/services/subscription/router'
import { getProductAuthHeaders } from '@/features/ai/opencode/services/http-transport'

export type { SubscriptionStatus }

export type PlanCardModel =
  | { kind: 'loading' }
  | { kind: 'default'; planId: string }
  | { kind: 'record'; planId: string; status: string }
  | { kind: 'error'; message: string }

/**
 * Map a loaded status (or load failure) to the card model. Pure function —
 * unit-tested in the node project. `loading: true` wins over any payload.
 */
export function toPlanCardModel(input: {
  loading: boolean
  status?: SubscriptionStatus | null
  error?: string | null
}): PlanCardModel {
  if (input.loading) return { kind: 'loading' }
  if (typeof input.error === 'string' && input.error.length > 0) {
    return { kind: 'error', message: input.error }
  }
  const status = input.status ?? null
  if (!status) return { kind: 'error', message: 'Subscription status is unavailable.' }
  if (status.source === 'record' && status.hasRecord) {
    return { kind: 'record', planId: status.planId, status: status.status ?? 'active' }
  }
  return { kind: 'default', planId: status.planId }
}

/** Fetch the subscription status. Never throws. */
export async function fetchSubscriptionStatus(): Promise<{
  status: SubscriptionStatus | null
  error: string | null
}> {
  try {
    // TASK-ALPHA-SUBSCRIBER-014: carry the verified product session so the
    // backend resolves the caller's own record. Logged-out callers send no
    // Authorization header and receive the anonymous effective Free default.
    const res = await fetch('/api/subscription/status', {
      headers: { Accept: 'application/json', ...getProductAuthHeaders() },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: unknown
      } | null
      const message =
        body && typeof body.error === 'string'
          ? body.error
          : `Subscription status check failed (HTTP ${res.status}).`
      return { status: null, error: message }
    }
    const raw = (await res.json()) as Partial<SubscriptionStatus> | null
    if (!raw || typeof raw.planId !== 'string') {
      return { status: null, error: 'Subscription status response was invalid.' }
    }
    return {
      status: {
        planId: raw.planId,
        status: typeof raw.status === 'string' ? raw.status : undefined,
        source: raw.source === 'record' ? 'record' : 'default',
        hasRecord: raw.hasRecord === true,
      },
      error: null,
    }
  } catch (err) {
    return {
      status: null,
      error: err instanceof Error ? err.message : 'Subscription status could not be loaded.',
    }
  }
}
