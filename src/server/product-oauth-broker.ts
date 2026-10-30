/**
 * TASK-ALPHA-SUBSCRIBER-022: Product Identity OAuth broker (VPS-owned exchange).
 *
 * Dedicated Product Identity contract — deliberately SEPARATE from the
 * Workspace OAuth routes in alpha-infra-server.ts (different routes, stores,
 * scopes, and identity semantics; never merged).
 *
 * Flow: desktop runtime calls POST /login → Google authorize (openid email
 * profile ONLY, PKCE S256, nonce) → Google redirects GET /callback here →
 * server-side code exchange (client secret never leaves the VPS) → JWKS ID-
 * token verification (sig/iss/aud/exp/nonce) → single-use completion code
 * bound to the desktop-held redemption secret → redirect to the validated
 * loopback returnTo → desktop POSTs /complete with code + secret → verified
 * identity + ID token.
 *
 * No Google refresh token is requested (no access_type=offline) or stored.
 * Nothing here logs token, code, or secret material — audit lines carry
 * prefixes and reasons only.
 */
import { Router, type Request, type Response } from 'express'
import { createHash, randomBytes } from 'node:crypto'
import { parseLoopbackOrigin } from '../lib/oauth-return-policy'
import { verifyGoogleIdToken } from '../services/opencode/google-id-token'
import {
  claimProductLoginState,
  cleanupExpiredProductLoginTx,
  consumeCompletionCode,
  createProductLoginTx,
  failProductLoginTx,
  peekProductLoginTxByState,
  recordExchangeResult,
  sha256Hex,
} from './product-oauth-store'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function txTtlMs(): number {
  return Number(process.env.PRODUCT_LOGIN_TTL_MS) || 10 * 60 * 1000
}

function rateLimitMax(): number {
  return Number(process.env.PRODUCT_LOGIN_RATE_LIMIT) || 30
}

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000

function getBrokerConfig(): {
  clientId: string
  clientSecret: string
  redirectUri: string
} {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const explicitProductUri = process.env.GOOGLE_OAUTH_PRODUCT_REDIRECT_URI
  const workspaceRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI

  if (!clientId || !clientSecret) {
    throw new Error('AUTH_PROVIDER_NOT_CONFIGURED')
  }
  let redirectUri: string
  if (explicitProductUri) {
    redirectUri = explicitProductUri
  } else if (workspaceRedirectUri) {
    try {
      redirectUri = `${new URL(workspaceRedirectUri).origin}/api/google/oauth/product/callback`
    } catch {
      throw new Error('AUTH_PROVIDER_NOT_CONFIGURED')
    }
  } else {
    throw new Error('AUTH_PROVIDER_NOT_CONFIGURED')
  }
  return { clientId, clientSecret, redirectUri }
}

function fallbackReturnOrigin(): string {
  return process.env.CLIENT_URL || 'https://alpha.kanal.asia'
}

// ---------------------------------------------------------------------------
// Helpers (secrets never logged; only prefixes and reasons)
// ---------------------------------------------------------------------------

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

function singleHeader(req: Request, name: string): string | null {
  const value = req.headers[name]
  if (typeof value !== 'string' || !value.trim()) return null
  return value.trim().split(',')[0].trim() || null
}

function clientIp(req: Request): string {
  return (
    singleHeader(req, 'cf-connecting-ip') ??
    singleHeader(req, 'x-forwarded-for') ??
    req.socket.remoteAddress ??
    'unknown'
  )
}

function audit(event: string, fields: Record<string, string | null>): void {
  // Allowlisted, non-sensitive fields only. Never tokens/codes/secrets.
  // eslint-disable-next-line no-console
  console.info(`[product-oauth] ${event}`, JSON.stringify(fields))
}

/** Fixed-window per-key rate limiter (abuse mitigation only). */
const rateWindows = new Map<string, { count: number; resetAt: number }>()

function rateLimit(
  key: string,
  max: number = rateLimitMax(),
  windowMs: number = RATE_LIMIT_WINDOW_MS
): boolean {
  const now = Date.now()
  const entry = rateWindows.get(key)
  if (!entry || entry.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  entry.count += 1
  return entry.count <= max
}

function expiresInFromIdToken(idToken: string): number {
  try {
    const payload = JSON.parse(
      Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf-8')
    ) as { exp?: number }
    if (typeof payload.exp === 'number') {
      const seconds = payload.exp - Math.floor(Date.now() / 1000)
      return Math.max(60, seconds)
    }
  } catch {
    /* fall through to default */
  }
  return 3600
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function createProductOAuthRouter(): Router {
  const router = Router()

  /**
   * POST /login — start a Product Identity login transaction.
   * Body: { returnTo: string } (strict loopback origin).
   * Returns: { url, transactionId, redemptionSecret } — the secret is
   * returned exactly once and stored only as a hash server-side.
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      if (!rateLimit(`login:${clientIp(req)}`)) {
        return res
          .status(429)
          .json({ error: 'Too many login attempts.', code: 'RATE_LIMITED' })
      }
      let config: ReturnType<typeof getBrokerConfig>
      try {
        config = getBrokerConfig()
      } catch {
        return res.status(503).json({
          error: 'Product login is not configured.',
          code: 'AUTH_PROVIDER_NOT_CONFIGURED',
        })
      }

      const returnTo = (req.body ?? {}).returnTo
      const safeReturn = parseLoopbackOrigin(returnTo)
      if (!safeReturn) {
        audit('login_rejected', {
          tx: null,
          ip: clientIp(req),
          reason: 'return_invalid',
        })
        return res.status(400).json({
          error: 'Invalid return URL.',
          code: 'LOGIN_RETURN_INVALID',
        })
      }

      const transactionId = randomToken(16)
      const state = randomToken(32)
      const pkceVerifier = randomToken(32)
      const nonce = randomToken(32)
      const redemptionSecret = randomToken(32)
      const now = new Date()
      const expiresAt = new Date(now.getTime() + txTtlMs())

      await createProductLoginTx({
        transactionId,
        state,
        pkceVerifier,
        nonce,
        returnTo: safeReturn,
        secretHash: sha256Hex(redemptionSecret),
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      })

      const codeChallenge = sha256UrlBase64(pkceVerifier)
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      })

      audit('login_started', { tx: transactionId.slice(0, 8), ip: clientIp(req) })
      return res.json({
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        transactionId,
        redemptionSecret,
      })
    } catch (err) {
      audit('login_failed', {
        tx: null,
        ip: clientIp(req),
        reason: err instanceof Error ? 'server_error' : 'unknown',
      })
      return res.status(500).json({ error: 'Failed to start product login.' })
    }
  })

  /**
   * GET /callback — Google redirect target (the registered product
   * redirect URI). Exchanges the code server-side, verifies the ID token,
   * and redirects to the state-bound loopback returnTo with a one-time
   * completion code. Never exposes tokens/secrets in the redirect.
   */
  router.get('/callback', async (req: Request, res: Response) => {
    const fallback = fallbackReturnOrigin()
    const code = typeof req.query.code === 'string' ? req.query.code : null
    const state = typeof req.query.state === 'string' ? req.query.state : null
    const error = typeof req.query.error === 'string' ? req.query.error : null

    const failureRedirect = (
      returnTo: string | null,
      reason: string
    ): void => {
      const base = parseLoopbackOrigin(returnTo) ?? fallback
      res.redirect(
        `${base}/sign-in?product_login_error=${encodeURIComponent(reason)}`
      )
    }

    try {
      if (!rateLimit(`callback:${clientIp(req)}`, rateLimitMax() * 4)) {
        return failureRedirect(null, 'login_exchange_failed')
      }

      const peeked = state
        ? await peekProductLoginTxByState(state)
        : null
      const returnTo = peeked?.returnTo ?? null

      if (error) {
        if (peeked && peeked.status === 'pending') {
          await failProductLoginTx(peeked.transactionId, `google:${error}`)
        }
        audit('login_failed', {
          tx: peeked ? peeked.transactionId.slice(0, 8) : null,
          ip: clientIp(req),
          reason: error === 'access_denied' ? 'denied' : 'google_error',
        })
        return failureRedirect(
          returnTo,
          error === 'access_denied' ? 'login_denied' : 'login_exchange_failed'
        )
      }

      if (!code || !state) {
        return failureRedirect(returnTo, 'login_state_invalid')
      }

      const claimed = await claimProductLoginState(state, new Date().toISOString())
      if (!claimed) {
        audit('login_failed', {
          tx: peeked ? peeked.transactionId.slice(0, 8) : null,
          ip: clientIp(req),
          reason: 'state_invalid',
        })
        return failureRedirect(returnTo, 'login_state_invalid')
      }

      const txPrefix = claimed.transactionId.slice(0, 8)
      let config: ReturnType<typeof getBrokerConfig>
      try {
        config = getBrokerConfig()
      } catch {
        await failProductLoginTx(claimed.transactionId, 'not_configured')
        return failureRedirect(claimed.returnTo, 'login_exchange_failed')
      }

      // Server-side authorization-code exchange (client secret stays here).
      let idToken: string | undefined
      try {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: config.clientId,
            client_secret: config.clientSecret,
            redirect_uri: config.redirectUri,
            grant_type: 'authorization_code',
            code_verifier: claimed.pkceVerifier,
          }),
          signal: AbortSignal.timeout(15000),
        })
        if (!tokenResponse.ok) {
          await failProductLoginTx(claimed.transactionId, 'exchange_failed')
          audit('login_failed', {
            tx: txPrefix,
            ip: clientIp(req),
            reason: 'exchange_failed',
          })
          return failureRedirect(claimed.returnTo, 'login_exchange_failed')
        }
        const tokens = (await tokenResponse.json()) as { id_token?: string }
        idToken = tokens.id_token
      } catch {
        await failProductLoginTx(claimed.transactionId, 'exchange_failed')
        audit('login_failed', {
          tx: txPrefix,
          ip: clientIp(req),
          reason: 'exchange_failed',
        })
        return failureRedirect(claimed.returnTo, 'login_exchange_failed')
      }

      if (!idToken) {
        await failProductLoginTx(claimed.transactionId, 'no_id_token')
        return failureRedirect(claimed.returnTo, 'login_identity_invalid')
      }

      // Verify signature, issuer, audience, expiry, AND nonce. Fail closed.
      const verdict = await verifyGoogleIdToken(idToken, {
        expectedNonce: claimed.nonce,
      })
      if (!verdict.ok || !verdict.productUserId) {
        await failProductLoginTx(claimed.transactionId, 'identity_invalid')
        audit('login_failed', {
          tx: txPrefix,
          ip: clientIp(req),
          reason: 'identity_invalid',
        })
        return failureRedirect(claimed.returnTo, 'login_identity_invalid')
      }

      const completionCode = `${claimed.transactionId}.${randomToken(32)}`
      const identity = {
        productUserId: verdict.productUserId,
        email: verdict.email ?? null,
        name: verdict.name ?? null,
        picture: verdict.picture ?? null,
      }
      await recordExchangeResult({
        transactionId: claimed.transactionId,
        codeHash: sha256Hex(completionCode),
        idToken,
        identityJson: JSON.stringify(identity),
      })

      audit('login_completed', {
        tx: txPrefix,
        ip: clientIp(req),
        sub: verdict.productUserId.slice(0, 8),
      })
      return res.redirect(
        `${claimed.returnTo}/sign-in?product_login=${encodeURIComponent(completionCode)}`
      )
    } catch {
      return failureRedirect(null, 'login_exchange_failed')
    }
  })

  /**
   * POST /complete — redeem the one-time completion code.
   * Body: { code, redemptionSecret }. Both must match the SAME transaction.
   * Consumption is atomic; replay, wrong secrets, and expired codes are
   * rejected with 403. Returns only the identity material the desktop needs.
   */
  router.post('/complete', async (req: Request, res: Response) => {
    try {
      if (!rateLimit(`complete:${clientIp(req)}`)) {
        return res
          .status(429)
          .json({ error: 'Too many attempts.', code: 'RATE_LIMITED' })
      }
      try {
        getBrokerConfig()
      } catch {
        return res.status(503).json({
          error: 'Product login is not configured.',
          code: 'AUTH_PROVIDER_NOT_CONFIGURED',
        })
      }

      const body = (req.body ?? {}) as {
        code?: unknown
        redemptionSecret?: unknown
      }
      const invalid = (): Response =>
        res.status(403).json({
          error: 'Invalid or expired login code. Please sign in again.',
          code: 'AUTHENTICATION_INVALID',
        })

      if (
        typeof body.code !== 'string' ||
        typeof body.redemptionSecret !== 'string' ||
        body.code.length < 16 ||
        body.redemptionSecret.length < 16
      ) {
        return invalid()
      }

      const dot = body.code.indexOf('.')
      if (dot <= 0 || dot === body.code.length - 1) return invalid()
      const transactionId = body.code.slice(0, dot)

      const now = new Date()
      const consumed = await consumeCompletionCode({
        transactionId,
        codeHash: sha256Hex(body.code),
        secretHash: sha256Hex(body.redemptionSecret),
        nowIso: now.toISOString(),
        consumedAtIso: now.toISOString(),
      })
      if (!consumed) {
        audit('login_rejected', {
          tx: transactionId.slice(0, 8),
          ip: clientIp(req),
          reason: 'redemption_invalid',
        })
        return invalid()
      }

      let identity: {
        productUserId: string
        email: string | null
        name: string | null
        picture: string | null
      }
      try {
        identity = JSON.parse(consumed.identityJson) as typeof identity
      } catch {
        return invalid()
      }

      audit('login_redeemed', {
        tx: transactionId.slice(0, 8),
        ip: clientIp(req),
        sub: identity.productUserId.slice(0, 8),
      })
      return res.json({
        identity,
        idToken: consumed.idToken,
        expiresIn: expiresInFromIdToken(consumed.idToken),
      })
    } catch {
      return res.status(500).json({ error: 'Failed to complete product login.' })
    }
  })

  return router
}

/** S256 code challenge (base64url of SHA-256), PKCE RFC 7636. */
function sha256UrlBase64(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

/** Housekeeping: purge expired transactions (also lazily rejected on use). */
export function startProductLoginCleanup(): NodeJS.Timeout {
  const timer = setInterval(() => {
    void cleanupExpiredProductLoginTx(new Date().toISOString())
  }, 5 * 60 * 1000)
  timer.unref()
  return timer
}
