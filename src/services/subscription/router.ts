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
  countUsageRuns,
  getSubscriptionByOwner,
  listUsageRuns,
  saveSubscription,
  type SubscriptionRecord,
  type UsageRun,
} from '../../lib/sqlite-persistence'
import { SUBSCRIPTION_PLANS } from '../../lib/subscription-plans'
import { isLifecycleState, transitionSubscription } from './transitions'

export type SubscriptionStatusSource = 'default' | 'record'

export interface SubscriptionStatus {
  planId: string
  /** Stored lifecycle status; present only for persisted records. */
  status?: string
  source: SubscriptionStatusSource
  hasRecord: boolean
}

export const EFFECTIVE_FREE_PLAN_ID = 'free'

/**
 * Presentation-safe usage entry: ledger facts only (model, token counts,
 * outcome, timestamps). No prompts, payloads, or secrets — the ledger
 * stores none of those by design.
 */
export interface UsageRunView {
  runId: string
  model: string
  agent: string | null
  sessionId: string | null
  tokenCount: number
  textLen: number
  terminal: boolean
  exitCode: number | null
  continuationCount: number
  durationMs: number | null
  createdAt: string
}

export interface UsageResponse {
  runs: UsageRunView[]
  total: number
}

function toUsageView(row: UsageRun): UsageRunView {
  return {
    runId: row.runId,
    model: row.model,
    agent: row.agent,
    sessionId: row.sessionId,
    tokenCount: row.tokenCount,
    textLen: row.textLen,
    terminal: row.terminal,
    exitCode: row.exitCode,
    continuationCount: row.continuationCount,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
  }
}

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

  /**
   * POST /api/subscription/cancel — self-service cancellation.
   *
   * Owner comes exclusively from the verified product identity; the request
   * body and query string are never consulted for ownership. Anonymous and
   * forged credentials cannot mutate anything. Cancellation preserves the
   * stored period (founder decision 1): access continues until
   * `current_period_end` via the shared effective-access rule.
   *
   * - no row → 404 SUBSCRIPTION_NOT_FOUND (no row is created)
   * - already canceled → 200 current record state, byte-identical outcome
   *   (idempotent: the original canceled_at stamp is preserved)
   * - illegal source state (e.g. expired) → 409 ILLEGAL_TRANSITION
   * - missing/malformed period → 409 PERIOD_REQUIRED / PERIOD_MALFORMED
   *   (nothing is written; no successful cancellation is fabricated)
   *
   * No plan-grant or arbitrary status-mutation endpoint exists in this task.
   */
  router.post('/cancel', async (req: Request, res: Response) => {
    try {
      const { context, error } = await resolveAuthContextAsync(
        req.headers as Record<string, unknown>
      )

      if (error) {
        return res
          .status(error.status)
          .json({ error: error.message, code: error.code })
      }
      if (!context.verified || !context.productUserId) {
        return res.status(401).json({
          error: 'Authentication is required to cancel a subscription.',
          code: 'AUTHENTICATION_REQUIRED',
        })
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
        return res.status(404).json({
          error: 'No subscription to cancel.',
          code: 'SUBSCRIPTION_NOT_FOUND',
        })
      }

      if (!isKnownPlanId(record.planId)) {
        return res.status(500).json({
          error: 'Stored subscription references an unknown plan.',
          code: 'SUBSCRIPTION_PLAN_UNKNOWN',
        })
      }

      // Idempotent repeat: an already-canceled row is returned unchanged —
      // the original canceled_at stamp is never rewritten.
      if (record.status === 'canceled') {
        return res.json({ ...recordStatus(record), canceled: true })
      }

      // Corrupt stored status can never transition: fail closed like an
      // unknown plan id (same data-integrity philosophy).
      if (!isLifecycleState(record.status)) {
        return res.status(500).json({
          error: 'Stored subscription has an unknown status.',
          code: 'SUBSCRIPTION_STATUS_FAILED',
        })
      }

      const now = new Date().toISOString()
      const verdict = transitionSubscription({
        from: record.status,
        to: 'canceled',
        now,
        record: { currentPeriodEnd: record.currentPeriodEnd },
        periodEnd: record.currentPeriodEnd,
      })

      if (!verdict.ok) {
        return res.status(409).json({
          error:
            verdict.code === 'PERIOD_REQUIRED' ||
            verdict.code === 'PERIOD_MALFORMED'
              ? 'Stored subscription has no usable period end; cancellation refused.'
              : 'Subscription cannot be canceled from its current status.',
          code: verdict.code,
        })
      }

      const updated: SubscriptionRecord = {
        ...record,
        status: verdict.patch.status,
        currentPeriodEnd: verdict.patch.currentPeriodEnd ?? record.currentPeriodEnd,
        cancelAtPeriodEnd: verdict.patch.cancelAtPeriodEnd ?? true,
        canceledAt: verdict.patch.canceledAt ?? now,
        updatedAt: now,
      }

      try {
        await saveSubscription(updated)
      } catch (err) {
        return res.status(500).json({
          error:
            err instanceof Error
              ? err.message
              : 'Failed to cancel subscription.',
          code: 'SUBSCRIPTION_CANCEL_FAILED',
        })
      }

      return res.json({ ...recordStatus(updated), canceled: true })
    } catch (err) {
      return res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to cancel subscription.',
        code: 'SUBSCRIPTION_CANCEL_FAILED',
      })
    }
  })

  /**
   * GET /api/subscription/usage — recorded usage for the caller (read-only).
   *
   * Owner comes exclusively from the verified product identity; anonymous
   * callers read rows recorded under the shared 'anonymous' owner (same
   * device, no cross-user boundary exists locally). Forged credentials fail
   * closed through the shared boundary. Only presentation fields are
   * returned — never prompts, payloads, or secrets (the ledger stores
   * none). `?limit=` is clamped to 1..200 (default 50); garbage falls back
   * to the default rather than failing the read.
   */
  router.get('/usage', async (req: Request, res: Response) => {
    try {
      const { context, error } = await resolveAuthContextAsync(
        req.headers as Record<string, unknown>
      )

      if (error) {
        return res
          .status(error.status)
          .json({ error: error.message, code: error.code })
      }
      const ownerSub =
        context.verified && context.productUserId
          ? context.productUserId
          : 'anonymous'

      const rawLimit = Array.isArray(req.query.limit)
        ? req.query.limit[0]
        : req.query.limit
      const parsed = typeof rawLimit === 'string' ? Number.parseInt(rawLimit, 10) : NaN
      const limit = Number.isFinite(parsed)
        ? Math.min(200, Math.max(1, parsed))
        : 50

      let runs: UsageRunView[]
      let total: number
      try {
        const [rows, count] = await Promise.all([
          listUsageRuns(ownerSub, limit),
          countUsageRuns(ownerSub),
        ])
        runs = rows.map(toUsageView)
        total = count
      } catch (err) {
        return res.status(500).json({
          error:
            err instanceof Error ? err.message : 'Failed to load usage.',
          code: 'SUBSCRIPTION_USAGE_FAILED',
        })
      }

      return res.json({ runs, total })
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load usage.',
        code: 'SUBSCRIPTION_USAGE_FAILED',
      })
    }
  })

  return router
}
