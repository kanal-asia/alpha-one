# TASK-ALPHA-SUBSCRIBER-025 — Agent-Driven Interactive OAuth E2E Completion

**Status:** COMPLETE — stopped at human-only Google auth gate; TASK-023 verdict unchanged (created 2026-10-30 per `spint/TASK-WORKFLOW.md`)
**Priority:** P0 — Product Identity E2E
**Type:** Read-only audit + capability discovery + E2E completion attempt
**Predecessor:** TASK-ALPHA-SUBSCRIBER-023 (`PRODUCT_IDENTITY_PACKAGED_RUNTIME_VERIFIED_INTERACTIVE_BLOCKED`)
**Pinned source:** `3a02c6e367708b8157bbe015eeefdea430e5a925`
**Artifact:** `alpha-one-windows-3a02c6e` (run `41031835852`),
SHA-256 `c3563367ae6168c3c406a539f65cf7ce1d2899cf453df6b2110e02bd4f106395`
**Target verdict:** `PRODUCT_IDENTITY_OAUTH_BROKER_INTERACTIVE_E2E_VERIFIED`
(requires real consent + complete callback/redemption chain — never simulated)
**Canonical path:** `spint/TASK-ALPHA-SUBSCRIBER-025.md`

## Objective

Complete the remaining interactive E2E using agent-accessible VPS and
Windows/local capabilities; update TASK-023 in place with evidence and final
verdict. If Google requires an approval/credential/MFA action unavailable to
the agent: stop at that exact gate, record the precise blocker and the
smallest human authorization needed, and continue all other agent-executable
verification.

---

## Execution Record (completed 2026-11-03)

### R1. Phase 1 — VPS broker readiness audit (READ-ONLY, all checks pass)

| Check | Result (2026-11-03T03:05-03:06Z) |
|---|---|
| Services | `alpha-infra.service` active, `kanal-backend.service` active |
| Health | local `{"ok":true}` 200; public `https://alpha.kanal.asia/health` 200 |
| Config (names/fingerprints only) | `GOOGLE_CLIENT_ID` fp `92ae8361a881`; `GOOGLE_CLIENT_SECRET` present (value never read); `GOOGLE_OAUTH_REDIRECT_URI` fp `5ba272cc69bc`; `CLIENT_URL` fp `375293d07a3f`; `GOOGLE_OAUTH_PRODUCT_REDIRECT_URI` absent (derived) |
| Callback consistency | derived product callback == `https://alpha.kanal.asia/api/google/oauth/product/callback` == registered (live probe -> Google "Sign in", no `redirect_uri_mismatch`) |
| Routes deployed/reachable (non-mutating probes) | `POST .../product/login` invalid returnTo -> **400 LOGIN_RETURN_INVALID** (rejected before any transaction write); `GET .../product/callback` unknown state -> **302 `login_state_invalid`** (read-only lookup); `POST .../product/complete` forged code -> **403 AUTHENTICATION_INVALID** (zero-row guarded update) |
| DB state | `product_login_tx` **empty** after probes — audit caused zero mutation |
| Logs | `[product-oauth]` events in window = only this audit's 3 sanitized probes (`return_invalid`, `state_invalid`, `redemption_invalid`); zero service errors in 24h |
| VPS checkout | clean at `790f5b3`, `origin/main` in sync |

### R2. Phase 2 — Agent capability discovery

| Capability | Result |
|---|---|
| Interactive Windows desktop/session | **None** (Linux `kanal-prod-01`; no RDP/WinRM/VNC listeners) |
| Browser automation / computer use | **AVAILABLE** — `google-chrome` + Playwright 1.59.1 on the VPS host |
| Authorized test-account access | **None** — Chrome profile empty (Crash Reports only; no Local State/cookies/session); 0 test-account env vars; no references in env/docs |
| Artifact retrieval | **Available** — authorized git credential bridge (value never printed); artifact re-verified |
| Agent can complete real consent unaided? | **No** — Google consent requires authenticating a Google account (password + possible MFA/approval) |

### R3. Phase 3 — E2E execution to the exact gate

Executed the real chain agent-side (no simulation of any kind):

1. Real VPS broker login -> `200 {transactionId(22), redemptionSecret(43)}`;
   authorize URL: `accounts.google.com`, `redirect_uri=https://alpha.kanal.asia/api/google/oauth/product/callback`,
   scope `openid email profile`, PKCE S256.
2. Headless **real Chrome** (Playwright `channel: chrome`) navigated to the
   authorize URL -> landed on `accounts.google.com/v3/signin/identifier`,
   title **"Sign in - Google Accounts"**, page shows **"Sign in with Google to
   continue to alphaone"** (our OAuth client branding) + "Email or phone" form.
3. **STOP at the exact gate:** account authentication. Not bypassed, not
   simulated, not weakened. Sanitized evidence only (emails redacted in
   captured text; no cookies/tokens/codes recorded).

**Smallest human authorization needed:** one interactive Google sign-in for
the dedicated test account (credential + any MFA/approval) in a
browser session the agent can drive; the agent then completes consent
approval -> VPS callback -> loopback return -> completion redemption ->
verified `sub` session -> gated access -> sign-out -> isolation checks
automatically (Playwright tooling proven present).

### R4. Acceptance criteria (TASK-023 map)

| ID | Status | Evidence |
|---|---|---|
| AC-01 | **PASS** | live registration probe (R1) |
| AC-02 | **PASS** | git evidence (prior + R1) |
| AC-03 | **PASS** | TASK-024 build run 41031835852 |
| AC-04 | **PASS** | SHA-256 re-verified today (R2 + prior R10) |
| AC-05 | **PASS** | CI + independent installed-app inspection (TASK-023 R11) |
| AC-06 | **PASS** | packaged runtime on windows-latest (TASK-023 R12) |
| AC-07 | **PASS** | broker initiation from packaged app (TASK-023 R12) |
| AC-08 | **PARTIAL** | loopback server verified (R12); Google->VPS->loopback callback RETURN awaits the consent gate (R3) |
| AC-09 | **BLOCKED at human-only auth gate** | live Google sign-in page reached by agent-driven Chrome (R3); account authentication required |
| AC-10 | **PARTIAL** | single-use/replay/concurrency security-proven + fail-closed live; full-chain redemption awaits consent |
| AC-11 | **BLOCKED** | needs real login (R3 gate) |
| AC-12 | **BLOCKED** | needs real login (R3 gate) |
| AC-13 | **PASS** | VPS Workspace/Drive isolation verified fresh (prior R5/R14; broker audit shows no Workspace mutation) |
| AC-14 | **PASS** | suite + live fail-closed probes (R1 non-mutating probes today) |

## Final Verdict (TASK-025)

Target `PRODUCT_IDENTITY_OAUTH_BROKER_INTERACTIVE_E2E_VERIFIED` **not
claimable** — real consent did not occur. TASK-023 verdict stands:
**`PRODUCT_IDENTITY_PACKAGED_RUNTIME_VERIFIED_INTERACTIVE_BLOCKED`**, now with
the interactive leg driven by the agent up to Google's account-authentication
boundary and the human-only gate characterized precisely (R3).

### Go-Live impact

Broker, packaging, and the pre-consent chain are production-ready and verified.
Product Identity sign-in go-live remains gated solely on one human
authentication event for the dedicated test account, after which the automated
chain (consent -> callback -> redemption -> session -> logout) can be completed
and recorded by the agent.
