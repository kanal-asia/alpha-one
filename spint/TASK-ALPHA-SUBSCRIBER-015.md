# TASK-ALPHA-SUBSCRIBER-015 — Runtime Verification & Subscriber Journey

**Mode:** Create Task → Execute → Review → Correct if Needed → Validate → Finalize
**Status:** `IN_PROGRESS` (created 2026-10-23, per `spint/TASK-WORKFLOW.md`)
**Priority:** P1 — Subscriber Product Readiness
**Expected Base:** `7613a36` — **actual starting HEAD verified:** `7613a36` (exact match)
**Canonical File:** `spint/TASK-ALPHA-SUBSCRIBER-015.md` (this file)
**Repository:** `C:\dev\alpha-one`
**Production / Deployment:** Prohibited

## 0. Mandatory Task Artifact

- [x] Verified branch (`main`), HEAD (`7613a36`), upstream (`origin/main`), tree (clean).
- [x] Created this file at the canonical path.
- [ ] Read back and verified ID, contents, path (below).
- Starting HEAD matches the expected base exactly — safe to proceed.
- This file will be updated with runtime evidence + final verdict.

## 1. Objective

Verify the Subscriber implementation as an integrated product journey in the
actual local app, beyond the TASK-014 header-contract tests. No rebuilds of
existing auth/Workspace/Drive/subscription/usage functionality.

## 2. Phase A — Establish the Runtime

Identify supported local startup, intended runtime, browser-test setup.
Verify: app starts on intended local config; expected build/commit; local
services available; browser runner executable without broken downloads; no
production touched. Repair the browser runner via the repo's supported
procedure (inspect Playwright config + cache first; no blind downloads, no
second framework). Human-only prerequisites documented, other checks continue.

## 3. Phase B — Runtime Subscriber Journey

A. Authenticated user (entry point; status + usage with Bearer; owner-scoped
results not anonymous-Free; navigation intact) — controlled test account,
non-sensitive evidence only. B. Anonymous (contract behavior; no fake
identity; honest empty usage; no cross-device claims). C. Sign-out in a real
browser when runner available (Bearer cleared; subsequent requests clean;
logged-out contract consistent; no Workspace disconnect side effects). D.
Authorization (server boundaries retained; forged/invalid via existing tests;
no real-user data access).

## 4. Phase C — Correct Only Confirmed Defects

Evidence → smallest boundary → scoped fix → regression test → re-run. No
rewrites, billing, quotas, admin console, or analytics builds.

## 5. Phase D — Validation

Browser tests (account/subscription/usage/sign-out) where feasible; identity/
session, subscription, usage, enforcement, cancellation suites; typecheck/
build; server build + packaged gate if relevant; ESLint touched; `git diff
--check`. Separate automated vs runtime/browser vs human-unverified evidence.
Exact commands + counts. No end-to-end-verified label unless browser/runtime
steps actually ran.

## 6. Phase E — Finalize in the Same Workflow

Update this file; inspect diff; allow-list staging (`git add -f` for ignored
`spint/`); commit + push if authorized; verify HEAD/upstream/tree. No separate
tasks. No deploy/production/installer changes.

## 7. Out of Scope

Workspace/Drive rebuild, new auth flows/IdP, billing/pricing/quotas, admin
console/identity, broad auth refactor, deployment/release.

## 8. Acceptance Criteria

File verified pre-execution; runtime identified + exercised safely; Bearer use
proven; anon/auth distinguished; sign-out browser-tested if runner available;
Drive intact; defects fixed + tested; gaps explicitly unverified; finalized
in-workflow when authorized.

## 9. Final Report

Verdict (`COMMITTED_AND_PUSHED` / `READY_FOR_COMMIT` / `BLOCKED`), file path,
start/final commits, proven vs unverified steps, runner status + repairs,
corrections + files, test/build/lint results, remaining blockers + human
actions, push + tree status. One task, one workflow, one report.

---

## Execution Record (appended during execution)

**Status:** complete 2026-10-24. Base `7613a36` exact; tree was clean at start.

### Phase A — Runtime established

- Local startup: `vite` dev (port 3000; proxy `/api` → `BACKEND_PORT`/3001) +
  `tsx src/server/alpha-server.ts`; exercised here as backend :5198 (source,
  temp DATA_ROOT) + vite :5201 (auto-increment; 5199 occupied).
- Build under test = source at `7613a36` (dev servers run TS directly; packaged
  app untouched).
- Browser runner repaired WITHOUT blind downloads: pinned
  `chromium_headless_shell-1217` stalled mid-extract (killed); instead drove
  the repo's Playwright with system Chrome via a temporary config (deleted
  afterwards). Separately, the sign-out browser test needed a real fix (see C).

### Phase B — Journey evidence (all in headless system Chrome)

- `/studio` → server-driven "Default plan" badge; `/account` → plan links;
  `/account/usage` → **"2 recorded runs"** with model `opencode/beam-free`
  and token counts from seeded ledger rows served by the REAL router+sqlite
  (browser → vite proxy → backend → DB proven end-to-end).
- `/account/plans` renders; `/sign-in` reachable with "Continue with Google".
- Sign-out flow: sidebar profile → Sign out → confirm dialog → redirect to
  `/sign-in?redirect=%2Fworkspace%2Fassistant` (screenshots in temp `sub015/`).
- Anonymous behavior: default plan + own (empty/seaded) rows; no cross-device
  claims in copy. Authorization: forged→401 covered by suites; no real-user
  data touched.
- **Blocked (human-only):** live Google consent with a test account — no test
  account exists; user credentials must not be used. Exact action: sign in via
  the app's Google button with a test account and confirm workspace render +
  verified plan display.

### Phase C — Correction

`sign-out-dialog.test.tsx` mock factories violated vitest's hoisting rule
(top-level `vi.fn()` consts referenced inside `vi.mock` factories), so the
regression test could never execute in this toolchain. Fixed with
`vi.hoisted()` (test-only change, no product code). Browser run now green.

### Phase D — Validation (exact)

- New browser proof: `sign-out-dialog.test.tsx` **3/3 pass** in headless
  Chrome (incl. token-clear assertions).
- `npm run test:port`: **28 files / 233 pass**. `npx tsc -b`: 0. ESLint
  touched: 0. `git diff --check`: clean.
- Pre-existing failures: none (full suite green).

## Final Verdict

**`COMMITTED_AND_PUSHED`** — see Phase E below.
