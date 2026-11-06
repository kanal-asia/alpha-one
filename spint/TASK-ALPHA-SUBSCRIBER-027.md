# TASK-ALPHA-SUBSCRIBER-027 — Local Windows Execution & OAuth E2E

**Mode:** Local execution → runtime verification → interactive OAuth E2E → records
**Status:** `IN_PROGRESS` (created per `spint/TASK-WORKFLOW.md`)
**Priority:** P1 · **Workflow:** LOCAL → GIT → VPS (no VPS mutation)
**Expected Base:** `c7dc549` — **actual starting HEAD verified:** `c7dc549` after
  `git pull --ff-only` from `f48c2b3` (18 commits, clean tree, local was ancestor)
**Canonical File:** `spint/TASK-ALPHA-SUBSCRIBER-027.md` (this file)
**Repository:** `C:\dev\alpha-one` · **Production / Deployment:** Prohibited

## 0. Protocol checklist

- [x] Verified branch (`main`), HEAD (`c7dc549`), upstream (`origin/main`), tree (clean).
- [x] Created this file at the canonical path.
- [ ] Read back and verified ID, contents, path (below).
- Target verdict: `PRODUCT_IDENTITY_OAUTH_BROKER_INTERACTIVE_E2E_VERIFIED`.

## 1. Objective

Execute remaining Product Identity verification from this Windows host using
the verified installer: real Google OAuth E2E, then update TASK-023 with final
evidence. Target: `PRODUCT_IDENTITY_OAUTH_BROKER_INTERACTIVE_E2E_VERIFIED`.

## 2. Known evidence (from brief, to re-verify)

- Task-record commit `c7dc549`, source `3a02c6e`, installer 160,159,836 bytes /
  SHA-256 `c3563367…106395`, GH Actions artifact `alpha-one-windows-3a02c6e`
  (expiry 2026-11-29), VPS services healthy (do not touch).

## 3. Phases

- **Phase 1:** sync (done above — fast-forward, clean).
- **Phase 2:** retrieve GH artifact with authorized session (no PAT handling);
  verify size + SHA-256; no rebuild by default; record path + checksum.
- **Phase 3:** inspect install; install if needed (preserve data/config);
  launch; backend health + loopback + frontend; login initiates vs VPS broker;
  Drive isolation; sanitized evidence only.
- **Phase 4:** interactive E2E with dedicated test account; pause for
  user-only gates (credentials/MFA/consent); then consent → callback →
  completion → session → `sub` verification → gated access → sign-out →
  Drive isolation. No simulation/bypass/weakening; stop with exact missing
  capability if browser uncontrollable.
- **Phase 5:** update `TASK-023` in place (preserve history); create/update
  this file; per-criterion PASS/PARTIAL/BLOCKED/FAIL; commit via approved
  workflow; push; verify.

## 4. Constraints / Report

Per brief: no VPS mutation/restart/redeploy; no unrelated refactor; no default
rebuild; no destructive Git; never `git add .`; no secrets/tokens/cookies/
codes/personal data in evidence; target verdict only on full interactive
success.

---

## Execution Record (appended during execution)

**Status:** complete 2026-11-06 (note: wall-clock is Nov 6; brief dated Nov 3).
Base `c7dc549` verified; tree was clean at start and after sync.

### Phase 1 — Sync (PASS)

`main`, clean tree, `git pull --ff-only` (`f48c2b3..c7dc549`, 18 commits, local
was ancestor). HEAD contains `c7dc549`. New in-range work since `f48c2b3`:
broker implementation (022), packaging CI (024), runtime-verify flows
(023/025/026) — reviewed via log, no conflicts.

### Phase 2 — Retrieval + verification (PASS)

- Installed `gh` 2.103.3 (winget). Authenticated by user-completed device flow
  (agent relayed one-time codes verbally; expired codes retried twice; final
  code authorized by user; `gh auth status` → kanal-asia; no PAT/token seen).
- Downloaded `alpha-one-windows-3a02c6e` (run 41031835852; one reset, retry ok)
  to `Temp\sub027-artifact`: 3 files.
- `AlphaOne-Setup.exe` **160,159,836 bytes**; SHA-256
  **`c3563367ae6168c3c406a539f65cf7ce1d2899cf453df6b2110e02bd4f106395`**
  MATCH (expected = `.sha256` file); `build-metadata.json` provenance
  **`3a02c6e…` exact**, toolchain node v26.5.0 / npm 11.17.0 / win32-x64.
- No rebuild performed.

### Phase 3 — Install + runtime (PASS)

- Prior install: Oct-20 pre-broker build. Upgraded via verified installer with
  user approval (data preserved); provenance now `3a02c6e`.
- `Alpha One.exe` + backend child alive; 127.0.0.1:3001 listener; health
  healthy (CLI 1.18.21); frontend served.
- Broker initiation: bare POST → 400 `LOGIN_RETURN_INVALID`; with loopback
  returnTo → real Google authorize URL (product callback, PKCE, client id, no
  secret on machine).

### Phase 4 — Interactive E2E (PASS, human-gated as required)

- Fresh authorize URL opened in system Chrome; user signed in with the
  dedicated test account and approved consent; app returned to Alpha One.
- Verified: welcome state, no errors; Account page loads; test chat answered;
  clean sign-out; Drive still connected afterward.
- Agent handled zero credentials/tokens/cookies/codes/personal data. No
  simulation, bypass, or weakening. Per-criterion map: all AC PASS (see
  TASK-023 L5 table); no PARTIAL/BLOCKED/FAIL remains.

### Phase 5 — Records (this file + TASK-023 L-section appended in place)

- Commit + push below. No VPS mutation/restart/redeploy at any point.

## Final Verdict

**`PRODUCT_IDENTITY_OAUTH_BROKER_INTERACTIVE_E2E_VERIFIED`**

**Go-Live impact:** the Product Identity chain is fully proven on the verified
installer. Remaining Go-Live items are operational, not evidentiary:
test-account session hygiene (re-consent uses the same human gate),
production monitoring of broker health/audit, and the standing publication
HOLD until explicit release authorization.
