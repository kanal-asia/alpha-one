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
 * Clerk readiness (SUPERSEDED by TASK-ALPHA-SUBSCRIPTION-002A): the founder
 * directed Google OpenID Connect as the product identity provider instead
 * of Clerk — no Clerk application is created. The Clerk scaffold
 * (`src/routes/clerk`, `@clerk/react`) remains inert UI. Verification below
 * is Google ID-token verification (google-id-token.ts); the interface is
 * unchanged — no second auth system, no speculative verification.
 */

export type AuthContextKind = 'verified' | 'anonymous'

export interface ProductAuthContext {
  kind: AuthContextKind
  /** Stable product user id from verified credentials; null when anonymous. */
  productUserId: string | null
  /** Identity provider that vouched for the subject ('google'); null when anonymous. */
  provider: string | null
  /** Explicit marker so downstream code can distinguish "no login" from "verified". */
  verified: boolean
}

export interface TokenVerification {
  ok: boolean
  productUserId?: string
  provider?: string
  /** Machine-readable failure reason (never includes token material). */
  reason?: 'CLERK_NOT_CONFIGURED' | 'GOOGLE_NOT_CONFIGURED' | 'AUTHENTICATION_INVALID' | 'AUTHENTICATION_EXPIRED'
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
 * Provider token verification entry point.
 *
 * TASK-ALPHA-SUBSCRIPTION-002A: Google OpenID Connect is the product identity
 * provider (founder decision — no Clerk application). A presented Bearer
 * token is verified as a Google ID token (google-id-token.ts): RS256
 * signature against Google's JWKS, issuer, audience (= this app's
 * GOOGLE_CLIENT_ID), and expiry. The canonical product identity is the
 * verified `sub` claim — never email, never a body field.
 *
 * Fails closed: unverifiable tokens and missing configuration both return
 * ok:false, which resolveAuthContext turns into rejection — never into an
 * anonymous success.
 */
import { verifyGoogleIdToken } from './google-id-token'

export function verifyProviderToken(token: string): TokenVerification {
  void token
  // Synchronous interface preserved for the existing contract tests; the
  // async Google verification runs in resolveAuthContextAsync below.
  // Any use of this sync path means "cannot verify" → fail closed.
  return { ok: false, reason: 'GOOGLE_NOT_CONFIGURED' }
}

function verificationToContext(
  verdict: TokenVerification
): { context: ProductAuthContext; error?: { status: number; code: string; message: string } } {
  if (!verdict.ok || !verdict.productUserId) {
    const code =
      verdict.reason === 'AUTHENTICATION_EXPIRED'
        ? 'AUTHENTICATION_EXPIRED'
        : verdict.reason === 'CLERK_NOT_CONFIGURED' || verdict.reason === 'GOOGLE_NOT_CONFIGURED'
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
      provider: verdict.provider ?? 'google',
      verified: true,
    },
  }
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
  return verificationToContext(verdict)
}

/**
 * Async variant using the real Google ID-token verifier. This is the path
 * the execution guards use: a presented Bearer credential is cryptographically
 * verified (signature, issuer, audience, expiry) and the canonical identity
 * is the verified `sub`. No credential → anonymous (unchanged default).
 */
export async function resolveAuthContextAsync(
  headers: Record<string, unknown> | undefined
): Promise<{ context: ProductAuthContext; error?: { status: number; code: string; message: string } }> {
  const token = extractBearerToken(headers)
  if (token === null) {
    return { context: { kind: 'anonymous', productUserId: null, provider: null, verified: false } }
  }
  const verdict = await verifyGoogleIdToken(token)
  return verificationToContext({
    ok: verdict.ok,
    productUserId: verdict.productUserId,
    provider: 'google',
    reason: verdict.reason,
  })
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
  return applyGuard(context, error, res)
}

/**
 * Async guard using real Google verification. Execution routes must use
 * this (not the sync stub path) so presented credentials are actually
 * verified before the canonical identity is trusted downstream.
 */
export async function requireVerifiedContextAsync(
  req: { headers?: Record<string, unknown> },
  res: { status: (code: number) => { json: (body: unknown) => void } }
): Promise<{ ok: boolean; context: ProductAuthContext }> {
  const { context, error } = await resolveAuthContextAsync(req.headers)
  return applyGuard(context, error, res)
}

function applyGuard(
  context: ProductAuthContext,
  error: { status: number; code: string; message: string } | undefined,
  res: { status: (code: number) => { json: (body: unknown) => void } }
): { ok: boolean; context: ProductAuthContext } {
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
