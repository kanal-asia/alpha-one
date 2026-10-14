/**
 * TASK-ALPHA-SUBSCRIPTION-002: product identity trust boundary (server side).
 *
 * A single choke point that turns an HTTP request into a canonical
 * ProductAuthContext for AI execution. Rules (no exceptions):
 *
 * - Identity is derived ONLY from a verified `Authorization: Bearer <token>`
 *   credential. Body fields (`userId`, `email`, Workspace ids, session
 *   fields) are NEVER identity evidence and are ignored here.
 * - With no credential the context is `anonymous` (local-device usage).
 *   Nothing is rejected by default: enforcement is explicit per route via
 *   `requireVerifiedContext`, flipped on with `ALPHA_AUTH_ENFORCE=1`.
 * - A credential that cannot be verified fails CLOSED
 *   (`AUTH_PROVIDER_NOT_CONFIGURED` / `AUTHENTICATION_INVALID`) — it never
 *   degrades into an anonymous success.
 * - Tokens are never logged, never attached to prompts/CLI env/provider
 *   payloads, and never persisted by this module.
 *
 * Clerk readiness (PROVEN gap): the Clerk scaffold (`src/routes/clerk`,
 * `@clerk/react`) has no credentials configured anywhere (no .env, no
 * `.env.example` entry) and no backend JWT/JWKS library is installed, so
 * `verifyClerkToken` fails closed until TASK-ALPHA-SUBSCRIPTION-002's
 * documented follow-up wires JWKS verification with real credentials.
 * The interface below is exactly what that follow-up implements — no
 * second auth system, no speculative verification.
 */

export type AuthContextKind = 'verified' | 'anonymous'

export interface ProductAuthContext {
  kind: AuthContextKind
  /** Stable product user id from verified credentials; null when anonymous. */
  productUserId: string | null
  /** Identity provider that vouched for the subject (e.g. 'clerk'); null when anonymous. */
  provider: string | null
  /** Explicit marker so downstream code can distinguish "no login" from "verified". */
  verified: boolean
}

export interface TokenVerification {
  ok: boolean
  productUserId?: string
  provider?: string
  /** Machine-readable failure reason (never includes token material). */
  reason?: 'CLERK_NOT_CONFIGURED' | 'AUTHENTICATION_INVALID' | 'AUTHENTICATION_EXPIRED'
}

const BEARER_RE = /^Bearer\s+(\S+)$/i

export function extractBearerToken(
  headers: Record<string, unknown> | undefined
): string | null {
  const raw = headers?.['authorization'] ?? headers?.['Authorization']
  if (typeof raw !== 'string') return null
  const m = BEARER_RE.exec(raw.trim())
  return m ? m[1] : null
}

/**
 * Provider token verification entry point. Clerk path fails closed until
 * real JWKS verification is configured (see module doc). Returns a failure
 * — never anonymous — for any presented credential it cannot verify.
 */
export function verifyProviderToken(token: string): TokenVerification {
  void token
  // No Clerk credentials are configured in any environment (PROVEN:
  // no VITE_CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY anywhere in repo or
  // env examples), so no token can be verified yet. Fail closed.
  return { ok: false, reason: 'CLERK_NOT_CONFIGURED' }
}

export function resolveAuthContext(
  headers: Record<string, unknown> | undefined,
  verifier: (token: string) => TokenVerification = verifyProviderToken
): { context: ProductAuthContext; error?: { status: number; code: string; message: string } } {
  const token = extractBearerToken(headers)
  if (token === null) {
    return { context: { kind: 'anonymous', productUserId: null, provider: null, verified: false } }
  }
  const verdict = verifier(token)
  if (!verdict.ok || !verdict.productUserId) {
    const code =
      verdict.reason === 'AUTHENTICATION_EXPIRED'
        ? 'AUTHENTICATION_EXPIRED'
        : verdict.reason === 'CLERK_NOT_CONFIGURED'
          ? 'AUTH_PROVIDER_NOT_CONFIGURED'
          : 'AUTHENTICATION_INVALID'
    return {
      context: { kind: 'anonymous', productUserId: null, provider: null, verified: false },
      error: {
        status: code === 'AUTH_PROVIDER_NOT_CONFIGURED' ? 503 : 401,
        code,
        message:
          code === 'AUTH_PROVIDER_NOT_CONFIGURED'
            ? 'Product authentication is not configured on this server. Sign-in is unavailable; anonymous local execution continues.'
            : 'The provided credentials are invalid or expired.',
      },
    }
  }
  return {
    context: {
      kind: 'verified',
      productUserId: verdict.productUserId,
      provider: verdict.provider ?? 'clerk',
      verified: true,
    },
  }
}

/** Enforcement flag: `ALPHA_AUTH_ENFORCE=1` turns protected routes deny-by-default. */
export function isAuthEnforced(): boolean {
  return process.env['ALPHA_AUTH_ENFORCE'] === '1'
}

/**
 * Express-style guard for protected execution routes. Returns true when the
 * request may proceed (and the resolved context must be used downstream);
 * otherwise writes the failure response and returns false.
 */
export function requireVerifiedContext(
  req: { headers?: Record<string, unknown> },
  res: { status: (code: number) => { json: (body: unknown) => void } },
  verifier?: (token: string) => TokenVerification
): { ok: boolean; context: ProductAuthContext } {
  const { context, error } = resolveAuthContext(req.headers, verifier)
  if (error) {
    res.status(error.status).json({ error: error.message, code: error.code })
    return { ok: false, context }
  }
  if (!context.verified && isAuthEnforced()) {
    res.status(401).json({
      error: 'Authentication is required for this operation. Sign in to continue.',
      code: 'AUTHENTICATION_REQUIRED',
    })
    return { ok: false, context }
  }
  return { ok: true, context }
}
