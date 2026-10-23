/**
 * TASK-ALPHA-SUBSCRIBER-003: subscription status router (read-only).
 *
 * GET /api/subscription/status resolves the caller's plan from the
 * subscription record owned by the VERIFIED product identity — never from a
 * client-sent owner field, never from the shared Drive-OAuth 'local-user'
 * id, and never from email.
 *
 * Contract:
 * - anonymous (no credential) → 200 effective Free
 *   `{ planId: 'free', source: 'default', hasRecord: false }`
 * - verified, no row → same effective Free (no row is created by reads)
 * - verified, row with known plan → 200
 *   `{ planId, status, source: 'record', hasRecord: true }`
 * - verified, row with UNKNOWN plan → 500 SUBSCRIPTION_PLAN_UNKNOWN
 *   (corrupt data fails closed; a plan id never implies an active
 *   subscription, a payment, or an entitlement)
 * - unverifiable credential → 401/503 via the shared trust boundary
 * - database failure → 500 (never a fabricated success)
 *
 * No mutation is wired here. ALPHA_AUTH_ENFORCE is untouched: this
 * informational endpoint stays available anonymously by design.
 */
import { Router, type Request, type Response } from 'express'
import { resolveAuthContextAsync } from '../opencode/auth-context'
import {
  getSubscriptionByOwner,
  type SubscriptionRecord,
} from '../../lib/sqlite-persistence'
import { SUBSCRIPTION_PLANS } from '../../lib/subscription-plans'

export type SubscriptionStatusSource = 'default' | 'record'

export interface SubscriptionStatus {
  planId: string
  /** Stored lifecycle status; present only for persisted records. */
  status?: string
  source: SubscriptionStatusSource
  hasRecord: boolean
}

export const EFFECTIVE_FREE_PLAN_ID = 'free'

/** Plan ids known to the static catalog (single source of truth). */
export function isKnownPlanId(planId: string): boolean {
  return SUBSCRIPTION_PLANS.some((plan) => plan.id === planId)
}

function defaultStatus(): SubscriptionStatus {
  return { planId: EFFECTIVE_FREE_PLAN_ID, source: 'default', hasRecord: false }
}

function recordStatus(record: SubscriptionRecord): SubscriptionStatus {
  return {
    planId: record.planId,
    status: record.status,
    source: 'record',
    hasRecord: true,
  }
}

export function createSubscriptionRouter(): Router {
  const router = Router()

  router.get('/status', async (req: Request, res: Response) => {
    try {
      const { context, error } = await resolveAuthContextAsync(
        req.headers as Record<string, unknown>
      )

      // Unverifiable credential fails closed through the shared boundary.
      // No credential at all → anonymous effective Free (unchanged default).
      if (error) {
        return res
          .status(error.status)
          .json({ error: error.message, code: error.code })
      }
      if (!context.verified || !context.productUserId) {
        return res.json(defaultStatus())
      }

      let record: SubscriptionRecord | null
      try {
        record = await getSubscriptionByOwner(context.productUserId)
      } catch (err) {
        return res.status(500).json({
          error:
            err instanceof Error
              ? err.message
              : 'Failed to load subscription status.',
          code: 'SUBSCRIPTION_STATUS_FAILED',
        })
      }

      if (!record) {
        return res.json(defaultStatus())
      }

      if (!isKnownPlanId(record.planId)) {
        return res.status(500).json({
          error: 'Stored subscription references an unknown plan.',
          code: 'SUBSCRIPTION_PLAN_UNKNOWN',
        })
      }

      return res.json(recordStatus(record))
    } catch (err) {
      return res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load subscription status.',
        code: 'SUBSCRIPTION_STATUS_FAILED',
      })
    }
  })

  return router
}
