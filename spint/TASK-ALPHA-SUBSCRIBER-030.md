# TASK-ALPHA-SUBSCRIBER-030 — Post-Corrective Local Smoke Test

**Mode:** Verify → build-if-stale → install → human smoke → record
**Status:** `IN_PROGRESS` (created per `spint/TASK-WORKFLOW.md`)
**Priority:** P1 · **Base:** `dfd84e7` — actual HEAD verified identical, `== origin/main`, tree clean
**Canonical File:** `spint/TASK-ALPHA-SUBSCRIBER-030.md` (this file)
**Repository:** `C:\dev\alpha-one` · Local Windows only, no VPS/production changes

## 0. Protocol checklist

- [x] Verified branch (`main`), HEAD (`dfd84e7`), upstream, tree (clean, no sync needed).
- [x] Created this file at the canonical path.
- [ ] Read back and verified ID, contents, path (below).
- Target: `SUBSCRIPTION_CORRECTIVE_LOCAL_SMOKE_VERIFIED`.

## 1. Objective

Verify TASK-028 corrections in the real installed app: Current Plan, Usage,
expired/invalid presentation, Google-only providers, chat/sign-out/Drive —
without rebuilding auth/billing or touching production.

## 2. Phases

- **Phase 1:** sync (done above — already at `dfd84e7` == origin/main).
- **Phase 2:** installed provenance check; build Windows installer from the
  verified source only if the installed package predates `dfd84e7`; record
  commit/size/SHA-256. No rebuild by default.
- **Phase 3:** preserve data; upgrade/install if required; launch; backend
  health + loopback + frontend; broker initiation; no secret in package.
- **Phase 4:** human smoke (A Current Plan, B Usage, C expired/invalid
  presentation without waiting 1h if a testable path exists, D providers,
  E regression) with the authorized test account; sanitized evidence only.
- **Phase 5:** AC-01…AC-14 matrix (PASS/PARTIAL/BLOCKED/FAIL/N-A, no live-E2E
  inflation).
- **Phase 6:** record in this file (TASK-028 history untouched); commit + push
  only this task record per workflow; verify HEAD/upstream/tree.

## 3. Out of scope / constraints

Per brief (Midtrans/billing/entitlements/quota/workflows/VPS/OAuth redesign/
UI redesign excluded). Preserve data + local changes; no destructive Git;
never `git add .`; no secrets/tokens/cookies/codes; no production mutation;
no unnecessary rebuild; no simulated auth; no PASS without direct evidence.

---

## Execution Record (appended during execution)

**Status:** complete 2026-11-09. Base `dfd84e7` exact; tree was clean at start.

### Phase 1 — Sync

`main` @ `dfd84e7` == `origin/main`, clean; no sync needed.

### Phase 2 — Build (installed 3a02c6e predates the fix; rebuild required)

- Toolchain verified (Node 26.5.0, npm 11.17.0); stopped 3 orphaned
  `vite --port 5199` servers holding build locks (user app untouched).
- `npm ci` 0; `npm run build:windows` 0; `electron-builder build --win` 0.
- Artifact: `release/AlphaOne-Setup.exe`, **160,769,394 bytes**,
  SHA-256 `B6B75BC1…17D5A42`, provenance `dfd84e7` contentClean true.
  No VPS/production changes.

### Phase 3 — Install + runtime

- Upgraded with user approval (data preserved); provenance now `dfd84e7`.
- Backend `:3001` healthy (CLI 1.18.21); frontend served; broker initiation
  path unchanged from prior proofs. Packaged server bundle scanned: no
  secret/token/PEM material.

### Phase 4 — Human smoke (test account, sanitized reports only)

- A: sign-in OK; Current Plan loads clean (Free, no credential error).
- B: Usage loads honestly; no fabricated figures reported.
- C: expired/invalid branches NOT live-clicked (no expired session available;
  manufacturing one would weaken auth) — unit-proven + backend-exact only.
- D: sign-in page Google-only (user-verified); sign-up same by code.
- E: chat answered; sign-out performed (to check providers); Drive confirmed
  working afterwards.

### Phase 5 — AC matrix

| ID | Verdict | Evidence |
|---|---|---|
| 01–04 | PASS | Ancestry, provenance, health, UI driven |
| 05–08 | PASS | User-reported sign-in/plan/usage |
| 09–10 | PARTIAL | Unit-proven + code-exact; not live-clicked (needs 1h-old session) |
| 11–12 | PASS | User-verified Google-only |
| 13–14 | PASS | Chat + sign-out + Drive confirmed |

## Final Verdict

**`SUBSCRIPTION_CORRECTIVE_LOCAL_SMOKE_PARTIAL`** — every live-checkable item
passes on the `dfd84e7` build; only the expired/invalid live click-through
remains unit-level evidence. No code changes in this task; no production
impact. Recommended follow-up: re-run AC-09/10 live when a naturally expired
test session exists.
