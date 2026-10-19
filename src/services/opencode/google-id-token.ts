/**
 * TASK-ALPHA-SUBSCRIPTION-002A: Google OpenID Connect ID-token verification.
 *
 * Product login uses Google as the identity provider WITHOUT adopting any
 * Workspace permission: the product-login flow requests `openid email
 * profile` only, and the returned ID token is verified here against Google's
 * public JWKS. No client secret is needed for verification (RS256 public-key
 * cryptography); the audience check binds the token to THIS application via
 * the already-configured GOOGLE_CLIENT_ID.
 *
 * Verified claims (all enforced, none optional):
 * - signature: valid RS256 signature from Google's current JWKS
 *   (https://www.googleapis.com/oauth2/v3/certs), with automatic key
 *   rotation via jose's remote key set (unknown `kid` refetches).
 * - iss: exactly `https://accounts.google.com`.
 * - aud: exactly the configured GOOGLE_CLIENT_ID.
 * - exp/iat: enforced by jose (with a small clock tolerance).
 *
 * Canonical product identity: the verified `sub` claim — Google's stable,
 * opaque user identifier. Email is carried as display metadata only and is
 * NEVER identity evidence (see auth-context.ts).
 *
 * Fail-closed: any verification failure, missing configuration, or network
 * inability to reach the JWKS endpoint returns ok:false. Callers must treat
 * that as rejection, never as anonymous success.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

export interface GoogleIdVerification {
  ok: boolean
  /** Canonical product user id (Google `sub`) — present only when ok. */
  productUserId?: string
  email?: string
  emailVerified?: boolean
  name?: string
  picture?: string
  /** Machine-readable failure reason (never includes token material). */
  reason?: 'GOOGLE_NOT_CONFIGURED' | 'AUTHENTICATION_INVALID' | 'AUTHENTICATION_EXPIRED'
}

const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/oauth2/v3/certs')
const GOOGLE_ISSUER = 'https://accounts.google.com'
// Small leeway for clock skew between Google, server, and client.
const CLOCK_TOLERANCE_SECONDS = 120

let remoteKeys: ReturnType<typeof createRemoteJWKSet> | null = null

function getRemoteKeys(): ReturnType<typeof createRemoteJWKSet> {
  if (!remoteKeys) {
    remoteKeys = createRemoteJWKSet(GOOGLE_JWKS_URL)
  }
  return remoteKeys
}

/** Test seam: replace the JWKS source (unit tests inject a local key set). */
export function __setRemoteKeysForTests(
  keys: ReturnType<typeof createRemoteJWKSet> | null
): void {
  remoteKeys = keys
}

function configuredClientId(): string | null {
  const id = process.env['GOOGLE_CLIENT_ID']
  return typeof id === 'string' && id.length > 0 ? id : null
}

export function isGoogleIdVerificationConfigured(): boolean {
  return configuredClientId() !== null
}

export async function verifyGoogleIdToken(
  token: string
): Promise<GoogleIdVerification> {
  const clientId = configuredClientId()
  if (!clientId) {
    return { ok: false, reason: 'GOOGLE_NOT_CONFIGURED' }
  }
  if (typeof token !== 'string' || token.length === 0) {
    return { ok: false, reason: 'AUTHENTICATION_INVALID' }
  }
  let payload: JWTPayload
  try {
    const verified = await jwtVerify(token, getRemoteKeys(), {
      issuer: GOOGLE_ISSUER,
      audience: clientId,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    })
    payload = verified.payload
  } catch (err) {
    const code = (err as { code?: string })?.code ?? ''
    if (
      code === 'ERR_JWT_EXPIRED' ||
      (err instanceof Error && /expired/i.test(err.message))
    ) {
      return { ok: false, reason: 'AUTHENTICATION_EXPIRED' }
    }
    return { ok: false, reason: 'AUTHENTICATION_INVALID' }
  }
  const sub = payload['sub']
  if (typeof sub !== 'string' || sub.length === 0) {
    return { ok: false, reason: 'AUTHENTICATION_INVALID' }
  }
  const email = payload['email']
  return {
    ok: true,
    productUserId: sub,
    email: typeof email === 'string' ? email : undefined,
    emailVerified: payload['email_verified'] === true,
    name: typeof payload['name'] === 'string' ? (payload['name'] as string) : undefined,
    picture: typeof payload['picture'] === 'string' ? (payload['picture'] as string) : undefined,
  }
}
