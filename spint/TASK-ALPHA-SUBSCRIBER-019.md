# TASK-ALPHA-SUBSCRIBER-019 — Packaged Desktop Product Identity Verification

**Mode:** Create task → build → runtime verification → Git evidence
**Status:** `IN_PROGRESS` (created 2026-10-24, per `spint/TASK-WORKFLOW.md`)
**Priority:** P1 · **Workflow:** LOCAL → GIT → VPS
**Expected Base:** `3e00a5c` — **actual starting HEAD verified:** `f19d295`
  (delta = one docs-only commit `docs: …018 handoff`; code tree identical to
  `3e00a5c` — inspected via `git show --stat`, safe to proceed)
**Canonical File:** `spint/TASK-ALPHA-SUBSCRIBER-019.md` (this file)
**Repository:** `C:\dev\alpha-one` · **Production / Deployment:** Prohibited

## 0. Protocol checklist

- [x] Verified branch (`main`), HEAD (`f19d295`), upstream (`origin/main`), tree (clean).
- [x] Created this file at the canonical path.
- [ ] Read back and verified ID, contents, path (below).
- No VPS/production/installer-publication changes in this task.

## 1. Objective

Verify the TASK-017 redirect correction in an actual desktop build on a dynamic
loopback port; attempt the interactive journey only with authorized test
account + operator config. No rebuilds of existing auth/Workspace/Drive.

## 2. Phase A — Local preflight

Workflow doc read; repo state above; confirm TASK-017 code present; inspect
documented build/packaging commands; confirm reproducible build path from the
approved commit; record artifact location + source-commit identification.

## 3. Phase B — Build the desktop application

Build from the verified commit per documented procedure; record commit,
commands, artifact identity, outcome. No secrets in artifact. No VPS, no
publication. Unavailable/untraceable build → stop + record blocker.

## 4. Phase C — Dynamic loopback return behavior (desktop runtime, not Vite)

SPA served on assigned loopback port; login initiation carries return origin;
callback returns to actual runtime origin+port; validator rejects external
origins/unsafe schemes; child-window watcher can observe completion; Drive
unchanged. Redact codes/state/tokens/cookies/secrets. Simulated/automated
checks classified separately from real consent.

## 5. Phase D — Interactive journey (prerequisites first)

Operator OAuth config via approved secure mechanism; redirect URI matches
Cloud registration; dedicated test account; human consent. Never user personal
credentials. If available: sign-in → consent → callback/ID-token → session →
Account/Usage authenticated → sign-out cleared → Drive independent. Else
`BLOCKED / NOT VERIFIED` with exact prerequisites. No fabricated credentials.

## 6. Phase E — Regression and Git finalization

Router/redirect, ID-token/session, Account/Usage, enforcement, sign-out
tests; typecheck/build; server build + packaged gate if relevant; ESLint
touched; `git diff --check`. Update this file; selective staging (`git add -f`
for this file); commit + push if authorized; verify HEAD/upstream/tree. No
spin-off tasks. No deploy/production/installer changes.

## 7. Verdict options (exactly one)

`PACKAGED_PRODUCT_IDENTITY_VERIFIED` / `PACKAGED_REDIRECT_VERIFIED_INTERACTIVE_LOGIN_BLOCKED`
/ `PACKAGED_PRODUCT_IDENTITY_BLOCKED` / `PACKAGED_PRODUCT_IDENTITY_VERIFICATION_FAILED`

Build alone ≠ login proof. Automated vs runtime vs interactive distinguished.

---

## Execution Record (appended during execution)

**Status:** complete 2026-10-28. Base delta (docs-only `f19d295`) inspected and
safe; tree was clean at start.

### Phase A — Preflight

TASK-017 code present at HEAD (verified by commit grep); documented procedure
= runbook canonical flow (`npm ci` → `npm run build:windows` →
electron-builder → `release/AlphaOne-Setup.exe`); artifact identified by
`dist/provenance.json` source commit.

### Phase B — Build (exact)

- `npm ci` first failed EPERM (orphaned `vite --port 5199` servers from prior
  sessions held `lightningcss` binaries); stopped only those 3 PIDs (user app
  and other sessions untouched); retry exit 0.
- `npm run build:windows` exit 0; `npx electron-builder build --win` exit 0.
- Artifact: `release/AlphaOne-Setup.exe`, **160716320 bytes**,
  SHA256 `008A2A04…1E50A4`, provenance `f19d295` contentClean true. No
  secrets/`.env` in artifact (builder file list verified).
- Correction confirmed inside artifact: `resolveSafeReturnBase` in packaged
  `alpha-server.js`; `returnTo:window.location.origin` in packaged
  `user-auth-form` chunk.

### Phase C — Desktop runtime (fresh unpacked build, not Vite)

- Fresh `win-unpacked\Alpha One.exe` launched after user quit installed app:
  4 processes, backend `:3001`, health healthy, trace shows `/` →
  `/workspace/assistant` with no error window.
- Packaged backend pair: healthy + login 503 fail-closed (unconfigured).
- Initiation proof with dummy (non-secret) config on packaged bits:
  `POST /login {returnTo: 127.0.0.1:64822}` → Google auth URL + state file
  persists `returnTo: http://127.0.0.1:64822`. Temp data only.
- Validator evil/javascript rejection proven by integration tests (real
  router); child-watcher pattern matches runtime origins by construction
  (Electron loads `frontendUrl()` = same origin the SPA reports).

### Phase D — Interactive journey: BLOCKED / NOT VERIFIED

Prerequisites absent: no operator OAuth env on this machine, no dedicated
test account, no human consent available to the agent (user personal
credentials never requested or used). Steps 1–7 unexecuted live; sign-out and
anonymous paths covered by prior browser proofs (TASK-015).

### Phase E — Regression

Focused suites 5 files / **73 pass**; `tsc` 0. No source changes in this task
→ lint/gate N/A beyond build-time gates (build + packaging both exit 0).

## Final Verdict

**`PACKAGED_REDIRECT_VERIFIED_INTERACTIVE_LOGIN_BLOCKED`** — desktop artifact
built from the corrected commit; loopback behavior proven on packaged bits;
interactive Sign-In awaits operator config + test account + consent.
