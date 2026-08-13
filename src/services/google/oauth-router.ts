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
  getConnection,
  disconnectGoogle,
  isConfigured,
  getValidAccessToken,
} from './oauth-service'

export function createGoogleOAuthRouter(): Router {
  const router = Router()

  /**
   * GET /api/google/oauth/status
   * Returns the connection status for the current user.
   */
  router.get('/status', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req)
      const connection = await getConnection(userId)

      if (!connection) {
        return res.json({ connected: false, configured: isConfigured() })
      }

      // Check if token is still valid
      const token = await getValidAccessToken(userId)

      return res.json({
        connected: Boolean(token),
        configured: isConfigured(),
        email: connection.email,
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
   * GET /api/google/oauth/auth-url
   * Generates the Google OAuth authorization URL.
   */
  router.get('/auth-url', async (req: Request, res: Response) => {
    try {
      if (!isConfigured()) {
        return res.status(503).json({
          error: 'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.',
        })
      }

      const userId = getUserId(req)
      const { url, state } = await generateAuthUrl(userId)

      return res.json({ url, state })
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to generate auth URL.',
      })
    }
  })

  /**
   * GET /api/google/oauth/callback
   * Handles the OAuth callback from Google.
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

  return router
}

/**
 * Get the client URL for redirects.
 */
function getClientUrl(): string {
  return process.env.CLIENT_URL || 'http://localhost:5173'
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
