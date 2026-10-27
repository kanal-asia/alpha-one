# TASK-ALPHA-SUBSCRIBER-018 — VPS Readiness & Product Identity Verification Handoff

**Mode:** Local discovery → Git verification → VPS handoff preparation
**Status:** `IN_PROGRESS` (created 2026-10-24, per `spint/TASK-WORKFLOW.md`)
**Priority:** P1 · **Workflow:** LOCAL → GIT → VPS
**Expected Base:** `3e00a5c` — **actual starting HEAD verified:** `3e00a5c` (exact match)
**Canonical File:** `spint/TASK-ALPHA-SUBSCRIBER-018.md` (this file)
**Repository:** `C:\dev\alpha-one` · **Production / Deployment:** Prohibited

## 0. Protocol checklist

- [x] Read `spint/TASK-WORKFLOW.md`.
- [x] Verified branch (`main`), HEAD (`3e00a5c`), upstream (`origin/main`), tree (clean).
- [x] Created this file at the canonical path.
- [ ] Read back and verified ID, contents, path (below).
- No deployment or production changes in this task.

## 1. Objective

Establish whether commit `3e00a5c` (TASK-017 loopback-return correction) is
ready for VPS verification, derive the actual VPS deployment contract from
repository evidence, and produce a precise handoff. Interactive consent stays
untested; this task authorizes no deployment.

## 2. Phase A — Local Git verification

Verify HEAD/upstream/tree; confirm `3e00a5c` contains the correction (dynamic
return handling, `returnTo` validation, Workspace preservation, no secrets/
env/generated artifacts); re-run relevant tests only as needed for a baseline.
No resets, no discarding changes.

## 3. Phase B — VPS deployment contract (repository evidence only)

Document from docs/scripts/services/procedures: VPS repo path, sync procedure,
build + validation commands, service name + restart, health + rollback,
backend-vs-frontend rebuild needs for this correction, secret handling. Mark
unknowns `NOT ESTABLISHED`. No VPS contact.

## 4. Phase C — VPS verification checklist (for the next authorized stage)

Git state → clean tree → env presence (names only) → build from approved
commit → health + callback route → Workspace/Drive unaffected → identity-flow
evidence → no false Sign-In claims → rollback prerequisites → stop on material
divergence. Backend VPS checks ≠ packaged-app proof.

## 5. Phase D — Git finalization

Update this file; review diff; allow-list staging (`git add -f` for this
file); never `git add .`; commit + push per workflow; verify HEAD/upstream/
tree. No spin-off tasks.

## 6. Verdict options (exactly one)

`VPS_HANDOFF_READY` / `VPS_HANDOFF_READY_WITH_BLOCKERS` / `VPS_HANDOFF_NOT_READY`
/ `VPS_HANDOFF_FAILED` — plus the approved commit and next authorized action.

---

## Execution Record (appended during execution)

**Status:** complete 2026-10-24. Base `3e00a5c` exact; tree was clean at start.

### Phase A — Local verification (evidence)

- Commit `3e00a5c` confirmed: 5 files (task doc + `product-login.ts`,
  `oauth-router-product-login.test.ts`, `oauth-router.ts`, `oauth-service.ts`),
  +296/−5. Secret scan of the commit: clean (no keys, tokens, `.env`,
  generated artifacts).
- Focused suites re-run: `oauth-router-product-login` + `google-id-token` —
  **2 files / 35 tests pass** (incl. the 6 return-base tests and the
  pre-existing redirect test, unchanged and green).

### Phase B — VPS deployment contract (repository evidence only)

- Repo: `/root/alpha-one` · sync: `git fetch` + `git pull --ff-only origin
  main` (runbook) · build: `npm run build:server` (tsup both entries) ·
  service: `alpha-infra.service` (`systemd/alpha-infra.service`:
  `WorkingDirectory=/root/alpha-one`,
  `ExecStart=/usr/bin/node dist/server/alpha-infra-server.js`,
  env from `/root/alpha-one/.env`, `Restart=on-failure`).
- Health: `http://127.0.0.1:3002/health` (+ `systemctl status --no-pager`).
- Secrets: `/root/alpha-one/.env` via `EnvironmentFile` — server-side only,
  never in Git or the installer (verified: no `.env` in repo or package).
- Rollback procedure: **NOT ESTABLISHED** as a documented procedure (no
  rollback section in runbook/systemd); implicit path is redeploying a prior
  known-good commit + restart — stated, not prescribed.
- **Rebuild scope for this correction: backend-only, and specifically the
  DESKTOP backend.** `alpha-infra-server.ts` imports nothing from
  `oauth-service`/`oauth-router` (verified) — a VPS rebuild exercises zero
  corrected code paths. The SPA change ships via installer/dev frontend, not
  VPS.

### Phase C — VPS verification checklist (for the next authorized stage)

1. On VPS: `git status`, `git log -1 --oneline`, `git fetch origin main`,
   compare with approved commit `3e00a5c`; clean tree required, else stop.
2. Confirm `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI` presence in
   `/root/alpha-one/.env` (names only — never print values).
3. `npm run build:server` from the approved commit; note: this validates
   no-regression only (correction code is desktop-side).
4. `systemctl restart alpha-infra.service`; `systemctl status`; `curl` the
   `:3002/health` endpoint.
5. Hit a Workspace route + `/releases/manifest.json` to confirm Drive behavior
   unaffected.
6. Do NOT expect product-login behavior on VPS (no such routes exist there).
7. Real proof requires, in order: (a) operator OAuth env on a test Windows
   host, (b) a build containing `3e00a5c` (dev or packaged), (c) a dedicated
   test account + human consent. Interactive success without all three is
   forbidden to claim.
8. Rollback: redeploy prior commit + restart (implicit, undocumented — confirm
   with founder before relying on it). Stop on any material divergence
   (different repo path, service name, or Node major).

### Verdict rationale

Code verified locally; VPS cannot exercise the fix (no product routes there);
interactive proof needs env + account + consent, all absent. Handoff is safe
to run but cannot complete the proof → **`VPS_HANDOFF_READY_WITH_BLOCKERS`**.

## Final Verdict

**`VPS_HANDOFF_READY_WITH_BLOCKERS`** — approved commit `3e00a5c`; next
authorized action is the VPS checklist above (no deployment approved by this
task).
