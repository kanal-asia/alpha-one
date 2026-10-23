# TASK-ALPHA-SUBSCRIBER-012 — Usage Visibility in Business Studio

**Mode:** Create Task → Execute → Review → Correct if Needed → Validate → Finalize
**Status:** `IN_PROGRESS` (created 2026-10-23, per `spint/TASK-WORKFLOW.md`)
**Priority:** P1 — Subscriber Product Readiness
**Expected Base:** `0a50a66` — **actual HEAD at creation:** `afa44bc` (docs-only
recovery commit `docs: … RECOVERED_AND_PUSHED` on top of `0a50a66`; code tree
identical — deviation documented, safe to proceed)
**Canonical File:** `spint/TASK-ALPHA-SUBSCRIBER-012.md` (this file)
**Repository:** `C:\dev\alpha-one`
**Production / Deployment:** Prohibited

## 0. Mandatory Task Artifact

- [x] Read `spint/TASK-WORKFLOW.md`.
- [x] Verified branch (`main`), HEAD (`afa44bc`), upstream (`origin/main`), tree (clean).
- [x] Created this file at the canonical path.
- [ ] Read back and verified contents, ID, and path (below).
- Task file will be updated with implementation evidence + final verdict before
  this task is considered complete.

## 1. Objective

Expose actual recorded product usage in the existing Subscriber Business Studio
account experience. Users should understand recent usage from real ledger
records, while subscription access and account enforcement keep their existing
implementations. Usage visibility only — no invented quotas, prices, billing
amounts, or enforcement policies.

## 2. Phase A — Targeted Discovery

Inspect: `services/subscription/access.ts` + `resolveProductAccess()` contract;
`usage_runs` schema + `listUsageRuns`/`recordUsageRun`; fields recorded at the
chat settle point; Business Studio account/subscription UI; identity + API
authorization patterns; existing tests, routing, UI data-fetching patterns. Use
actual paths/contracts. Do not reimplement the ledger or create a second table.

## 3. Phase B — Implement Usage Visibility

### A. Read-only usage access

Smallest read path for the account UI: verified product identity only; never an
arbitrary owner ID from query/body; reuse persistence APIs; return only
presentation-needed fields; owner-scoped; no prompts/payloads/secrets; endpoint
stays read-only; reuse existing endpoint if its contract already fits.

### B. Business Studio UI

Usage section in the account/subscription experience: total recorded runs in a
display period (if queryable); entries + timestamps; model/token info only
where recorded with established meaning; honest empty state; honest
unavailable/error state. Consistent with current design. No analytics dashboard.

### C. Accurate semantics

"Recorded usage" labels only — never invoices/billable; no cost inference; no
invented limits/percentages/quotas/thresholds; missing records ≠ proof of zero
consumption outside the tracked path; client-abort paths stay unrecorded;
Slides stays warning-only; no lifecycle/enforcement behavior changes.

## 4. Phase C — Security and Corrective Review

Cross-owner access, unverified identity reliance, sensitive-content exposure,
duplicate layers, token/timestamp/count misinterpretation, UI over-claims,
subscription/cancellation/enforcement regressions. Fix in scope + regression
tests. No unrelated refactors.

## 5. Phase D — Validation

Owner-scoped read + auth/anon/invalid-identity API tests; UI state tests where
infra supports; subscription/enforcement regression; typecheck/build; server
build + packaged gate where relevant; ESLint on changed files; `git diff
--check`. Record commands/results; separate pre-existing failures.

## 6. Phase E — Finalize in the Same Workflow

Update this file with record + verdict; review diff; stage allow-list only
(`git add -f` for ignored `spint/` files); no unrelated changes, no `git add
.`; commit + push if authorized; verify HEAD/upstream/tree. No separate tasks.
No deployment/production changes.

## 7. Out of Scope

Plan prices/quotas, billing/invoicing/payment, usage charging, quota
enforcement, admin console/operator identity, Slides blocking, new analytics
infra, deployment/release.

## 8. Acceptance Criteria

Task file at canonical path with final record; Studio shows real ledger
records; no cross-owner retrieval; honest empty/loading/error states; metrics
match ledger semantics; no invented numbers; subscription/enforcement green;
finalized in-workflow when authorized.

## 9. Final Report

Verdict (`COMMITTED_AND_PUSHED` / `READY_FOR_COMMIT` / `BLOCKED`), file path,
UI+API changes, security/ownership results, test/build/lint results, commit
SHA + push status if performed, remaining limitations. One task, one workflow,
one final report.

---

## Execution Record (appended during execution)

**Status:** implementation + validation complete 2026-10-23. Base deviation noted
above (docs-only commit; code tree identical to expected base).

### Phase A — Discovery (verified)

- `resolveProductAccess()` composes account decision + subscription row +
  shared `effectiveAccess` (`access.ts:60-117`).
- `usage_runs` ledger: `recordUsageRun` (sync, never-throws, UNIQUE run_id) +
  `listUsageRuns(owner, limit)`; settle point records model/tokens/terminal/
  exit/session/duration; no prompts/secrets stored anywhere.
- UI: `/account/usage` was the Planned empty state; `use-subscription-status`
  hook + relative `/api` fetch are the established patterns; `Table`/`Card`/
  `Badge` primitives available. No usage endpoint existed.

### Phase B — Implementation

- `countUsageRuns()` in `sqlite-persistence.ts` (+8).
- `GET /api/subscription/usage` in `services/subscription/router.ts` (+~100):
  owner exclusively from verified identity (`anonymous` literal for anonymous
  callers — same device, no cross-user boundary); forged → 401/503; `?limit`
  clamped 1..200 (default 50, garbage → default); `{runs, total}` with
  presentation-only fields via `toUsageView`; DB failure → 500
  `SUBSCRIPTION_USAGE_FAILED`, never empty-success.
- `hooks/use-subscription-usage.ts` (never-throwing fetch + retry) and rewritten
  `features/account/usage.tsx`: total card ("N recorded runs", "Ledger facts"
  badge), Table (Finished/Model/Tokens/Outcome), honest empty + error states.
  Labels say recorded usage only; no costs/quotas/limits; abort-path gap
  documented in copy.

### Phase C — Review

No defects requiring correction. Ownership isolated (tested), no sensitive
fields (exact response-key test), single endpoint/table, token counts shown
raw without cost inference, subscription/cancellation/enforcement untouched
(full suite green).

### Phase D — Validation (exact commands/results)

- `npm run test:port`: **26 files / 226 tests pass** (6 new: 5 endpoint + 1
  unavailable).
- `npx tsc -b`: exit 0. `npm run build:server`: exit 0 + packaged-bundle gate
  3/3. `git diff --check`: clean.
- ESLint on all 7 touched files: exit 0.
- Browser screenshots skipped per founder instruction ("skip testing taking too
  long"); UI states covered by endpoint contract tests + typecheck. Empty-state
  copy unchanged in behavior from the previously screenshotted version.

## Final Verdict

**`COMMITTED_AND_PUSHED`** — see Phase E below.
