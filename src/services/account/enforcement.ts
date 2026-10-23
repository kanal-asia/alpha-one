/**
 * TASK-ALPHA-SUBSCRIBER-009: account-enforcement decision boundary.
 *
 * Account access status is independent of subscription lifecycle: billing
 * failure or subscription expiry must never write here and never denies
 * through this module. Owner is the verified product sub (or anonymous);
 * never email, never client input, never the Drive-OAuth shared id.
 *
 * Decisions:
 * - anonymous / no record / active → allow (backward compatible).
 * - restricted → allow with `restricted: true`. HONESTY RULE: no
 *   operation-level restriction rules exist yet, so restricted MUST NOT deny;
 *   the flag exists for future rules to hook into.
 * - suspended / banned → deny with stable codes (403 at the guard).
 * - unknown persisted status → deny ACCOUNT_STATUS_INVALID (fail closed).
 * - store failure → deny ACCOUNT_STATUS_FAILED (fail closed).
 *
 * No HTTP, no mutation endpoints, no admin identity in this task: applying
 * or changing status happens only through the exported storage helpers
 * (used by tests and future authorized admin flows).
 */
import {
  getAccountByOwner,
  type AccountStatusRecord,
} from '../../lib/sqlite-persistence'

export const ACCOUNT_STATUSES = [
  'active',
  'restricted',
  'suspended',
  'banned',
] as const

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number]

export function isAccountStatus(value: string): value is AccountStatus {
  return (ACCOUNT_STATUSES as ReadonlyArray<string>).includes(value)
}

export type AccountAccessDecision =
  | {
      allowed: true
      accountStatus: 'active' | 'restricted'
      /** True when flagged restricted; no operation rules consume it yet. */
      restricted: boolean
    }
  | {
      allowed: false
      accountStatus: string
      code:
        | 'ACCOUNT_SUSPENDED'
        | 'ACCOUNT_BANNED'
        | 'ACCOUNT_STATUS_INVALID'
        | 'ACCOUNT_STATUS_FAILED'
      reviewDueAt: string | null
      appealBy: string | null
    }

/** Emergency-suspension review deadline: applied time + 72 hours. */
export function reviewDueAt(appliedAtIso: string): string {
  return new Date(Date.parse(appliedAtIso) + 72 * 60 * 60 * 1000).toISOString()
}

/** Permanent-ban appeal submission deadline: applied time + 14 days. */
export function appealDeadline(appliedAtIso: string): string {
  return new Date(
    Date.parse(appliedAtIso) + 14 * 24 * 60 * 60 * 1000
  ).toISOString()
}

export type AccountLoader = (
  ownerSub: string
) => Promise<AccountStatusRecord | null>

/**
 * Resolve account access for a verified owner sub, or null for anonymous.
 * Anonymous callers have no record by construction and are always allowed
 * (existing login/anonymous behavior unchanged).
 */
export async function checkAccountAccess(
  productUserId: string | null,
  loader: AccountLoader = getAccountByOwner
): Promise<AccountAccessDecision> {
  if (!productUserId) {
    return { allowed: true, accountStatus: 'active', restricted: false }
  }
  let record: AccountStatusRecord | null
  try {
    record = await loader(productUserId)
  } catch {
    return {
      allowed: false,
      accountStatus: 'unknown',
      code: 'ACCOUNT_STATUS_FAILED',
      reviewDueAt: null,
      appealBy: null,
    }
  }
  if (!record) {
    return { allowed: true, accountStatus: 'active', restricted: false }
  }
  switch (record.status) {
    case 'active':
      return { allowed: true, accountStatus: 'active', restricted: false }
    case 'restricted':
      return { allowed: true, accountStatus: 'restricted', restricted: true }
    case 'suspended':
      return {
        allowed: false,
        accountStatus: 'suspended',
        code: 'ACCOUNT_SUSPENDED',
        reviewDueAt: record.reviewDueAt,
        appealBy: null,
      }
    case 'banned':
      return {
        allowed: false,
        accountStatus: 'banned',
        code: 'ACCOUNT_BANNED',
        reviewDueAt: null,
        appealBy: record.appealDeadline,
      }
    default:
      return {
        allowed: false,
        accountStatus: record.status,
        code: 'ACCOUNT_STATUS_INVALID',
        reviewDueAt: null,
        appealBy: null,
      }
  }
}
