# TASK-ALPHA-SUBSCRIBER-009 — Account Enforcement & Ban Foundation

> **RECOVERY NOTICE (2026-10-23, TASK-ALPHA-SUBSCRIBER-011):** reconstructed
> from the founder brief and session execution record; not a pre-execution
> artifact.

**Mode:** Implementation with scoped discovery (executed 2026-10-22)
**Priority:** P1 · **Base:** `15b69d8`

## Objective (from brief)

Minimum viable account-enforcement foundation separating account access status
from subscription lifecycle: restriction/suspension/ban, documented reasons,
review/appeal record. Billing/expiry never misconduct.

## Execution record (reported evidence)

- Discovery: shared boundary = `requireVerifiedContextAsync` (exactly 2
  execution routes); no admin identity exists → no public mutation endpoint
  (reported blocker, not worked around).
- Model: `account_status` + `account_enforcement_events` tables (IF NOT
  EXISTS) + `getAccountByOwner`/`saveAccountStatus`/`recordEnforcementEvent`/
  `listEnforcementEvents`.
- `services/account/enforcement.ts`: `checkAccountAccess` (anon/no-row/active
  allow; restricted allows flagged; suspended/banned deny; unknown/store-failure
  fail closed); +72h/+14d deadline helpers.
- Guard hook in `requireVerifiedContextAsync`: verified-only check, 403 stable
  codes, anonymous/login/callback/public untouched, subscription untouched.
- Tests: `enforcement.test.ts` (21: migration, matrix, isolation, deadlines,
  audit ordering, guard boundary, module-surface pin).
- Validation: node suite 22 files / 207 pass; `tsc` 0; ESLint 0 on touched
  paths; `build:server` 0 + packaged gate 3/3; `diff --check` clean.
- Finalized in-task (unified 009A) as commit `f71e3c6`
  (`feat(subscriber): add account enforcement foundation`, 5 files, +865).

## Verdict

**`IMPLEMENTATION_READY_FOR_REVIEW`** at close; see 009A. Blocker kept
explicit: operational administration awaits an admin-identity decision.
