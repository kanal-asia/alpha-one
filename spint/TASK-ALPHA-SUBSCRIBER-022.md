# TASK-ALPHA-SUBSCRIBER-022 — Product Identity: VPS OAuth Broker Implementation

**Status:** COMPLETE — `PRODUCT_IDENTITY_OAUTH_BROKER_PARTIAL` (created 2026-10-30 per `spint/TASK-WORKFLOW.md`)
**Priority:** P0 — Product Identity
**Type:** Implementation + Verification + Deployment
**Predecessor:** TASK-ALPHA-SUBSCRIBER-021 (`PRODUCT_IDENTITY_ARCHITECTURE_READY_WITH_BLOCKERS`)
**Baseline:** `465aea29df647cdc45d37cb6b28d7e821b88941e` — verified: branch `main`,
tree clean, `origin/main` == HEAD (exact match to the expected baseline).
**Repository:** `C:\dev\alpha-one` (execution environment: VPS checkout
`/root/alpha-one` at the same commit — identical tree; Windows-only phases are
operator handoff, see §Execution Notes)
**VPS:** `/root/alpha-one`, `alpha-infra.service`, port `3002`, `https://alpha.kanal.asia`

## 1. Objective (from brief)

Implement the Google Product Identity OAuth Broker with the VPS as owner of the
OAuth exchange. Desktop can sign in with Google without ever receiving
`GOOGLE_CLIENT_SECRET`. VPS owns authorization + token exchange; callback
returns to VPS; VPS issues a single-use completion code bound to a desktop
redemption secret; desktop redeems it for the verified Google ID token.
Product Identity session keeps the existing mechanism (in-memory, token expiry,
existing `checkAccountAccess`). Workspace/Drive OAuth unchanged.

**Principle:** Product Identity and Workspace Identity are two separate
contracts. Never merge them.

## 2. Design decisions (resolving brief details, all evidence-based)

1. **Redemption secret origin (TASK-022 A1):** VPS generates the 256-bit
   redemption secret at login and returns it exactly once over TLS; VPS stores
   only its SHA-256 hash. (Refines TASK-021's desktop-generated-secret
   variant; same binding property — the secret known only to the initiating
   desktop runtime.)
2. **Completion code format:** `<transactionId>.<randomCode>` (both parts
   random, ≥128-bit each). Embedding the transaction id preserves the existing
   SPA contract (`?product_login=<code>` → `POST /login/complete {code}`)
   **unchanged** while letting the desktop runtime bind code → its in-memory
   secret. The code value alone is useless without the secret.
3. **Atomic single-use redemption:** SQLite (`node:sqlite`, existing
   persistence) with a single guarded `UPDATE … WHERE status='completed' AND
   code_hash=? AND secret_hash=? AND expires_at>? RETURNING …` — inherently
   atomic statement; also safe under concurrent requests (proven by test).
   NOT an in-memory map (multi-process unsafe per brief).
4. **Nonce (OIDC):** broker authorize request carries a `nonce`; the callback
   verifies the ID token's `nonce` claim matches the transaction
   (`google-id-token.ts` gains an optional `expectedNonce` argument — additive,
   existing callers/tests unchanged). The legacy local exchange keeps its
   current no-nonce behavior (unchanged tests).
5. **Desktop mode switch:** Product endpoints delegate to the VPS broker by
   default (packaged app ships no env — broker must be the default). Legacy
   local exchange stays available for offline/dev/tests via
   `PRODUCT_OAUTH_LOCAL_EXCHANGE=1` (existing tests keep proving it).
6. **Audience on packaged desktop:** the verifier needs `GOOGLE_CLIENT_ID` as
   audience. The public client id (not a secret) is bundled as a fallback
   constant applied at desktop server startup (`src/lib/google-client-id.ts`,
   env still wins). `GOOGLE_CLIENT_SECRET` is never bundled, never sent.
7. **Product redirect URI (VPS):** derived as
   `GOOGLE_OAUTH_PRODUCT_REDIRECT_URI` (optional env) or the
   `GOOGLE_OAUTH_REDIRECT_URI` origin + `/api/google/oauth/product/callback`.
8. **returnTo policy:** strict TASK-017 loopback allowlist
   (`http(s)` + `localhost`/`127.0.0.1`/`[::1]`) at broker login — non-loopback
   rejected `400 LOGIN_RETURN_INVALID` (brief: "Tolak URL non-loopback").
   Shared policy module `src/lib/oauth-return-policy.ts` (single source of
   truth; `resolveSafeReturnBase()` keeps its exact behavior/tests).
9. **No refresh token:** the authorize request does not use
   `access_type=offline`; no Google refresh token is requested, issued to the
   desktop, or stored as a Product Identity credential.
10. **Audit logging:** structured `console.info('[product-oauth] …')` with
    allowlisted fields only (event, tx prefix, sub prefix, ip, reason). Never
    codes/secrets/tokens.
11. **Rate limiting:** fixed-window per-IP limiter on `login`/`complete`
    (default 30/5min; env-tunable for tests) and a generous cap on `callback`.
12. **TTL:** login transactions and completion codes share a 10-minute window
    from login creation; expired transactions are lazily rejected and
    periodically deleted.

## 3. Endpoint contract (VPS, mounted at `/google/oauth/product`, public
`https://alpha.kanal.asia/api/google/oauth/product/*` via existing Caddy)

- `POST /login` `{returnTo}` → `200 {url, transactionId, redemptionSecret}`;
  errors `400 LOGIN_RETURN_INVALID`, `429 RATE_LIMITED`,
  `503 AUTH_PROVIDER_NOT_CONFIGURED`.
- `GET /callback` (`code`,`state` or `error=`) → `302 {returnTo}/sign-in?product_login=<code>`
  or `?product_login_error=login_state_invalid|login_denied|login_exchange_failed|login_identity_invalid`.
- `POST /complete` `{code, redemptionSecret}` → `200 {identity{productUserId,email,name,picture}, idToken, expiresIn}`;
  errors `403 AUTHENTICATION_INVALID`, `429 RATE_LIMITED`,
  `503 AUTH_PROVIDER_NOT_CONFIGURED`.

Desktop keeps its SPA contract: `POST /api/google/oauth/login` → `{url}`;
`POST /api/google/oauth/login/complete` → `{identity, idToken, expiresIn}`.

## 4. Scope checklist (from brief §3–§4)

Broker: state/PKCE/nonce/secret binding, strict state validation, server-side
exchange, server-side ID-token verification (sig/iss/aud/exp/nonce), `sub` as
identity, single-use atomic completion, loopback-only return, no secrets in
URLs/logs. Desktop: delegation, in-memory secret only, dynamic loopback kept,
TASK-017 policy kept, existing session lifecycle kept. Compatibility: Workspace
OAuth/Drive/sessions/Subscriber APIs/`ALPHA_AUTH_ENFORCE`/`checkAccountAccess`
untouched; additive-only schema (`CREATE TABLE IF NOT EXISTS product_login_tx`);
no migration.

## 5. Acceptance criteria map

AC-01…AC-14 per brief §6 (implementation/test/deploy evidence appended in
§Execution Record; packaged + interactive phases status per §Execution Notes).

## 6. Execution Notes (environment)

This session executes on the VPS checkout (same commit tree as
`C:\dev\alpha-one`). Phases 1–3 (implement, test, Git, VPS deploy) are executed
here. Phase 4 (Windows installer build) requires the canonical Windows builder
(`C:\dev\alpha-one`, Node 26.5.0; VPS build is fail-closed per
TASK-ALPHA-AUTH-003 evidence) — operator handoff. Phase 5 (interactive E2E)
requires the Google test account + Console registration — operator/founder
prerequisites.

---

---

## Execution Record (completed 2026-10-30)

### R1. Baseline & implementation

- Baseline `465aea2` verified (branch `main`, clean, `origin/main` match) before
  any change. Workspace/Product Identity code inspected (§A evidence in
  TASK-021 re-validated at baseline).
- **Implementation commit:** `3a02c6e367708b8157bbe015eeefdea430e5a925`
  `feat(subscriber): VPS-owned Google product identity OAuth broker` — 16 files,
  +2071/−25.

Files changed:
| File | Change |
|---|---|
| `src/server/product-oauth-broker.ts` (new) | VPS broker router: login/callback/complete, PKCE+nonce, rate limiter, audit |
| `src/server/product-oauth-store.ts` (new) | SQLite `product_login_tx` (additive), atomic guarded UPDATE+RETURNING redemption |
| `src/services/google/product-oauth-broker-client.ts` (new) | desktop delegation client + in-memory redemption-secret map |
| `src/lib/oauth-return-policy.ts` (new) | shared TASK-017 loopback allowlist (single source of truth) |
| `src/lib/google-client-id.ts` (new) | bundled PUBLIC client id (verifier audience fallback) |
| `src/server/product-oauth-broker.test.ts` (new) | broker security matrix (21 tests) |
| `src/services/google/oauth-router-broker-delegation.test.ts` (new) | desktop delegation contract (8 tests) |
| `src/server/alpha-infra-server.ts` | +14 additive (import + mount `/google/oauth/product` + cleanup hook) |
| `src/server/alpha-server.ts` | +5 (client-id fallback bootstrap; restore `createSubscriptionRouter` import) |
| `src/services/google/oauth-router.ts` | product branches delegate to broker (default); legacy local behind `PRODUCT_OAUTH_LOCAL_EXCHANGE=1` |
| `src/services/google/oauth-service.ts` | `resolveSafeReturnBase` delegates to shared policy (behavior preserved; tests green) |
| `src/services/opencode/google-id-token.ts` | optional `expectedNonce` + `nonce` claim (additive) |
| `src/lib/sqlite-persistence.ts` | `export` on `getDb` (1 line) |
| `src/services/google/oauth-router-product-login.test.ts` | +5 (local-mode env pin) |
| `vitest.node.config.ts` | +2 includes |
| `spint/TASK-ALPHA-SUBSCRIBER-022.md` | this file |

### R2. Endpoint + flow summary

- VPS (public via Caddy `/api/*` strip): `POST /api/google/oauth/product/login`
  → `{url, transactionId, redemptionSecret}`; `GET .../product/callback` →
  302 loopback `returnTo` with `product_login=<tx>.<code>`;
  `POST .../product/complete` `{code, redemptionSecret}` →
  `{identity{productUserId=sub,…}, idToken, expiresIn}`.
- Desktop: SPA contract unchanged (`{url}`, then `{identity, idToken,
  expiresIn}`); redemption secret held in runtime memory only (never in SPA,
  never on disk — proven by test); session = existing in-memory ID token +
  `checkAccountAccess`. No `GOOGLE_CLIENT_SECRET` anywhere on desktop.
- Secret-generation refinement vs TASK-021: VPS-issued secret (brief A1) —
  stored server-side as SHA-256 hash; completion code embeds the transaction
  id so the SPA contract stays unchanged.

### R3. Test results

| Suite | Result |
|---|---|
| `src/server/product-oauth-broker.test.ts` | **21/21** |
| `src/services/google/oauth-router-broker-delegation.test.ts` | **8/8** (incl. secret-never-persisted) |
| `oauth-router-product-login.test.ts` (legacy local flow) | 21/21 |
| `google-id-token.test.ts` + `auth-context.test.ts` | 28/28 |
| **Full `npm run test:port`** | **255/268 passed** — the 13 failures are the pre-existing MCP-bundle timeouts (`mcp-servers/*/dist` not built on this host; identical failures recorded before this task in TASK-ALPHA-AUTH-001) |

Security test matrix (all proven in `product-oauth-broker.test.ts` /
delegation suite; ✓ = passing):
| Control | Evidence |
|---|---|
| OAuth state validation (unknown/missing/replayed) | ✓ |
| PKCE S256 (challenge issued, verifier sent server-side) | ✓ |
| OIDC nonce binding (mismatch → `login_identity_invalid`) | ✓ |
| ID token sig/iss/aud/exp + sub-only identity | ✓ (tampered/wrong-aud/no-sub rejected) |
| Callback return allowlist (evil/javascript/malformed → 400; state-bound loopback return) | ✓ |
| Completion single-use + replay rejection | ✓ (unit + live) |
| Redemption-secret binding (code alone unusable) | ✓ |
| Expiry enforcement (state + completion) | ✓ |
| Atomic concurrent redemption (exactly one of two wins) | ✓ |
| Rate limiting (`429 RATE_LIMITED`) | ✓ |
| Safe audit logging (no secret/code/token material) | ✓ |
| No secret persisted by desktop (fs scan) | ✓ |
| No `GOOGLE_CLIENT_SECRET` in desktop sources (secret scan) | ✓ |

### R4. Gates (AC-10)

`npm run test:port` as above · `npx tsc -b` exit 0 · ESLint: **0 problems** on
all new/touched files (7 pre-existing `no-explicit-any` in the untouched
Drive-proxy region of `alpha-infra-server.ts` — byte-identical to baseline
count, not modified per no-unrelated-refactor rule) · `npm run build`
(tsc + vite) exit 0 · `npm run build:server` exit 0.

### R5. VPS deployment (AC-11)

- Pre-deploy: HEAD `3a02c6e` == `origin/main`, tree clean, service active
  (previous runtime: `f48c2b3`, PID 469817), env names present (values never
  printed), `.env` sha256 `a349bb9c…` recorded.
- `git pull --ff-only` → already at target; `npm ci` skipped (no dependency
  drift); `npm run build:server` exit 0; artifact
  `dist/server/alpha-infra-server.js` sha256 `ba7ba99ba20c4dc2be731ed529af562267228d2f4be09870367a121e78d51393`.
- `systemctl restart alpha-infra.service` → **active**, new PID 484981.
- Health: local `127.0.0.1:3002/health` 200 + public `alpha.kanal.asia/health` 200.
- Product routes live (localhost + public via Caddy): `product/login` 200
  (redirect_uri = product callback, scope `openid email profile`, PKCE S256,
  nonce+state 43 chars, **no access_type** → no refresh token ever requested);
  evil returnTo → `400 LOGIN_RETURN_INVALID`; callback unknown state →
  `login_state_invalid`; fake code → `login_exchange_failed` (server-side
  exchange attempted against Google and failed cleanly); **same-state replay →
  `login_state_invalid`**; `product/complete` invalid code / wrong secret /
  malformed → `403 AUTHENTICATION_INVALID`.
- Workspace/Drive compatibility (AC-09): `google/oauth/start` 200 (Workspace
  redirect_uri + Drive scopes intact; probe session removed afterwards);
  `google/drive/files` live 200; `releases/manifest.json` 200 local + public.
- Logs: clean startup; structured `[product-oauth]` audit lines contain only
  tx prefixes, IPs, and reasons — verified visually against every probe.
- `.env` sha256 identical before/after: `a349bb9c…` (no configuration change).

### R6. Phase 4 — Packaged desktop: NOT EXECUTED (operator handoff)

Building the Windows installer requires the canonical Windows builder
(`C:\dev\alpha-one`, Node v26.5.0; VPS build is fail-closed — proven in
TASK-ALPHA-AUTH-003). Pending operator steps: sync to `3a02c6e`,
`npm run build:windows` + `npx electron-builder build --win`, artifact secret
scan, packaged runtime smoke (broker delegation + dynamic loopback return).
AC-12/AC-13 (packaged half) therefore unproven.

### R7. Phase 5 — Interactive E2E: `BLOCKED_EXTERNAL_PREREQUISITE`

- **Google Console probe (hard evidence):** authorize request with
  `redirect_uri=https://alpha.kanal.asia/api/google/oauth/product/callback`
  → **HTTP 400 `redirect_uri_mismatch`** (control probe with the Workspace
  callback URI → Sign-in page = registered). The product callback URI is
  **not yet registered** on the OAuth client.
- Additionally no dedicated Google test account is available in this
  environment.
- Per brief: implementation and technical tests are complete; interactive
  login is explicitly NOT claimed.

### R8. Rollback readiness

- Source rollback: `git checkout 465aea2` + `npm run build:server` +
  `systemctl restart alpha-infra.service` (deterministic; documented).
- Artifact backups: `/tmp/opencode/rollback-dist-465aea2/` (pre-restart dist
  snapshot) and `/tmp/opencode/rollback-dist-39860e4/` (TASK-020 era).
- DB impact of rollback: only the additive `product_login_tx` table remains
  (unused by the old build); no destructive operation was performed.

### R9. Required-evidence index (brief §7)

1. Baseline `465aea2` → final `3a02c6e` (+ docs commit below).
2. File list: §R1.
3. Endpoint + flow summary: §R2.
4. Tests: §R3 (255/268 full suite; 29/29 new).
5. tsc/lint/build: §R4.
6. Security matrix: §R3.
7. Secret scan: clean (simulated test tokens only); live logs verified.
8. Workspace/Drive evidence: §R5.
9. Deployment evidence: §R5.
10. Installer: NOT BUILT (Windows builder required — §R6).
11. Interactive E2E: BLOCKED_EXTERNAL_PREREQUISITE (§R7) with exact evidence.
12. Rollback artifacts + procedure: §R8.

## Final Verdict

**`PRODUCT_IDENTITY_OAUTH_BROKER_PARTIAL`**

Verified complete: VPS broker implementation, desktop delegation, security
matrix (29/29 new tests), all local gates, VPS deployment with live route and
security-rejection evidence, Workspace/Drive compatibility, secret hygiene.
Unproven (named, not claimed): packaged-installer verification (requires the
Windows builder) and interactive Google login (Google Console redirect-URI
registration + dedicated test account — probe evidence in §R7).

**Exact next action (founder/operator):** add
`https://alpha.kanal.asia/api/google/oauth/product/callback` to the authorized
redirect URIs of the existing Google OAuth client and provide the dedicated
test account; then run the Windows-builder Phase 4 package + Phase 5
interactive E2E against commit `3a02c6e`.
