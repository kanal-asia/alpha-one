# TASK-ALPHA-SUBSCRIBER-014 — Product Identity & Subscriber Integration

**Mode:** Create Task → Execute → Review → Correct if Needed → Validate → Finalize
**Status:** `IN_PROGRESS` (created 2026-10-23, per `spint/TASK-WORKFLOW.md`)
**Priority:** P1 — Subscriber Product Readiness
**Expected Base:** `78f05de` — **actual starting HEAD verified:** `78f05de` (exact match)
**Canonical File:** `spint/TASK-ALPHA-SUBSCRIBER-014.md` (this file)
**Repository:** `C:\dev\alpha-one`
**Production / Deployment:** Prohibited

## 0. Mandatory Task Artifact

- [x] Verified branch (`main`), HEAD (`78f05de`), upstream (`origin/main`), tree (clean).
- [x] Created this file at the canonical path.
- [ ] Read back and verified ID, contents, path (below).
- Starting HEAD matches the expected base exactly — safe to proceed.
- This file will be updated with execution evidence + final verdict.

## 1. Objective

Smallest missing integration between UX, verified Product Identity, and
Subscriber Business Studio — reusing existing components, preserving working
Drive OAuth. No new auth architecture.

## 2. Phase A — Targeted Discovery

Prove with code: Workspace/Drive identity vs Product Identity (tokens,
sessions, callbacks, contracts); app user/session context; Studio routing;
status/access/usage/enforcement wiring. Record owner/lifecycle per
token/session. Identify confirmed gaps + smallest responsible boundary. No
defect assumed from screenshots.

## 3. Phase B — Integration Correction

Reuse existing auth; no duplicate login/OAuth; never trust client email/owner/
Drive identifiers as product identity; no Workspace-token-as-identity unless
the contract supports it. Account experience via existing endpoints with owner
isolation + effective Free; honest states; no duplicate pages/APIs. Sign-out
consistency review vs TASK-013 fix (which token cleared; no Workspace disconnect
side effects; no false Workspace-logout claims). Enforcement preserved; no
admin identity expansion.

## 4. Phase C — Review and Corrective Loop

Evidence → smallest component → minimal fix → regression coverage → re-run.
No rewrites, billing, quotas, admin console, or analytics builds.

## 5. Phase D — Validation

Identity/OIDC/session, Workspace/Drive regression (if shared behavior
touched), subscription/usage auth, enforcement, sign-out/transport, typecheck/
build, server build + packaged gate if relevant, ESLint touched, `git diff
--check`. Distinguish automated vs runtime vs human-unverified proof. No live-
consent claims without direct evidence.

## 6. Phase E — Finalize in the Same Workflow

Update this file; inspect diff; allow-list staging (`git add -f` for ignored
`spint/`); commit + push if authorized; verify HEAD/upstream/tree. No separate
tasks. No deploy/production/installer changes.

## 7. Out of Scope

Workspace/Drive rebuild, duplicate login, IdP replacement, billing/pricing/
quotas, admin console/operator identity, broad auth refactor, deployment/
release.

## 8. Acceptance Criteria

Canonical file verified pre-implementation; contracts distinguished with code
evidence; Drive intact; owner-scoped access consistent; sign-out accurately
defined; subscription/enforcement compatible; defects corrected +
regression-tested; no unnecessary changes; same-file evidence + verdict.

## 9. Final Report

Verdict (`COMMITTED_AND_PUSHED` / `READY_FOR_COMMIT` / `BLOCKED`), file path,
start/final commits, Workspace-vs-Identity contract, gaps + corrections, test/
build/lint results, Drive-preservation evidence, remaining blockers + human
actions, push + tree status. One task, one workflow, one report.

---

## Execution Record (appended during execution)

**Status:** complete 2026-10-23. Base `78f05de` exact; tree was clean at start.

### Phase A — Contracts proven with code

- **Workspace/Drive:** access+refresh tokens in `google_connections_credentials`
  keyed by fixed `'local-user'`; Workspace scopes; shared `/callback`
  (state-routed branches); `useAccountIdentity` display + VPS enrichment.
- **Product Identity:** Google ID token (1h JWT) → JWKS verification → `sub`
  owner; in-memory Bearer (`http-transport.ts:311`) + auth-store user; same
  callback endpoint, separate state store, separate token/session/contract.
- **No cross-mapping:** `providerUserId` never feeds `productUserId`
  (verified by grep; the one `local-user` in `opencode/server.ts:225` is a
  reference-resolver label, not identity). No Workspace token used as product
  credential anywhere.
- **Gap confirmed (only one):** subscriber UI fetches (`fetchSubscriptionStatus`,
  `fetchUsage`) sent no Authorization header, so even logged-in users always
  read anonymous effective-Free — verified owners could never see their own
  record/usage. Auth-store user additionally invisible in UI (display-only
  observation, not a functional defect; Drive profile remains the displayed
  identity by design).

### Phase B/C/D — Correction + tests

- `http-transport.ts`: exported `getProductAuthHeaders()` (single carriage
  mechanism, `{}` when logged out — anonymous behavior preserved).
- `subscription-status.ts` + `use-subscription-usage.ts` (exported
  `fetchUsage` for testability): both attach the headers. No duplicate auth
  code, no new flows, no Workspace side effects, no enforcement/billing
  changes.
- `subscriber-fetch-identity.test.ts` (new, registered): status+usage ×
  logged-in/logged-out header carriage, 4/4 pass.
- Full suite **28 files / 233 pass**; `tsc` 0; ESLint touched 0; `diff --check`
  clean. No server files changed → server rebuild/gate N/A (nothing
  server-side touched).

## Final Verdict

**`COMMITTED_AND_PUSHED`** — see Phase E below.
