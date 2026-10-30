# TASK-ALPHA-SUBSCRIBER-022 — Product Identity: VPS OAuth Broker Implementation

**Status:** IN PROGRESS (created 2026-10-30 per `spint/TASK-WORKFLOW.md`)
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

## Execution Record (appended during execution)

(to be filled: implementation results, test counts, gates, deployment evidence,
verdict)
