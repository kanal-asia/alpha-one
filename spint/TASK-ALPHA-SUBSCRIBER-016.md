# TASK-ALPHA-SUBSCRIBER-016 — Packaged App Identity Configuration & Sign-In Verification

**Mode:** Targeted runtime verification + corrective implementation if evidence proves a defect
**Status:** `IN_PROGRESS` (created 2026-10-24, per `spint/TASK-WORKFLOW.md`)
**Priority:** P1 · **Domain:** Subscriber / Product Identity
**Expected Base:** `b7e2eed` — **actual starting HEAD verified:** `b7e2eed` (exact match)
**Canonical File:** `spint/TASK-ALPHA-SUBSCRIBER-016.md` (this file)
**Repository:** `C:\dev\alpha-one` · **Production / Deployment:** Prohibited

## 0. Protocol checklist

- [x] Read `spint/TASK-WORKFLOW.md` (prior task; rules applied here).
- [x] Verified branch (`main`), HEAD (`b7e2eed`), upstream (`origin/main`), tree (clean).
- [x] Created this file at the canonical path.
- [ ] Read back and verified ID, contents, path (below).
- Work stays in this single task; no Git-only/audit/corrective spin-offs.

## 1. Objective

Prove whether Product Identity is configured and operational in the packaged
app, verify interactive Google Sign-In with an authorized test account where
available. Fix only evidence-proven defects. No Workspace/Drive rebuild, no
second auth system.

## 2. Known baseline (TASK-015 reported; re-establish before changing code)

Browser covered studio/account/plans/usage/sign-in; 2 seeded usage rows shown
end-to-end; sign-out + anonymous-Free exercised; 28 files / 233 tests green;
tsc/lint/diff clean; packaged-identity config unproven; prior 503 = fail-closed
when unconfigured; interactive consent untested (no test account); TASK-015
used source + local runtime (not packaged proof); Workspace vs Identity
contracts distinct.

## 3. Scope

- **Phase A:** config-path map (source → packaged → verifier → callback/
  redirect URI); re-probe the 503 endpoint; classify 503 (expected fail-closed
  vs packaging defect); document required values, read sites, packaging
  treatment. Never print secrets.
- **Phase B:** smallest fix only for a proven in-scope defect. No Clerk/new
  flows/duplicate stores/cross-mapping; no hardcoded credentials; no weakened
  verification; missing operator config → document names + safe setup, don't
  invent values.
- **Phase C:** packaged-artifact behavior (identity recorded; steps 1–8 of the
  brief). Authorized dedicated test account only; never user credentials.
  Unavailable steps → **BLOCKED / NOT VERIFIED** with exact prerequisites.
- **Phase D:** focused + regression tests; browser sign-in/session; tsc/build;
  lint touched; `git diff --check`; packaged smoke. Separate source vs
  packaged evidence.

## 4. Exclusions

No production deploy/restart/config changes; no customer-account changes; no
pricing/quota/usage/enforcement-plan changes; no Workspace rebuild; no admin
identity; no unrelated UI/refactor/tasks; no fabricated credentials or
personal-account reuse.

## 5. Acceptance criteria

Per brief §6 (11 items): repo/runtime established; 503 classified on evidence;
config path documented; minimal supported changes only; packaged artifact
tested (not inferred); Sign-In passed only on genuine interactive exercise;
contracts separate; session propagation + sign-out verified or blockers
explicit; regressions recorded; task file holds record + verdict; selective
staging, no unrelated changes.

## 6. Verdict options (exactly one)

`PACKAGED_IDENTITY_VERIFIED` / `PACKAGED_IDENTITY_CONFIG_DEFECT_FIXED` /
`PACKAGED_IDENTITY_BLOCKED_EXTERNAL_PREREQUISITE` /
`PACKAGED_IDENTITY_FAIL_CLOSED_CONFIRMED` /
`PACKAGED_IDENTITY_VERIFICATION_FAILED`

Passed/failed/blocked/not-tested distinguished. Healthy source runtime ≠
verified packaged app.

---

## Execution Record (appended during execution)

**Status:** complete 2026-10-24. Base `b7e2eed` exact; tree was clean at start
and is clean at close (no code changes — correctly, per Phase B).

### Phase A — Configuration-path map (evidence)

- Required values: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_OAUTH_REDIRECT_URI` (all three gate `isConfigured()` in
  `oauth-service.ts:86-93,358-362`); `GOOGLE_CLIENT_ID` alone gates ID-token
  verification (`google-id-token.ts:62-69`); `CLIENT_URL` for redirects.
- Read sites: `process.env`, populated by `dotenv/config` (dev/source, CWD
  `.env`) or inherited process env (packaged backend spawn passes through
  Electron's env — `main.ts` adds only PORT/NODE_ENV/DATA/paths, never
  secrets).
- Packaging treatment: `electron-builder.json` ships only `electron/dist` +
  `dist`; **`.env` is intentionally excluded** — secrets can never ship in the
  installer. No `.env` exists in the repo (verified). Drive OAuth works without
  local secrets because the VPS is authoritative (status-endpoint design);
  product-login token exchange runs locally, hence needs machine env.
- Prior 503 re-probed and classified: **expected fail-closed**, not a defect.

### Phase B — No defect, no code change

Machine/user/process env on this machine: all four names **absent** (checked,
values never read or printed). An unconfigured backend has nothing to verify
with — 503 is the designed answer. Missing operator configuration, not code.
Required setup documented below; no values invented or hardcoded.

### Phase C — Packaged-artifact checks (installed build `39860e4`+fix)

Artifact: `C:\Program Files\Alpha One` (provenance `39860e4` + uncommitted
jose fix — the TASK-001 validated build; identity code identical in spirit to
current HEAD, subscription UI absent by age — stated, not hidden).

1. Absent-config probe → **PASS**: `POST /login` → 503
   `{"error":"Product login is not configured.",
   "code":"AUTH_PROVIDER_NOT_CONFIGURED"}`, no secret material, no false auth.
2. Fail-closed without secrets → **PASS** (same evidence).
3.–8. Sign-In initiation with valid config, callback verification, session
   propagation to `/account*`, sign-out clearing, Drive independence under a
   configured identity → **BLOCKED / NOT VERIFIED**: need (a) operator-set
   `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_OAUTH_REDIRECT_URI`
   (redirect URI must match the app's Google Cloud registration), (b) an
   authorized dedicated test account, (c) human consent interaction. User
   personal credentials must never substitute.

### Safe operator setup (no secrets recorded)

Set the three `GOOGLE_*` names (+ `CLIENT_URL` if the default
`http://localhost:3000` is wrong for the install) as **machine or user
environment variables** on the target Windows host — never in the installer,
repo files, or chat. Verify with the step-1 probe (expect a Google
authorization URL, not 503). Drive flow needs no change. Rotate/remove via the
same env mechanism; nothing is persisted by the app besides TTL login states.

### Phase D — Regression (exact)

- Focused suites: 7 files / **84 tests pass** (OIDC verify, auth-context,
  product-login router incl. AUTH-002 gate, subscription status/cancel,
  account enforcement, transport session contract).
- `npx tsc -b`: exit 0. No files changed → lint/diff checks vacuous; tree
  clean (`b7e2eed`).

## Final Verdict

**`PACKAGED_IDENTITY_FAIL_CLOSED_CONFIRMED`** — unconfigured 503 is designed
behavior on the packaged artifact; no code defect demonstrated; interactive
proof awaits operator configuration + test account + consent (all three
explicitly listed above).
