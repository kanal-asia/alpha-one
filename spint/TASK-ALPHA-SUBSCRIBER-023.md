# TASK-ALPHA-SUBSCRIBER-023 — Windows Packaging & Product Identity Interactive E2E

**Status:** COMPLETE — `PRODUCT_IDENTITY_OAUTH_BROKER_PARTIAL` (created 2026-10-30; resumption 2026-10-30 blocked: no Windows execution environment reachable from agent session — see Resumption section)
**Priority:** P0 — Product Identity Release Verification
**Type:** Packaging + Security Verification + Interactive E2E
**Predecessor:** TASK-ALPHA-SUBSCRIBER-022 (`PRODUCT_IDENTITY_OAUTH_BROKER_PARTIAL`)
**Implementation Commit:** `3a02c6e367708b8157bbe015eeefdea430e5a925`
**Target:** Alpha One Windows Desktop + Production VPS OAuth Broker
**Canonical path:** `spint/TASK-ALPHA-SUBSCRIBER-023.md`

## 1. Objective

Prove Google Product Identity login end-to-end on the packaged Windows
installer: Installer → Packaged Desktop → VPS OAuth Broker → Google Consent →
VPS Callback → Desktop Completion Redemption → Product Identity Session.

No re-implementation of the TASK-022 broker. Target verdict
`PRODUCT_IDENTITY_OAUTH_BROKER_INTERACTIVE_E2E_VERIFIED` only when AC-01…AC-14
are ALL proven with their required evidence class (interactive evidence cannot
be substituted with unit tests).

## 2. Environment note (execution scope)

This session executes on the production VPS (`/root/alpha-one`, Linux —
kanal-prod-01). Per TASK-ALPHA-AUTH-003 (proven, fail-closed) Windows
packaging cannot run here and the brief forbids substituting VPS packaging
(`§4.2`). Therefore:

- **Phase 1 (Google OAuth configuration verification)** — executed here (VPS
  config + live OAuth initiation/callback probes; the brief explicitly
  requires live probes instead of trusting the operator report).
- **Phase 2 (Windows build), Phase 3 (packaged runtime), Phase 4 (interactive
  consent)** — require the Windows builder `C:\dev\alpha-one` + operator with
  the dedicated test account; handed off with exact commands/prerequisites.
- **Phase 5 (Workspace/Drive regression)** — VPS-side smoke + isolation
  evidence executed here.

Baseline, config, and live-probe findings below are recorded first-hand.

## 3. Acceptance criteria map (status filled in Execution Record)

| ID | Kriteria | Evidence class | Status |
|---|---|---|---|
| AC-01 | Product callback registered, no mismatch | Live Google authorization | **PASS** (R2) |
| AC-02 | Source == TASK-022 implementation commit | Git evidence | **PASS** (R1) |
| AC-03 | Windows installer built | Build log (Windows builder) | NOT EXECUTED (R3/R4) |
| AC-04 | Installer SHA-256 recorded | Artifact hash | NOT EXECUTED (R3/R4) |
| AC-05 | No client secret in installer | Artifact inspection | NOT EXECUTED (R3/R4) |
| AC-06 | Packaged runtime runs | Runtime evidence (Windows) | NOT EXECUTED (R3/R4) |
| AC-07 | Desktop uses VPS broker | Network/runtime evidence | NOT EXECUTED (R3/R4) |
| AC-08 | Dynamic loopback callback works | Callback evidence (Windows) | NOT EXECUTED (R3/R4) |
| AC-09 | Google consent succeeds | Interactive evidence | NOT EXECUTED (R3/R4) |
| AC-10 | Completion redemption exactly once | Broker + desktop evidence | NOT EXECUTED (R3/R4) |
| AC-11 | Product Identity session formed | Application evidence | NOT EXECUTED (R3/R4) |
| AC-12 | Logout clears session | Session verification | NOT EXECUTED (R3/R4) |
| AC-13 | Workspace/Drive no regression | Compatibility smoke | **PASS** (R5) |
| AC-14 | Replay/invalid redemption rejected | Security evidence | **PASS** (R6) |

## 4. Constraints (from brief)

No OAuth client creation; no Workspace/Drive changes; no `.env` changes without
approval; no destructive DB ops; no auth refactors; no redeploy without server
changes; no `git add .`; no E2E claims from simulation.

---

---

## Execution Record (completed 2026-10-30, VPS execution session)

### R1. Baseline (AC-02)

- VPS HEAD `a65bbd0ca885a85a3ab9e5d90655b9b98f72286e` == `origin/main`; tree
  clean (`## main...origin/main`).
- Implementation commit `3a02c6e367708b8157bbe015eeefdea430e5a925` verified
  (exact hash + subject) and is an ancestor of HEAD; code delta
  `3a02c6e..HEAD` is **docs-only** (`spint/TASK-ALPHA-SUBSCRIBER-022.md`) —
  the buildable source is implementation-identical to TASK-022.
- Local Windows `C:\dev\alpha-one` HEAD is not readable from this session;
  the builder session must confirm it at Phase 2 start (expected: `a65bbd0`
  or `3a02c6e` — code tree identical).

### R2. Google OAuth configuration verification (Phase 1) — AC-01

VPS config (values never printed; fingerprints are SHA-256/12 for change
detection):
| Item | Finding |
|---|---|
| `GOOGLE_CLIENT_ID` | present, len 72, fp `92ae8361a881` — matches the authorize URL client exactly (boolean comparison; suffix `…rcontent.com`) |
| `GOOGLE_CLIENT_SECRET` | present, len 35, fp `11ed2e86cff5` (first fingerprint record; no prior recorded value exists to diff — future change detection baseline) |
| Workspace callback | `https://alpha.kanal.asia/api/google/oauth/callback` — present, unchanged |
| Product callback (derived) | `https://alpha.kanal.asia/api/google/oauth/product/callback` |
| Secret-to-desktop | none (TASK-022 code proof stands; delegation returns only `{url}`) |
| `.env` | untouched (sha256 `a349bb9c…` identical before/after) |

Live OAuth initiation (production broker): `POST /api/google/oauth/product/login`
→ 200; authorize URL host `accounts.google.com`; `redirect_uri` =
`https://alpha.kanal.asia/api/google/oauth/product/callback`; scope
`openid email profile` (no Workspace scopes); **PKCE S256** with 43-char
challenge; state 43 chars + nonce 43 chars (both broker-generated);
**no `access_type`** (no refresh token ever requested); client id in URL
== VPS `GOOGLE_CLIENT_ID` (same client, single `alpha-workspace` client —
Console label is operator-attested; id-level consistency proven).

**Live registration probe (the decisive AC-01 evidence):** Google authorize
request with the product callback URI now lands on
`accounts.google.com/v3/signin/identifier` (**Sign in — no error**). The
`Error 400: redirect_uri_mismatch` recorded in TASK-022 §R7 is **RESOLVED** —
operator registration confirmed first-hand, not taken on report. Control
probe with the Workspace callback URI → Sign in (registered, unchanged).

Live callback probe: unknown state → `302 …?product_login_error=login_state_invalid`
(broker state binding enforced).

### R3. Windows build (Phase 2) — NOT EXECUTED here (builder handoff)

Fresh fail-closed evidence on this host (consistent with
TASK-ALPHA-AUTH-003): `engines.node = 26.5.0` exact vs VPS `v22.23.2`;
`npm run prepare:runtime` → `FAILED: Unsupported builder platform:
linux/x64. Windows x64 is required.`; no `wine` (no cross-build fallback);
runbook `docs/RELEASE_WINDOWS.md` mandates the Local Windows builder. Brief
§4.2 forbids VPS substitution. **Operator handoff — exact command sequence on
`C:\dev\alpha-one`:** `git fetch && git checkout 3a02c6e` (verify HEAD) →
`npm ci` → `npm run build:windows` → `npx electron-builder build --win` →
record `release\AlphaOne-Setup.exe` size + SHA-256 + `node --version`.

AC-03/AC-04/AC-05: not executed (no artifact exists to hash/inspect).
Source-level defaults verified in place for the future inspection: broker
delegation is the default (`PRODUCT_OAUTH_LOCAL_EXCHANGE` unset → VPS broker;
no silent local fallback), bundled client id is the PUBLIC id only
(`src/lib/google-client-id.ts`), no secret/`.env` references in any desktop
bundle input (TASK-022 secret scan stands).

### R4. Packaged runtime + interactive (Phases 3–4) — NOT EXECUTED

Depend on the Windows installer (Phase 2) and on operator-approved dedicated
Google test-account consent. Per brief, interactive claims are forbidden
without them — AC-06…AC-12 remain unproven. Session/logout/replay mechanics
have TASK-022 unit/security proofs (29/29) which the brief explicitly
disallows as substitutes for interactive evidence.

### R5. Workspace/Drive regression (Phase 5) — AC-13

| Check | Result |
|---|---|
| Workspace `POST /google/oauth/start` | 200 — Workspace callback URI intact, Drive scopes present, PKCE S256 (probe session created then removed) |
| Drive proxy `GET /google/drive/files` | 200 live data |
| Release manifest | 200 local + public |
| `google_connections` metadata | digest `e1ff181074ab` **identical before/after** (4 rows) |
| `google_connections_credentials` | 1 row, same identity (`local-user` / provider sub / email), `status=active`, same `connected_at`, refresh_token intact, full Workspace scope list intact; digest moved `0122dcc0fe89 → 02313b045993` **because the Drive smoke call triggered the standard access-token refresh** (`token_expiry` rolled forward) — normal Workspace rotation, not a product-identity side effect |
| Product probes side effects | only `product_login_tx` (1 pending probe row, TTL self-cleanup) |
| Logout/Product isolation (code evidence) | `sign-out-dialog.tsx:21-22` clears only the in-memory product token + auth store; product flow writes only `product_login_tx`; Workspace tables untouched by product code paths |

### R6. Completion replay / invalid redemption (AC-14)

Live (production): invalid completion code, wrong secret, and malformed code
all → `403 AUTHENTICATION_INVALID` (TASK-022 §R5 live matrix); state replay
→ `login_state_invalid` (re-probed today). Security-test class satisfied by
TASK-022 suite: single-use redemption, replay rejection, wrong-secret
rejection, expired-code rejection, **atomic concurrent redemption (exactly
one of two wins)**. Full same-code live replay chains on a real interactive
redemption (AC-09) and will be re-confirmed there.

### R7. Required report index (brief §9)

1. Baseline `a65bbd0`; installer source commit = `3a02c6e` (code-identical tree) — R1.
2. Git: HEAD == `origin/main`, clean, ancestor check — R1.
3. OAuth config + live probes — R2 (registration RESOLVED, first-hand).
4–7. Build/artifact/runtime: **not executed** — builder handoff — R3/R4.
8–10. Interactive/sub/session: **not executed** — R4.
11. Replay: R6.
12. Workspace/Drive regression: R5.
13. AC status: AC-01 PASS · AC-02 PASS · AC-03/04/05/06/07/08/09/10/11/12 NOT
    EXECUTED (Windows builder + test account) · AC-13 PASS · AC-14 PASS
    (security-test class; interactive re-confirmation chained to AC-09).
14. Remaining blockers: (a) Windows builder packaging + packaged runtime
    verification (owner: operator on `C:\dev\alpha-one`); (b) dedicated
    Google test account + consent for interactive E2E (owner: founder/operator).

## Final Verdict

**`PRODUCT_IDENTITY_OAUTH_BROKER_PARTIAL`**

New hard evidence vs TASK-022: the Google Console blocker is **resolved** —
the product callback is registered and live-verified (AC-01), with the VPS
broker configuration consistent end-to-end (AC-02) and Workspace/Drive
regression clean (AC-13). Not achieved: Windows installer build/inspection
(AC-03…AC-05), packaged runtime (AC-06…AC-08), and interactive consent
(AC-09…AC-12) — these cannot execute from the VPS and must not be simulated.

**Exact next action (operator):** on the Windows builder `C:\dev\alpha-one`
at code-identical commit `3a02c6e`, run `npm ci && npm run build:windows &&
npx electron-builder build --win`, record installer SHA-256, perform the
artifact secret inspection (§4.3), install/run, then complete the interactive
Google consent with the dedicated test account (Phase 4 checklist §6) —
targeting `PRODUCT_IDENTITY_OAUTH_BROKER_INTERACTIVE_E2E_VERIFIED`.

---

## Resumption Attempt (2026-10-30, second session) — ENVIRONMENT ACCESS LIMITATION

**Mission:** resume Phases 2–5 on the Windows builder `C:\dev\alpha-one`.
**Outcome:** executed Phase 1 environment inspection per the stop-branch;
Phases 2–5 **cannot execute from the available agent environment**. No
substitution (Linux/Wine/VPS packaging) was attempted, per instruction.

### Environment inspection evidence (first-hand)

| Inspection | Result |
|---|---|
| Session host | Linux `kanal-prod-01` (kernel 6.8.0-147, Ubuntu) — not Windows |
| SSH access | `github.com` only (`/root/.ssh/config`); no Windows host in `known_hosts` |
| CI workflows | `.github/workflows/ci.yml` = `ubuntu-latest` + Node 20 lint/test/build; **no Windows job, no packaging job** (`stale.yml` irrelevant) |
| GitHub Actions history (public API) | 126 runs, all `Continuous Integration`/`Close inactive issues` — no Windows packaging runs exist |
| Virtualization | no qemu, no VirtualBox, docker daemon Linux-only — no path to run Windows locally |
| Network reachability | WireGuard `wg0` (single peer `10.66.66.2/32`) scanned for RDP 3389 + WinRM 5985 across `10.66.66.0/24`: **zero open listeners**; no SMB/WinRM/RDP targets configured in `/etc/hosts` |
| Builder access method in repo docs | none — `docs/RELEASE_WINDOWS.md` presumes execution *on* the Windows machine |
| Prior Windows builds (TASK-019 record) | performed by an agent session running **on** `C:\dev\alpha-one` (Windows `vite`/`Alpha One.exe` processes managed there) — the builder is a separate host, reached by running the agent there, not remotely |

**Root cause of the resumption block:** this agent session has no execution
path to any Windows host — an agent-topology limitation, not a source or
implementation defect. TASK-ALPHA-AUTH-003's fail-closed gates re-confirmed
fresh (`prepare:runtime` → `Unsupported builder platform: linux/x64`;
`engines.node 26.5.0` exact vs VPS Node v22.23.2; no wine).

### AC status after resumption (unchanged by this attempt)

AC-01/02/13/14 remain **PASS** (evidence in R1/R2/R5/R6 above).
AC-03…AC-12: **NOT EXECUTED** — Windows execution environment unreachable
from the agent session; interactive consent additionally requires the
dedicated test account. No simulation, no substituted evidence.

### Required to unblock (owner actions)

1. **Run the coding agent session on the Windows builder host** (as
   TASK-019's session did): `C:\dev\alpha-one`, Node v26.5.0 exactly,
   then Phase 2–4 commands of this brief (`npm ci` → `npm run build:windows`
   → `npx electron-builder build --win` → artifact inspection → install/run).
2. **Founder/operator:** provide/approve the dedicated Google test account
   for the Phase 5 interactive consent (credentials never via chat/logs/task
   files).
3. Optional structural fix: register a self-hosted Windows runner and add a
   packaging job to CI so future release builds are agent-executable.

### Verdict after resumption

**`PRODUCT_IDENTITY_OAUTH_BROKER_PARTIAL`** (unchanged) — AC state identical
to the first execution (01/02/13/14 PASS; 03–12 unexecuted). The resumption
adds conclusive diagnosis: the remaining phases require an agent session on
the Windows builder; no reachable Windows execution environment exists from
this session's topology.
