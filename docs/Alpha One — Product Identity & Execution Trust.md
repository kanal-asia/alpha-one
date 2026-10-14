# Alpha One — Product Identity & Execution Trust

**Document Type:** Engineering Contract — Identity Foundation
**Status:** IMPLEMENTED (foundation) — Clerk end-to-end PENDING external prerequisites
**Task:** TASK-ALPHA-SUBSCRIPTION-002
**Source revision:** feature branch `feat/product-identity-propagation`

## 1. Rule

Product identity is derived **only** from a verified `Authorization: Bearer`
credential at the server trust boundary. Frontend-supplied `userId`, email,
Workspace identity, or session fields are never identity evidence.

## 2. Trust Boundary

`src/services/opencode/auth-context.ts` — `resolveAuthContext()` /
`requireVerifiedContext()`. Guarded routes: `POST /api/opencode/chat/stream`,
`POST /api/opencode/session/:id/compact`.

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

SDK (`@clerk/react` ^6.14.5) + `/clerk` routes exist, but no credentials are
configured anywhere (no `.env`, no `.env.example` entry), no backend
JWKS/JWT library is installed, and no redirect/origin config exists for
Electron. Until those exist, `verifyProviderToken` fails closed by design.
Next step: Clerk app + keys → JWKS verification in `verifyProviderToken` →
flip `ALPHA_AUTH_ENFORCE=1` → Usage Ledger (TASK-ALPHA-SUBSCRIPTION-003).

## 6. Product vs Workspace Identity

Product identity (`productUserId` from provider subject) is distinct from
Google Workspace connection identity (email/`providerUserId` from OAuth).
Workspace connections keep working independently of product auth. Never infer
ownership from email match.
