# TASK-ALPHA-SUBSCRIBER-017 — Product Identity OAuth Architecture Correction

**Mode:** Create task → inspect → corrective implementation → test → Git
**Status:** `IN_PROGRESS` (created 2026-10-24, per `spint/TASK-WORKFLOW.md`)
**Priority:** P1 · **Workflow:** LOCAL → GIT → VPS
**Expected Base:** `a0d22e6` — **actual starting HEAD verified:** `a0d22e6` (exact match)
**Canonical File:** `spint/TASK-ALPHA-SUBSCRIBER-017.md` (this file)
**Repository:** `C:\dev\alpha-one`

## 0. Protocol checklist

- [x] Verified branch (`main`), HEAD (`a0d22e6`), upstream (`origin/main`), tree (clean).
- [x] Created this file at the canonical path.
- [ ] Read back and verified ID, contents, path (below).
- Starting HEAD matches the expected base exactly — safe to proceed.
- Evidence + verdict will be appended here; no spin-off tasks.

## 1. Objective

Resolve the OAuth architecture gap from TASK-016: VPS holds Google OAuth
credentials while the packaged app 503s without local config. Decide on
evidence — delegate exchange to VPS or retain local exchange — and implement
the smallest correct change. No VPS/production changes in this task.

## 2. Phase 1 — Local discovery

Read workflow + Product Identity docs; verify repo state (done above); inspect
oauth-router/service, alpha-infra-server, verification, session propagation,
desktop login/callback, API contracts/env; establish the auth→callback→
exchange→verify→user→API sequence; separate Product Identity from Workspace;
determine whether a VPS product-identity endpoint exists (prove, don't infer);
record evidence + proposed correction here before implementing.

## 3. Phase 2 — Correct locally

VPS delegation: reuse a proven endpoint or document the required contract; no
client secret to desktop; preserve state/redirect/verification/identity
boundaries; desktop receives only the auth result; no Workspace-as-identity
confusion. Local exchange confirmed: document the decision, implement only a
secure supported config solution. Unproven flow: stop + record blocker.

## 4. Phase 3 — Local verification

Router/callback, state, ID-token, session propagation, sign-in/out,
Workspace/Drive regression, tsc/build, lint touched, `git diff --check`. Add/
update contract tests. No interactive-Sign-In claims without exercise.

## 5. Phase 4 — Git finalization

Update this file; review diff (no secrets/.env/unrelated/generated); selective
staging (`git add -f` for this file); never `git add .`; commit correction +
task file together when warranted; push after checks + remote verification;
report commit/push/tests/blockers. No separate tasks.

## 6. Exclusions & acceptance

Per brief: no VPS/production/registration/credential-copying changes; no new
provider/flow/Workspace rebuild; no pricing/quota/usage/enforcement changes;
no unrelated refactoring. Acceptance: architecture proven; design justified; no
secret shipped; boundaries secure; checks pass or failures reported; task file
complete; selective Git; no production changes.

## 7. Verdict options (exactly one)

`PRODUCT_IDENTITY_OAUTH_CORRECTION_COMPLETE` /
`PRODUCT_IDENTITY_ARCHITECTURE_DECISION_DOCUMENTED` /
`PRODUCT_IDENTITY_CORRECTION_BLOCKED` /
`PRODUCT_IDENTITY_CORRECTION_FAILED`

Verified behavior vs assumptions vs untested flows distinguished.

---

## Execution Record (appended during execution)

### Phase 1 — Findings (code evidence)

**VPS has no product-identity endpoint.** `alpha-infra-server.ts` routes are
exclusively Workspace/health/releases/downloads/profile/activity; the only
exchange (`POST /google/oauth/verify`) swaps Workspace sessions for Workspace
tokens. Delegating product exchange to VPS would require a NEW server contract
+ deployment — out of scope (no VPS changes allowed) and unproven. **Decision:
retain local exchange** (implemented, unit-tested architecture).

**Proven local defect (packaged product login can never complete):**
- `oauth-router.ts:144` redirects successful logins to
  `` `${clientUrl}/sign-in?product_login=…` `` with `clientUrl =
  CLIENT_URL ?? http://localhost:3000` (`:367`).
- The real SPA client (`product-login.ts:26`) sends NO `returnTo`, so the
  per-request dynamic return plumbed through `handleProductLoginCallback`
  (`oauth-service.ts:544`) is never used — the static base always wins.
- Packaged backend serves the SPA at `127.0.0.1:${runtimePort}` (3001, or an
  alternate like 58490/64621 proven common on this machine); Electron sets no
  `CLIENT_URL` (`main.ts:817-828`) and ships no `.env`. So the callback lands
  on `:3000`/wrong-port (nothing there) and the OAuth-child auto-close watcher
  (runtimePort-only) never fires. Dev-only works because Vite occupies `:3000`.
- This is a code defect, not missing config: no operator value fixes a wrong
  hardcoded base under dynamic ports.

**Proposed correction (minimal, local, no new flows):** SPA sends
`{ returnTo: window.location.origin }`; router uses the state-stored returnTo
(else Origin header, else `clientUrl` fallback), all validated against a
loopback allowlist (http + localhost/127.0.0.1 + configured CLIENT_URL origin)
to block open-redirect token theft. Workspace branch untouched. Error branches
(`access_denied`/`missing_params`) keep current behavior (documented
limitation).

### Phase 2–3 Record (complete 2026-10-24)

Implemented exactly as proposed above (4 files):
- `oauth-service.ts` (+37): `resolveSafeReturnBase()` allowlist validator.
- `oauth-router.ts` (+17/−1): product branch returnTo → Origin → clientUrl.
- `product-login.ts` (+5/−1): SPA sends its origin.
- Incidental one-word pre-existing lint cleanups in two touched files
  (`let`→`const` keyId; bare `catch`), behavior-neutral, reported.
- One self-inflicted mid-file test insert (split a describe; transform error)
  reverted via `git checkout --` of that test file (only my own minutes-old
  edit discarded) and re-applied cleanly at EOF.

Verification (exact): 3 redirect tests (dynamic loopback, evil→fallback,
javascript→fallback) + 3 validator tests, all on the real router + ephemeral
backend + stubbed Google token endpoint + real RS256 JWKS.
`npm run test:port`: **28 files / 239 tests pass** (6 new; pre-existing
redirect test unchanged and green). `npx tsc -b`: 0. ESLint on all 4 touched
files: 0. `npm run build:server`: 0; packaged-bundle gate 3/3.
`git diff --check`: clean. Interactive Google consent genuinely untested (no
test account/credentials — stated, not claimed).

## Final Verdict

**`PRODUCT_IDENTITY_OAUTH_CORRECTION_COMPLETE`** — see Phase 4 below.
