/**
 * Google Workspace OAuth Router
 *
 * Express router handling OAuth authorization, callback, connection status,
 * and disconnect. All tokens are stored server-side only.
 */
import { Router, type Request, type Response } from 'express'
import {
  generateAuthUrl,
  handleOAuthCallback,
  generateProductLoginUrl,
  handleProductLoginCallback,
  completeProductLogin,
  peekProductLoginState,
  getConnection,
  disconnectGoogle,
  isConfigured,
  getValidAccessToken,
  saveConnection,
  resolveSafeReturnBase,
} from './oauth-service'

export function createGoogleOAuthRouter(): Router {
  const router = Router()

  /**
   * POST /api/google/oauth/login
   * Starts the product-login flow (OpenID Connect, `openid email profile`
   * only — zero Workspace permissions). Returns the Google authorization URL.
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      if (!isConfigured()) {
        return res.status(503).json({
          error: 'Product login is not configured.',
          code: 'AUTH_PROVIDER_NOT_CONFIGURED',
        })
      }
      const returnTo = req.body?.returnTo as string | undefined
      const { url } = await generateProductLoginUrl(returnTo)
      return res.json({ url })
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to start product login.',
      })
    }
  })

  /**
   * POST /api/google/oauth/login/complete
   * Redeems a one-time product-login completion code for the verified
   * identity + ID token. Single-use: the stored completion is deleted on
   * read, so a captured code cannot be replayed.
   */
  router.post('/login/complete', async (req: Request, res: Response) => {
    try {
      const { code } = req.body as { code?: string }
      const result = await completeProductLogin(code ?? '')
      if (!result) {
        return res.status(403).json({
          error: 'Invalid or expired login code. Please sign in again.',
          code: 'AUTHENTICATION_INVALID',
        })
      }
      return res.json(result)
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to complete product login.',
      })
    }
  })

  /**
   * GET /api/google/oauth/status
   * Returns the connection status for the current user.
   *
   * NOTE: `configured` is always `true` because the VPS is authoritative
   * for Google OAuth. The local server does not need Google credentials;
   * the production OAuth flow is handled by the VPS. This endpoint
   * reflects connection state only, not local configuration.
   */
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      const connection = await getConnection(userId)

      if (!connection) {
        return res.json({ connected: false, configured: true })
      }

      // Check if token is still valid
      const token = await getValidAccessToken(userId)

      return res.json({
        connected: Boolean(token),
        configured: true,
        email: connection.email,
        // TASK-ALPHA-LOCAL-072: authoritative Google sub for local telemetry
        // identity (additive; existing consumers unaffected).
        providerUserId: connection.providerUserId ?? null,
        scopes: connection.scopes,
        connectedAt: connection.connectedAt,
      })
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to check status.',
      })
    }
  })

  /**
   * GET /api/google/oauth/callback
   * Handles the OAuth callback from Google (Workspace connector AND product
   * login share this endpoint and the registered redirect URI; the flows are
   * distinguished by OAuth state, stored in separate stores).
   */
  router.get('/callback', async (req: Request, res: Response) => {
    try {
      const code = req.query.code as string
      const state = req.query.state as string
      const error = req.query.error as string

      const clientUrl = getClientUrl()

      // Handle user denial
      if (error === 'access_denied') {
        return res.redirect(
          `${clientUrl}/settings?google_error=access_denied`
        )
      }

      if (!code || !state) {
        return res.redirect(
          `${clientUrl}/settings?google_error=missing_params`
        )
      }

      // TASK-ALPHA-SUBSCRIPTION-002A: product-login branch. The Workspace
      // path below is untouched; this branch only runs for states issued by
      // generateProductLoginUrl. Verified identity is handed to the SPA via
      // a one-time completion code (tokens never travel in the redirect URL).
      if (await peekProductLoginState(state)) {
        try {
          const { completionCode, returnTo } =
            await handleProductLoginCallback(code, state)
          // TASK-ALPHA-SUBSCRIBER-017: the packaged backend serves the SPA at
          // a dynamic loopback port, so the per-request return base (stored
          // at /login time, else this request's Origin) wins over the static
          // CLIENT_URL fallback — after loopback allowlist validation.
          const origin =
            typeof req.headers.origin === 'string'
              ? req.headers.origin
              : null
          const baseUrl = resolveSafeReturnBase(
            returnTo ?? origin,
            clientUrl
          )
          return res.redirect(
            `${baseUrl}/sign-in?product_login=${completionCode}`
          )
        } catch (err) {
          const message = encodeURIComponent(
            err instanceof Error ? err.message : 'Product login failed.'
          )
          return res.redirect(`${clientUrl}/sign-in?product_login_error=${message}`)
        }
      }

      const userId = getUserId(req)
      const connection = await handleOAuthCallback(code, state, userId)

      // Determine redirect destination from saved OAuth state
      const returnTo = connection._returnTo ?? '/settings'
      const separator = returnTo.includes('?') ? '&' : '?'
      return res.redirect(
        `${clientUrl}${returnTo}${separator}google_connected=true`
      )
    } catch (err) {
      const message = encodeURIComponent(
        err instanceof Error ? err.message : 'OAuth callback failed.'
      )
      return res.redirect(
        `${getClientUrl()}/settings?google_error=${message}`
      )
    }
  })

  /**
   * POST /api/google/oauth/connect
   * Initiates the OAuth flow by returning the auth URL.
   */
  router.post('/connect', async (req: Request, res: Response) => {
    try {
      if (!isConfigured()) {
        return res.status(503).json({
          error: 'Google OAuth is not configured.',
        })
      }

      const userId = getUserId(req)
      const returnTo = req.body?.returnTo as string | undefined
      const { url } = await generateAuthUrl(userId, returnTo)

      return res.json({ url })
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to initiate connection.',
      })
    }
  })

  /**
   * POST /api/google/oauth/disconnect
   * Disconnects Google Workspace for the current user.
   */
  router.post('/disconnect', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      await disconnectGoogle(userId)
      return res.json({ success: true })
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to disconnect.',
      })
    }
  })

  /**
   * POST /api/google/oauth/persist-production
   * Persists the production OAuth result locally.
   * Called by the client after production OAuth verification.
   *
   * SECURITY: Validates sessionId against production OAuth session.
   * The local server calls the production /status endpoint to verify
   * the session exists and is completed before persisting.
   */
  router.post('/persist-production', async (req: Request, res: Response) => {
    try {
      const { sessionId, identity, tokens } = req.body as {
        sessionId?: string
        identity?: {
          provider: string
          providerUserId: string
          email: string
          displayName: string
          avatarUrl: string | null
          createdAt: string
          updatedAt: string
        }
        tokens?: {
          accessToken: string
          refreshToken: string | undefined
          expiresAt: number
        }
      }

      // Validate required fields
      if (!sessionId || !identity || !tokens) {
        return res.status(400).json({
          error: 'sessionId, identity, and tokens are required',
        })
      }

      // Validate identity structure
      if (!identity.provider || !identity.providerUserId?.trim() || !identity.email || !identity.displayName) {
        return res.status(400).json({
          error: 'Invalid identity: provider, providerUserId, email, and displayName are required',
        })
      }

      // Validate tokens structure
      if (!tokens.accessToken || typeof tokens.expiresAt !== 'number') {
        return res.status(400).json({
          error: 'Invalid tokens: accessToken and expiresAt are required',
        })
      }

      // SECURITY: Validate sessionId against production OAuth session
      // Call production /status endpoint to verify session exists and is completed
      const productionBaseUrl = process.env.PRODUCTION_BASE_URL || 'https://alpha.kanal.asia'
      try {
        const statusResponse = await fetch(`${productionBaseUrl}/api/google/oauth/status/${sessionId}`, {
          headers: { Accept: 'application/json' },
        })

        if (!statusResponse.ok) {
          return res.status(403).json({
            error: 'Invalid or expired OAuth session',
          })
        }

        const statusData = await statusResponse.json() as { status: string; identity?: { email: string } }

        // Verify session is completed
        if (statusData.status !== 'completed') {
          return res.status(403).json({
            error: 'OAuth session not completed',
          })
        }

        // Verify identity email matches (optional additional binding)
        if (statusData.identity?.email !== identity.email) {
          return res.status(403).json({
            error: 'Identity does not match OAuth session',
          })
        }
      } catch {
        // If production server is unreachable, reject the request
        return res.status(503).json({
          error: 'Unable to verify OAuth session with production server',
        })
      }

      const userId = getUserId(req)

      // Save connection using the existing local persistence
      await saveConnection(userId, {
        providerUserId: identity.providerUserId,
        email: identity.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry: tokens.expiresAt,
        scopes: [],
        connectedAt: identity.createdAt,
        updatedAt: identity.updatedAt,
      })

      return res.json({ success: true })
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to persist connection.',
      })
    }
  })

  /**
   * GET /api/google/mcp/token
   * Returns a valid Google access token for MCP server use.
   *
   * MCP servers call this endpoint instead of reading credentials directly.
   * The backend handles token validation, refresh (using server-side client
   * credentials), and SQLite persistence — keeping GOOGLE_CLIENT_SECRET
   * server-side only.
   *
   * Returns: { accessToken: string, email: string }
   * Errors: 401 if not connected, 500 on failure
   */
  router.get('/mcp/token', async (_req: Request, res: Response) => {
    try {
      const userId = getUserId(_req)
      const connection = await getConnection(userId)

      if (!connection) {
        return res.status(401).json({
          error: 'Google account not connected. Please connect your Google account in Alpha Workspace Settings.',
        })
      }

      // getValidAccessToken handles expiry check + refresh using server-side env vars
      const token = await getValidAccessToken(userId)

      if (!token) {
        return res.status(401).json({
          error: 'Google authorization expired. Please reconnect your Google account in Settings.',
        })
      }

      return res.json({ accessToken: token, email: connection.email })
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to obtain access token.',
      })
    }
  })

  return router
}

/**
 * Get the client URL for redirects.
 */
function getClientUrl(): string {
  return process.env.CLIENT_URL || 'http://localhost:3000'
}

/**
 * Extract user ID from request.
 * In a real app, this would come from session/JWT.
 * For local-first, we use a fixed user ID.
 */
function getUserId(_req: Request): string {
  // Local-first: single user, fixed ID
  return 'local-user'
}
