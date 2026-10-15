# Alpha One — Product Identity & Execution Trust

**Document Type:** Engineering Contract — Identity Foundation
**Status:** IMPLEMENTED (foundation) — Clerk end-to-end PENDING external prerequisites
**Task:** TASK-ALPHA-SUBSCRIPTION-002 → 002A
**Source revision:** feature branch `feat/product-identity-propagation`

## 0. Provider Decision (002A)

Founder decision: **Google OpenID Connect**, not Clerk — no Clerk application,
no Clerk credentials. Verification is Google ID-token verification
(`src/services/opencode/google-id-token.ts`, `jose` JWKS): RS256 signature,
`iss=https://accounts.google.com`, `aud=GOOGLE_CLIENT_ID`, expiry. Canonical
identity is the verified `sub`. The Clerk scaffold stays inert.

## 0.1 Product Login Flow (separate from Workspace connector)

- `POST /api/google/oauth/login` → Google authorize URL with
  `openid email profile` ONLY (zero Workspace permissions, distinct consent).
  Shares the registered redirect URI; flows are distinguished by OAuth state
  (separate store — the Workspace callback path is untouched).
- `GET /api/google/oauth/callback` (shared) → product branch verifies the
  ID token, mints a one-time completion code, redirects to
  `/sign-in?product_login=<code>` (tokens never travel in the URL).
- `POST /api/google/oauth/login/complete` → one-time redemption of
  `{identity, idToken}`; deleted on read (no replay).
- SPA: "Continue with Google" button, completion on return (StrictMode-safe
  single redemption), ID token held in memory via `setProductSessionToken`,
  attached as `Authorization: Bearer` on execution requests only.

## 1. Rule

Product identity is derived **only** from a verified `Authorization: Bearer`
credential at the server trust boundary. Frontend-supplied `userId`, email,
Workspace identity, or session fields are never identity evidence.

## 2. Trust Boundary

`src/services/opencode/auth-context.ts` — `resolveAuthContextAsync()` /
`requireVerifiedContextAsync()`. Guarded routes: `POST /api/opencode/chat/stream`,
`POST /api/opencode/session/:id/compact`. Presented credentials are verified
as Google ID tokens; unconfigured provider and unverifiable tokens fail
closed (503 `AUTH_PROVIDER_NOT_CONFIGURED` / 401 `AUTHENTICATION_INVALID`).
`ALPHA_AUTH_ENFORCE=1` flips protected routes deny-by-default; default is
open-anonymous (local usage preserved) while invalid credentials are still
rejected.

| Request | Default (`ALPHA_AUTH_ENFORCE` unset) | Enforced (`=1`) |
|---|---|---|
| No credential | anonymous pass-through (current behavior preserved) | 401 `AUTHENTICATION_REQUIRED` |
| Unverifiable credential | 503 `AUTH_PROVIDER_NOT_CONFIGURED` / 401 `AUTHENTICATION_INVALID` — fail closed, never anonymous | same (fail closed) |
| Verified credential | `verified` context with canonical `productUserId` | same |

## 3. Execution Propagation

`chat/stream` resolves the context once per request; `authKind` +
`productUserId` travel in the trace payload, spawn log, and watchdog
diagnostics. Continuations/retries share the request scope, so identity
association survives them. Tokens never enter prompts, CLI env, provider
payloads, or logs. Frontend attaches the token only via
`setProductSessionToken()` (never the legacy mock token) as an
`Authorization` header — the body carries no identity fields.

## 4. Sign-in Posture

`isMockSignInAllowed()` (`user-auth-form.tsx`): mock success only in dev
builds or with `VITE_ALLOW_MOCK_AUTH=true`. Production builds fail closed
with an actionable "not configured" error — no silent mock session.

## 5. Clerk Gap (external prerequisite)

SUPERSEDED by §0 above: Google is the provider. The remaining external item
is operational, not architectural — a browser-completed login against real
credentials (packaged validation explicitly deferred by founder).

## 6. Product vs Workspace Identity

Product identity (`productUserId` from provider subject) is distinct from
Google Workspace connection identity (email/`providerUserId` from OAuth).
Workspace connections keep working independently of product auth. Never infer
ownership from email match.
