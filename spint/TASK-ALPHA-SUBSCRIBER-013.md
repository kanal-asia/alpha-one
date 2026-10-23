# TASK-ALPHA-SUBSCRIBER-013 — Subscriber End-to-End Readiness

**Mode:** Create Task → Execute → Review → Correct if Needed → Validate → Finalize
**Status:** `IN_PROGRESS` (created 2026-10-23, per `spint/TASK-WORKFLOW.md`)
**Priority:** P1 — Subscriber Product Readiness
**Expected Base:** `a8dd6db` — **actual starting HEAD verified:** `a8dd6db` (exact match)
**Canonical File:** `spint/TASK-ALPHA-SUBSCRIBER-013.md` (this file)
**Repository:** `C:\dev\alpha-one`
**Production / Deployment:** Prohibited

## 0. Mandatory Task Artifact

- [x] Verified branch (`main`), HEAD (`a8dd6db`), upstream (`origin/main`), tree (clean).
- [x] Created this file at the canonical path.
- [ ] Read back and verified ID, contents, path (below).
- Starting HEAD matches the expected base exactly — safe to proceed.
- This file will be updated with execution evidence + final verdict.

## 1. Objective

Prove the Subscriber Business Studio components work as a coherent
authenticated product journey: Google login → verified product identity →
account/subscription experience → recorded usage visibility → logout/session
behavior. Fix only integration gaps that block the journey. No rebuild of
completed foundations.

## 2. Phase A — Targeted Discovery

Inspect: OIDC browser login/callback/session/logout; identity propagation;
post-login routing; `GET /status`, `GET /usage` + UIs; enforcement behavior;
dev/packaged startup config; auth/UI test infra. Record the actual journey,
boundaries, coverage, and gaps before changing code.

## 3. Phase B — Browser Authentication Proof

Verify login entry reachability, redirect/callback consistency with the local
runtime, verified identity establishment, account experience routing, identity
use by subscription/usage requests, session behavior across navigation/refresh,
logout behavior — using a test account in a non-production environment. Human-
only steps documented, never fabricated. No production OAuth changes, no new
IdP.

## 4. Phase C — Subscriber Journey Integration

A. Account identity (verified-owner resolution, no client-supplied owners,
anonymous compatibility, login/callback unblocked). B. Subscription experience
(UI reflects API; effective Free; invalid data never grants access;
cancellation/lifecycle unchanged). C. Usage experience (ledger records shown;
states honest; recorded-usage labels; anonymous/device-local semantics
explicit). D. Enforcement (suspended/banned intact on guarded routes; no
misconduct conflation; no public admin endpoint). Correct only demonstrated
defects.

## 5. Phase D — Corrective Implementation

Capture failure → smallest boundary → scoped fix → regression coverage →
re-run. No rewrites, billing, quotas, admin console, or analytics builds.

## 6. Phase E — Validation

Auth/OIDC, account/route, subscription, usage, enforcement tests; typecheck/
build; server build + packaged gate; ESLint on changed files; `git diff
--check`. Browser journey tested where possible. Separate automated vs
browser/runtime evidence; manual-Google steps; pre-existing failures.

## 7. Phase F — Finalize in the Same Workflow

Update this file; inspect diff; allow-list staging (`git add -f` for ignored
`spint/`); commit + push if authorized; verify HEAD/upstream/tree. No separate
tasks. No deploy/production/installer changes.

## 8. Out of Scope

Payments/billing, pricing/quota decisions, lifecycle redesign, admin console/
operator identity, new IdP, deployment/release, rebuilding 001–012 without a
demonstrated defect.

## 9. Acceptance Criteria

Canonical file with final record; journey tested as far as environment
permits; identity propagates to subscription/usage; boundaries intact; defects
corrected + regression-tested; typecheck/build/tests pass or blockers
documented; browser proof distinguished from unit proof; finalized in-workflow
when authorized.

## 10. Final Report

Verdict (`COMMITTED_AND_PUSHED` / `READY_FOR_COMMIT` / `BLOCKED`), file path,
start/final commits, journey steps proven vs not, browser vs automated
evidence, corrections + files, test/build/lint results, remaining blockers +
exact human action, push + tree status. One task, one workflow, one report.

---

## Execution Record (appended during execution)

**Status:** complete 2026-10-23. Base `a8dd6db` exact; tree was clean at start.

### Phase A — Journey as found

Login: sign-in page → "Continue with Google" → `POST /login` → Google
(shared registered redirect URI, no console change needed) → `/callback`
(state-routed product branch) → `/sign-in?product_login=` → `complete` →
auth-store user + in-memory Bearer → navigate `/`. Logout: `SignOutDialog` →
`auth.reset()` + navigate sign-in. **Defect found:** sign-out never cleared the
in-memory product token, so execution requests stayed authenticated as the
previous user. Login/callback/oauth routes use no enforcement guard
(verified) — never blocked.

### Phase B — Browser/runtime proof

- Live Google consent requires a human + real account: no test account exists
  and user credentials must not be used → live-login step BLOCKED, documented
  (not fabricated). Exact human action needed: sign in with a test Google
  account in the app and confirm workspace render.
- Runtime probes against isolated local backend (`dist` bundle, temp DATA_ROOT,
  single invocation): `/health` healthy; `POST /login` → 503 fail-closed
  (unconfigured probe env — configured-state in the packaged app unproven);
  `/subscription/status` → effective Free; `/usage?limit=2` → empty payload.
  No state mutated (anonymous reads only; one TTL login-state file in TEMP).
- Browser runner unavailable here (pinned headless-shell download incomplete
  after two attempts); documented instead of forced.

### Phase C/D — Fix + regression coverage

- `sign-out-dialog.tsx` (+2): `setProductSessionToken(null)` on confirm, with
  comment. Cancel path untouched.
- `sign-out-dialog.test.tsx` (browser): asserts token cleared with `null` on
  confirm, untouched on cancel. File typechecks (`tsc`) and lints clean but
  could not execute in this environment (see above) — stated, not claimed.
- `http-transport-session.test.ts` (node, NEW, registered): token set →
  header present; cleared → header absent; default absent. 3/3 pass — proves
  the mechanism the fix relies on.
- Journey A–D re-verified against code: owner verified-only; login/callback
  unguarded; effective Free live; invalid→500 tested; cancellation untouched;
  usage labels honest; enforcement suite green.

### Phase E — Validation (exact)

- `npm run test:port`: **27 files / 229 tests pass** (3 new). `npx tsc -b`: 0.
- ESLint on touched files: 0. `git diff --check`: clean.
- No server-build-affecting changes (frontend-only + node test); packaged gate
  unaffected.

## Final Verdict

**`COMMITTED_AND_PUSHED`** — see Phase F below.
