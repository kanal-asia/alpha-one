# TASK-ALPHA-SUBSCRIBER-021 — Product Identity OAuth Desktop-to-VPS Architecture Discovery

**Mode:** Create task → architecture discovery → security review → Git
**Repository:** `C:\dev\alpha-one` (discovery executed on the VPS checkout `/root/alpha-one`, identical commit `f48c2b3` — see §A0)
**Workflow:** LOCAL → GIT → VPS
**Priority:** P1
**Current approved baseline:** `f48c2b3`
**VPS deployment:** TASK-020 — `VPS_SYNC_DEPLOYMENT_VERIFIED`
**Canonical path:** `spint/TASK-ALPHA-SUBSCRIBER-021.md`

## 1. Objective

Determine the safest and smallest architecture for completing Google Product Identity
authentication from the packaged Alpha One desktop application when Google OAuth
credentials are held server-side on VPS.

The discovery must answer:

1. How does the desktop initiate Google authorization?
2. Which component should own the authorization-code exchange?
3. How does the VPS establish and verify Product Identity?
4. How does the desktop receive and retain an authenticated product session?
5. How do authenticated desktop requests reach Subscriber APIs?
6. How are OAuth state, callback, PKCE, replay prevention, and session revocation handled?

The final output is an evidence-backed architecture decision and an
implementation-ready contract. Do not implement the new flow in this task.

## 2. Known facts and constraints

- TASK-017 fixed the desktop callback return URL for dynamic loopback ports.
- TASK-019 proved the correction is present in the packaged Windows artifact and
  that the desktop runtime launches.
- Interactive Google consent remains unverified.
- TASK-020 deployed commit `f48c2b3` to VPS successfully.
- VPS runtime: `/root/alpha-one`, service `alpha-infra.service`, port `3002`.
- VPS `.env` contains the Google OAuth variable names; never read or expose their
  values.
- VPS `alpha-infra-server.ts` currently has Workspace OAuth routes but no proven
  Product Identity exchange endpoint.
- Workspace/Drive OAuth and Product Identity are separate identity and credential
  contracts.
- Google OAuth secrets must remain server-side. Never ship `GOOGLE_CLIENT_SECRET`
  in the Windows app or installer.

Revalidate relevant code facts against the current repository. Do not assume the
deployed VPS contract has changed.

## Status

- [x] Task file created before discovery (write → read back)
- [x] Phase A — Local repository discovery
- [x] Phase B — Architecture alternatives
- [x] Phase C — Security and contract decision
- [x] Phase D — Implementation readiness
- [x] Git finalization

---

## A0. Execution scope note

`C:\dev\alpha-one` (Windows builder) is not reachable from this execution
environment. Discovery was executed against the VPS checkout at
`/root/alpha-one`, which TASK-020 verified is the **identical commit
`f48c2b3e12b1d041062ab2df268e5e220ef0eb4f`** as `origin/main` — same commit
hash means an identical tree. All code references below are validated against
that tree. No VPS configuration, deployment, or service restart occurred.

## A. Phase A — Repository discovery (evidence)

### A1. Repo state

- Branch `main`, HEAD `f48c2b3`, upstream `origin/main`, working tree clean.
- `spint/` gitignored (`.gitignore:51`); task files committed via `git add -f`
  per `spint/TASK-WORKFLOW.md` (read; commit style
  `docs: TASK-xxx <subject> - <VERDICT>`).

### A2. Path corrections vs task brief

- `src/services/alpha-infra-server.ts` → actual: **`src/server/alpha-infra-server.ts`**
- `src/services/google/google-id-token.ts` → actual: **`src/services/opencode/google-id-token.ts`**
- `getProductAuthHeaders()` exists: `src/features/ai/opencode/services/http-transport.ts:330`.

### A3. Current Product Identity flow (desktop, all local)

| Step | Component | Evidence |
|---|---|---|
| Initiate | SPA `startProductLogin()` POSTs `/api/google/oauth/login` `{returnTo: window.location.origin}` | `product-login.ts:25-36` (TASK-017) |
| Authorize URL | `oauth-router.ts` `POST /login` → `generateProductLoginUrl()`: `openid email profile` ONLY, PKCE S256, `redirect_uri` from **local** `GOOGLE_OAUTH_REDIRECT_URI` | `oauth-service.ts:455-472` |
| State store | Local JSON files `DATA_ROOT/.alpha/google/login-states/<state>.json` (state, codeVerifier, returnTo, createdAt); 10-min TTL; single-use | `oauth-service.ts:383-426` |
| Callback | `GET /api/google/oauth/callback` (shared with Workspace, state-routed) → token exchange POST `oauth2.googleapis.com/token` **with local `GOOGLE_CLIENT_SECRET`** | `oauth-service.ts:497-521`, `oauth-router.ts:116-170` |
| Verify | `verifyGoogleIdToken(id_token)`: RS256 vs Google JWKS, `iss=accounts.google.com`, **`aud=GOOGLE_CLIENT_ID`** (local env), exp; canonical id = `sub` | `google-id-token.ts:71-112` |
| Handoff | One-time completion code (10-min TTL, single-use) → 302 `{returnBase}/sign-in?product_login=<code>`; `resolveSafeReturnBase()` loopback allowlist (localhost/127.0.0.1 or exact CLIENT_URL origin) | `oauth-service.ts:446-482`, `oauth-router.ts:141-162` |
| Redeem | SPA POST `/api/google/oauth/login/complete` `{code}` → `{identity{productUserId=sub,…}, idToken, expiresIn}`; code deleted on read | `oauth-service.ts:551-558` |
| Session | `setProductSessionToken(idToken)` — **in-memory only** (`http-transport.ts:303-318`); attached as `Authorization: Bearer` by `productAuthHeaders()`/`getProductAuthHeaders()` | `product-login.ts:57` |
| APIs | Chat `POST /api/opencode/chat/stream` + `GET/POST /api/subscription/*` carry the Bearer; server verifies via `resolveAuthContextAsync` (same JWKS path) + `checkAccountAccess` (suspended/banned → 403) | `auth-context.ts:132-200`, `subscription/router.ts:22-24` |
| Sign-out | `setProductSessionToken(null)` + `auth.reset()` | `sign-out-dialog.tsx:21-22` |

### A4. Current Workspace/Drive flow (VPS — SEPARATE contract)

`src/server/alpha-infra-server.ts` @ `f48c2b3` (unchanged since `39860e4`):
15 routes — `GET /health`; `POST /google/oauth/start` (Workspace scopes, PKCE,
session file `DATA_ROOT/.alpha/infra/sessions.json`); `GET /google/oauth/callback`
(code exchange **on VPS**, identity via `oauth2/v2/userinfo` — NOT ID-token
verification, `alpha-infra-server.ts:344-374`); `GET /google/oauth/status/:sessionId`;
`POST /google/oauth/verify` (returns raw Workspace access/refresh tokens);
`GET /google/connection`; `POST /google/profile/resolve`; `GET /google/access-token`;
`POST /google/activity`; `GET /releases/manifest.json`; `GET /google/people/profile`;
4 × `/google/drive/*`; `GET /downloads/*`.

**Proven: no Product Identity endpoint exists on the VPS.** Workspace identity
(`identities.json`, `google:<sub>` + userinfo) is a different contract (raw
Workspace tokens, broad scopes, `local-user` single-user model) and must not be
repurposed as Product Identity.

### A5. Local secret/config dependency (proven from code)

| Variable | Consumers | Packaged state |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `oauth-service.getConfig()` (URL build), `google-id-token.ts` audience | **Absent** (electron spawn env carries only `PORT/NODE_ENV/ALPHA_DATA_DIR/DIST_DIR/ALPHA_ONE_RESOURCES_PATH`, `electron/main.ts:817-828`; no `.env` shipped) |
| `GOOGLE_CLIENT_SECRET` | code exchange + refresh (`oauth-service.ts:226,511`) | **Absent — must NEVER ship** |
| `GOOGLE_OAUTH_REDIRECT_URI` | authorize URL + exchange | Absent |
| `CLIENT_URL` | redirect fallback (`oauth-router.ts:366-368`) | Absent (TASK-017 returnTo supersedes) |

Consequences proven: `POST /api/google/oauth/login` → **503
AUTH_PROVIDER_NOT_CONFIGURED** in packaged app (TASK-016: expected
fail-closed); `verifyGoogleIdToken` → `GOOGLE_NOT_CONFIGURED` (audience missing)
so **even a received ID token cannot be verified** on a packaged runtime today.

### A6. TASK-017/019 facts revalidated (code + spint records)

- `3e00a5c fix(subscriber): return OAuth callback to the dynamic loopback origin`
  — `resolveSafeReturnBase()` loopback allowlist; SPA sends its origin.
- Packaged runtime binds 3001 or an **OS-allocated alternate port** (proven
  common: 58490/64621, TASK-017 record) — a fixed registered redirect URI on
  the loopback is therefore unreliable by construction.
- Electron OAuth child windows already allow `accounts.google.com` AND
  `alpha.kanal.asia` (`electron/main.ts:1040-1046`), and the child auto-close
  watcher fires when the child returns to `http://127.0.0.1:${runtimePort}/`
  (`main.ts:1124-1137`) — the packaged shell already anticipates a
  VPS-mediated OAuth hop.
- TASK-019 verdict `PACKAGED_REDIRECT_VERIFIED_INTERACTIVE_LOGIN_BLOCKED`:
  interactive consent never exercised (no test account / operator OAuth config).

### A7. Subscriber API transport (question 5 current answer)

`fetch('/api/subscription/status|usage|cancel')` — **relative → local runtime**
(`subscription-status.ts:50`, `use-subscription-usage.ts:28`), mounted at
`alpha-server.ts:29`, identity via `resolveAuthContextAsync` (Bearer Google ID
token), owner = verified `sub`, records in **local** sqlite
(`subscriptions`/`account_status`/`usage_runs` by `owner_sub`,
`sqlite-persistence.ts:287-336`). `ALPHA_AUTH_ENFORCE` untouched; anonymous →
effective Free.

### A8. Reusable contracts inventory

| Candidate | Reusable for Product Identity? | Evidence |
|---|---|---|
| VPS `POST /google/oauth/verify` | **No** — Workspace token handoff, raw tokens, session-id bound to Workspace sessions | A4 |
| VPS `sessions.json` / `identities.json` | **No** — Workspace userinfo identity, single-user model | `alpha-infra-db.ts` |
| Local `login-states` + completion codes | **Pattern yes, instance no** — file store + single-use codes proven by 239 passing tests; storage must move to the credential owner (VPS) | `oauth-service.ts:409-444` |
| `auth-store` cookie token | **No** — legacy mock (`'thisisjustarandomstring'`), not a credential | `auth-store.ts:4` |
| Clerk scaffold | **No** — founder decision: Google OIDC, no Clerk app | `auth-context.ts:19-24` |

---

## B. Phase B — Architecture alternatives

### Option A — VPS-owned OAuth exchange (recommended)

Desktop runtime delegates product login to a **new, dedicated** VPS contract
(§C2). VPS owns `GOOGLE_CLIENT_ID/SECRET`, generates state + PKCE, performs the
code exchange and ID-token verification, resolves the product user (`sub`), and
returns the verified ID token + identity to the initiating desktop runtime via
a one-time completion code bound to a desktop-held secret. Google redirect
target is the VPS (fixed, registerable URI) — dynamic loopback ports are
irrelevant to Google.

- **Security / trust boundary:** client secret never leaves VPS (requirement
  met). Desktop holds only: (a) a per-flow 256-bit redemption secret (memory),
  (b) the verified Google ID token (memory, 1h). VPS is the verifier of record;
  desktop runtime re-verifies the ID token per request (existing
  `auth-context` path).
- **Redirect/callback:** `https://alpha.kanal.asia/api/google/oauth/product/callback`
  (NEW registered URI) → 302 to state-bound loopback `returnTo` with one-time
  code. Electron child window already whitelists both hosts (A6).
- **State/PKCE:** VPS generates and stores state + PKCE verifier (single-use,
  10-min TTL, JSON store per `alpha-infra-db` precedent); desktop additionally
  binds via `redemptionSecret` (hash stored, preimage required at redeem).
- **Session:** verified Google ID token (existing mechanism) — memory-only,
  1h expiry, per-request JWKS verification, revocation via account enforcement
  (existing `checkAccountAccess`) + hard expiry. No refresh token ever on
  desktop.
- **Desktop persistence/secrets:** none — no env, no files, no secret. Only the
  public `GOOGLE_CLIENT_ID` must be embedded at build time (public identifier,
  appears in every authorize URL — not a secret).
- **Backend routes:** 3 NEW VPS endpoints (§C2). Additive; Workspace untouched.
- **DB:** additive VPS stores (product login records + product identity);
  no migration of existing tables.
- **Migration impact:** none — no production product user has ever completed
  login (packaged 503 since inception, A5); dev-only local sessions expire
  (1h tokens, no refresh).
- **Workspace/Drive independence:** complete — separate routes, scopes, stores,
  callback path, and identity contract.
- **Operations:** VPS deploy via TASK-020 procedure; one Console URI
  registration; no operator env additions.

### Option B — Local exchange (rejected)

Keeps exchange in the desktop runtime. Requires `GOOGLE_CLIENT_SECRET` on every
machine — prohibited by constraint and unsupportable in distribution: an
installer/env-embedded OAuth secret is extractable by definition. Windows env
vars do not change this (the value must still be provisioned per machine and is
readable by any local process/user). Additionally, the fixed registered
redirect URI is unreliable under dynamic loopback ports (A6). PKCE does not
rescue it: PKCE protects the code exchange, not the secret distribution, and
this client type ships a secret. **Not viable.**

### Option C — Existing identity/session broker (rejected)

No Product Identity session broker exists (A8): VPS `verify`/sessions are
Workspace, `auth-store` is a mock, Clerk is inert by decision. Reusing the
Workspace broker would merge two identity contracts and import raw Workspace
tokens into the product flow — explicitly forbidden. Building the broker
"elsewhere" would be a duplicate identity system. The only correct broker is a
dedicated VPS product contract = Option A's core. **Nothing to reuse as-is.**

---

## C. Phase C — Security and contract decision

**Decision: Option A — VPS-owned exchange, loopback return, desktop-held
verified ID-token session.** Smallest architecture that satisfies every
security requirement while leaving Workspace/Drive, Subscriber APIs, and the
existing verification path unchanged.

### C1. Sequence diagram (desktop sign-in → authenticated Subscriber API)

```mermaid
sequenceDiagram
    participant SPA as Desktop SPA (loopback origin)
    participant LR as Desktop runtime (alpha-server, loopback)
    participant VPS as VPS alpha-infra (alpha.kanal.asia→:3002)
    participant G as Google

    SPA->>LR: POST /api/google/oauth/login {returnTo: window.location.origin}
    LR->>LR: generate redemptionSecret (256-bit, in-memory map stateId→secret)
    LR->>VPS: POST /api/google/oauth/product/login {returnTo, secretHash}
    VPS->>VPS: validate returnTo loopback-only; generate state + PKCE;<br/>store record (state, pkceVerifier, secretHash, returnTo, 10-min TTL)
    VPS-->>LR: {url, stateId}
    LR-->>SPA: {url}
    SPA->>G: browser navigation to authorize URL<br/>(openid email profile, PKCE S256, redirect_uri=VPS product/callback)
    G-->>VPS: GET /api/google/oauth/product/callback?code&state
    VPS->>VPS: state single-use + TTL + PKCE bind (reject invalid/expired/replayed)
    VPS->>G: POST oauth2.googleapis.com/token (code + client_secret, server-side)
    VPS->>VPS: JWKS-verify id_token (iss/aud/exp); product user = sub;<br/>upsert product identity; mint one-time completion code (bind secretHash)
    VPS-->>SPA: 302 {returnTo}/sign-in?product_login=<code>
    SPA->>LR: POST /api/google/oauth/login/complete {code}
    LR->>VPS: POST /api/google/oauth/product/complete {code, redemptionSecret}
    VPS->>VPS: single-use delete + TTL + secretHash match
    VPS-->>LR: {identity{productUserId=sub,...}, idToken, expiresIn}
    LR-->>SPA: same (existing SPA contract, unchanged)
    SPA->>SPA: setProductSessionToken(idToken) — memory only
    SPA->>LR: POST /api/opencode/chat/stream / GET /api/subscription/* (Bearer idToken)
    LR->>LR: resolveAuthContextAsync (JWKS, aud=embedded public CLIENT_ID)<br/>+ checkAccountAccess (suspended/banned→403)
```

### C2. Endpoint contract proposal (NEW — not existing; VPS `alpha-infra-server.ts`)

Routed via existing Caddy `alpha.kanal.asia/api/*` → strip `/api` → `:3002`.
Called by the **desktop runtime server-side** (no browser CORS exposure).

**1. `POST /google/oauth/product/login`**
- Request: `{ returnTo: string (loopback origin), secretHash: string (base64url SHA-256 of 256-bit desktop secret) }`
- Response 200: `{ url: string, stateId: string }` (authorize URL: `openid email profile`, PKCE S256, `redirect_uri=https://alpha.kanal.asia/api/google/oauth/product/callback`)
- Errors: `400 {code:"LOGIN_RETURN_INVALID"}` non-loopback/unsafe scheme returnTo; `429 {code:"RATE_LIMITED"}`; `503 {code:"AUTH_PROVIDER_NOT_CONFIGURED"}`.

**2. `GET /google/oauth/product/callback`** (Google redirect target)
- Query: `code`, `state` — or `error` (e.g. `access_denied`).
- Success: `302 {returnTo}/sign-in?product_login=<one-time code>` (returnTo = value bound at login; code = 256-bit, single-use, 10-min TTL).
- Failure: `302 {returnTo}/sign-in?product_login_error=<reason>` with
  `login_state_invalid` (bad/expired/replayed state) / `login_denied` /
  `login_exchange_failed` / `login_identity_invalid`. Never leaks codes or tokens.

**3. `POST /google/oauth/product/complete`**
- Request: `{ code: string, redemptionSecret: string }`
- Response 200: `{ identity: { productUserId, email|null, name|null, picture|null }, idToken: string, expiresIn: number }`
  (`idToken` = the verified Google ID token; `productUserId` = verified `sub`.)
- Errors: `401/403 {code:"AUTHENTICATION_INVALID"}` (unknown/replayed/expired code, secret mismatch, unverified token); `429 {code:"RATE_LIMITED"}`; `503 {code:"AUTH_PROVIDER_NOT_CONFIGURED"}`.

### C3. Trust boundary & threat analysis

| Threat | Control |
|---|---|
| Client secret exposure | Secret exists only in VPS `.env` + token-endpoint POST (A5 constraint met) |
| Open redirect / code theft | `returnTo` loopback-only allowlist (localhost/127.0.0.1/[::1], http/https), bound into the VPS state record at login; callback never redirects elsewhere (extends TASK-017 `resolveSafeReturnBase` policy) |
| State fixation / CSRF | State generated server-side by VPS, single-use, 10-min TTL, never accepted from the desktop as identity |
| Auth-code replay / interception | PKCE S256; code single-use; completion code single-use + TTL; **desktop-held `redemptionSecret`** binds redemption to the initiating runtime (hash on VPS, preimage required) |
| Identity spoofing | Identity only from JWKS-verified ID token `sub` (iss/aud/exp); desktop-supplied fields ignored (existing `auth-context` rule); email never identity |
| Workspace/Product confusion | Dedicated routes, callback path, stores, minimal scopes; Workspace contract untouched |
| Token theft on desktop | Memory-only ID token, 1h expiry, never persisted, never logged |
| Brute force | 256-bit codes/secrets + rate limits (C8) |
| Log leakage | Audit fields allowlist (C8); never codes/secrets/tokens/URLs with codes |

### C4. OAuth state and PKCE ownership

VPS generates and owns `state` + PKCE `code_verifier`/challenge (it performs the
exchange). Desktop contributes only `returnTo` + `secretHash` (binding), both
validated/stored at login. All three records single-use with 10-min TTL;
invalid, expired, or replayed values are rejected fail-closed with
`login_state_invalid`.

### C5. Session model

- **Type:** the verified Google ID token (RS256 assertion, `aud = GOOGLE_CLIENT_ID`),
  unchanged from today's mechanism — the local verification path
  (`google-id-token.ts`, `auth-context.ts`) keeps working with zero changes to
  Subscriber/execution guards.
- **TTL:** Google's `exp` (~1h), enforced per request with clock tolerance.
- **Storage:** desktop memory only (`setProductSessionToken`); nothing on disk.
- **Refresh:** none — re-login on expiry (justified: short-lived assertion; a
  refresh mechanism would reintroduce long-lived credentials). Future optional
  VPS renewal endpoint explicitly out of scope.
- **Revocation:** (a) 1h hard expiry; (b) account enforcement at the guard
  (`checkAccountAccess` → `403 ACCOUNT_SUSPENDED/ACCOUNT_BANNED`, existing);
  (c) sign-out clears the in-memory token. No long-lived bearer is issued, so
  no rotation scheme is required — the design satisfies the constraint by
  construction.
- **Scoping:** `aud` binds to this application's client; identity scoped to the
  single verified `sub`.

### C6. Identity mapping rules

- Canonical Product Identity id = **verified Google ID-token `sub`**. Nothing
  else. Never email, never body fields, never Workspace `local-user`, never the
  Drive-OAuth shared id.
- Display claims (`email`, `name`, `picture`) are metadata only.
- VPS product identity store is **separate** from Workspace `identities.json`/
  `google_connections`; the same `sub` value may appear in both contracts but
  they are never cross-read or derived (email equality never proves identity).

### C7. Logout behavior

SPA sign-out (existing `sign-out-dialog.tsx`) → `setProductSessionToken(null)` +
auth-store reset. Server-side: nothing persists to revoke (self-expiring
assertion); account enforcement remains the server-side kill switch. No change
required.

### C8. Rate limiting, abuse, audit

- `product/login`: 5/min per IP, 20/hour per `returnTo`; `product/complete`:
  5/min per IP (codes are single-use regardless).
- Completion code + redemption secret: 256-bit each (unforgeable).
- Audit (structured, stored server-side): `product_login_started/completed/
  failed/rate_limited` with `{ts, stateId[:8], sub[:8]|null, ip, reason}`.
  Never codes, secrets, tokens, or code-bearing URLs.

### C9. Migration & backward compatibility

- **Existing Product Identity users:** none in production (packaged login could
  never complete — A5); dev-only sessions are 1h tokens that expire naturally.
  Zero data migration.
- **Local exchange code** (`oauth-service` product functions) remains for the
  test suite; the product router branches delegate to VPS (one contract).
- **Workspace/Drive:** untouched (separate contract — A4).
- **Anonymous behavior preserved:** `ALPHA_AUTH_ENFORCE` untouched; anonymous
  execution and anonymous `subscription/status` → effective Free unchanged.

---

## D. Phase D — Implementation readiness

| Work item | Scope |
|---|---|
| **Desktop changes** | `oauth-router.ts` product branches delegate `login`/`login/complete` to VPS (`PRODUCTION_BASE_URL` precedent already exists at `oauth-router.ts:264`); in-memory `stateId→redemptionSecret` map; embed public `GOOGLE_CLIENT_ID` at build (e.g. Vite define) for the verifier audience; update product-login tests (VPS-delegation contract tests) |
| **VPS backend changes** | `alpha-infra-server.ts`: 3 new routes (C2) + product login record store + one-time completion store + product identity upsert (additive files/tables per `alpha-infra-db` precedent) + rate limiter + audit lines; `jose` available (dependency present; bundled via `tsup` `noExternal` since `5797127`) |
| **Database/schema** | Additive only (VPS product-login/completion/identity stores). No migration of existing tables. |
| **Google Cloud Console** | **REQUIRED:** add authorized redirect URI `https://alpha.kanal.asia/api/google/oauth/product/callback` to the existing client (Web client, server-side exchange). Founder/operator action. |
| **Operator env** | None new (VPS keeps existing `GOOGLE_*`; desktop needs none) |
| **Test account + human consent** | **REQUIRED** for interactive E2E (standing blocker since TASK-016/019) |

**Smallest implementation sequence (one coherent future task):**
1. VPS: product endpoints + stores + tests (additive, deployable standalone).
2. Desktop: delegation + client-id embed + tests.
3. Console: register the product callback URI (any time before E2E).
4. Build packaged desktop from the implementation commit.
5. Controlled interactive E2E with the dedicated test account (sign-in →
   session → authenticated `/api/subscription/status` → sign-out), then VPS
   deploy via the TASK-020 procedure.

---

## E. Acceptance checklist

- [x] Existing Product Identity and Workspace/Drive flows are separately mapped (A3 vs A4).
- [x] Local OAuth secret dependency is proven from code (A5).
- [x] VPS endpoint inventory is checked against current implementation (A4: 15 routes, no product endpoint).
- [x] At least two viable architecture alternatives are compared (B: A/B/C).
- [x] Recommended architecture is supported by security reasoning (C3–C5).
- [x] Endpoint and session contracts are implementation-ready (C2, C5).
- [x] OAuth state, PKCE, replay, session expiry, and revocation are addressed (C4, C5, C3).
- [x] Desktop never receives Google client secret or raw Google refresh token (C1/C5: only ID token + identity reach the desktop; secret never leaves VPS).
- [x] Implementation dependencies and migration impact are identified (D, C9).
- [x] Canonical task file contains all findings and decision (this file).
- [x] Git finalization is complete (see F).
- [x] No code, VPS, or production changes occur (discovery-only; no service restart; no config edits).

---

## F. Git finalization record

- Task file written before discovery, read back (58 lines), then updated in
  place with findings (per `TASK-WORKFLOW.md` steps 2–5).
- Diff reviewed; staged file: `spint/TASK-ALPHA-SUBSCRIBER-021.md` only
  (`git add -f`, spint gitignored at `.gitignore:51`); `git add .` never used.
- Commit/push recorded below.

## Final Verdict

**`PRODUCT_IDENTITY_ARCHITECTURE_READY_WITH_BLOCKERS`**

**Recommended implementation direction (one line):** implement the VPS-owned
product OAuth exchange contract of §C2 (VPS: 3 additive routes + stores;
desktop: delegate `/login`+`/login/complete` to VPS and embed the public
`GOOGLE_CLIENT_ID`; session = verified Google ID token held in memory exactly as
today) — leaving Workspace/Drive, Subscriber APIs, and enforcement untouched.

**Exact next action:** founder/operator registers
`https://alpha.kanal.asia/api/google/oauth/product/callback` in the Google
Cloud Console for the existing OAuth client and provisions the dedicated Google
test account; then run ONE implementation task on `C:\dev\alpha-one` covering
D's desktop + VPS items with tests, ending in a controlled interactive E2E.

**Blockers (external, not architectural):**
1. Google Cloud Console redirect-URI registration (owner: founder/operator).
2. Dedicated Google test account + human consent for interactive E2E proof
   (owner: founder/operator) — without it, end-to-end Sign-In cannot be
   claimed, consistent with TASK-019.
