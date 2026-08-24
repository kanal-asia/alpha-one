/**
 * TASK-OPENCODE-100: Alpha One Infrastructure Server
 *
 * Minimal production server for alpha.kanal.asia.
 * Handles:
 * - Google OAuth callback (production persistence)
 * - Identity verification (polling for local Alpha One)
 * - Version manifest (check updates)
 *
 * This is NOT the Alpha One application runtime.
 * Alpha One runtime remains local on the user's device.
 */

import 'dotenv/config'
import express, { type Request, type Response } from 'express'
import cors from 'cors'
import { randomBytes, createHash } from 'node:crypto'
import {
  upsertIdentity,
  createOAuthSession,
  getOAuthSession,
  completeOAuthSession,
  failOAuthSession,
  cleanupExpiredSessions,
  type GoogleIdentity,
  type OAuthSession,
} from './alpha-infra-db'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT) || 3002
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000'

function getGoogleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI.'
    )
  }

  return { clientId, clientSecret, redirectUri }
}

// ---------------------------------------------------------------------------
// Express App
// ---------------------------------------------------------------------------

const app = express()
app.use(cors())
app.use(express.json())

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'alpha-infra', timestamp: new Date().toISOString() })
})

// ---------------------------------------------------------------------------
// Google OAuth — Start
// ---------------------------------------------------------------------------

app.post('/google/oauth/start', async (req: Request, res: Response) => {
  try {
    const config = getGoogleConfig()
    const { sessionId } = req.body as {
      sessionId?: string
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    // Generate OAuth state
    const state = randomBytes(24).toString('base64url')
    const codeVerifier = randomBytes(32).toString('base64url')
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url')

    // Create session
    const session: OAuthSession = {
      sessionId,
      state,
      codeVerifier,
      status: 'pending',
      identity: null,
      tokens: null,
      error: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
    }
    await createOAuthSession(session)

    // Build Google OAuth URL
    const scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/docs.readonly',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/presentations.readonly',
      'https://www.googleapis.com/auth/script.projects',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/calendar.readonly',
    ]

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      state,
      access_type: 'offline',
      prompt: 'consent',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

    return res.json({ url, state })
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to start OAuth',
    })
  }
})

// ---------------------------------------------------------------------------
// Google OAuth — Callback
// ---------------------------------------------------------------------------

app.get('/google/oauth/callback', async (req: Request, res: Response) => {
  try {
    const config = getGoogleConfig()
    const code = req.query.code as string
    const state = req.query.state as string
    const error = req.query.error as string

    // Handle user denial
    if (error === 'access_denied') {
      return res.redirect(`${CLIENT_URL}/settings?google_error=access_denied`)
    }

    if (!code || !state) {
      return res.redirect(`${CLIENT_URL}/settings?google_error=missing_params`)
    }

    // Find session by state - scan all sessions
    const allSessions = await import('node:fs/promises').then(async (fs) => {
      try {
        const data = await fs.readFile(
          `${process.cwd()}/.alpha/infra/sessions.json`,
          'utf-8'
        )
        return JSON.parse(data) as Record<string, OAuthSession>
      } catch {
        return {} as Record<string, OAuthSession>
      }
    })

    const sessionEntry = Object.values(allSessions).find(
      (s) => s.state === state
    )

    if (!sessionEntry || sessionEntry.status !== 'pending') {
      return res.redirect(
        `${CLIENT_URL}/settings?google_error=invalid_or_expired_state`
      )
    }

    // Check expiry
    if (new Date(sessionEntry.expiresAt) < new Date()) {
      await failOAuthSession(sessionEntry.sessionId, 'Session expired')
      return res.redirect(
        `${CLIENT_URL}/settings?google_error=session_expired`
      )
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: sessionEntry.codeVerifier,
      }),
    })

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.text()
      await failOAuthSession(sessionEntry.sessionId, `Token exchange failed: ${tokenError}`)
      return res.redirect(
        `${CLIENT_URL}/settings?google_error=token_exchange_failed`
      )
    }

    const tokens = await tokenResponse.json() as {
      access_token: string
      refresh_token?: string
      expires_in: number
      token_type: string
      scope: string
    }

    // Get user info
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    )

    if (!userInfoResponse.ok) {
      await failOAuthSession(sessionEntry.sessionId, 'Failed to fetch user info')
      return res.redirect(
        `${CLIENT_URL}/settings?google_error=userinfo_failed`
      )
    }

    const userInfo = await userInfoResponse.json() as {
      id: string
      email: string
      name: string
      picture?: string
    }

    // Create/update identity
    const identity: GoogleIdentity = {
      provider: 'google',
      providerUserId: userInfo.id,
      email: userInfo.email,
      displayName: userInfo.name,
      avatarUrl: userInfo.picture ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await upsertIdentity(identity)

    // Complete session
    await completeOAuthSession(sessionEntry.sessionId, identity, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    })

    // Redirect to success page
    return res.redirect(`${CLIENT_URL}/settings?google_connected=true`)
  } catch (err) {
    const message = encodeURIComponent(
      err instanceof Error ? err.message : 'OAuth callback failed'
    )
    return res.redirect(`${CLIENT_URL}/settings?google_error=${message}`)
  }
})

// ---------------------------------------------------------------------------
// Google OAuth — Status (polling for local Alpha One)
// ---------------------------------------------------------------------------

app.get('/google/oauth/status/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params
    const session = await getOAuthSession(sessionId)

    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' })
    }

    if (session.status === 'completed' && session.identity) {
      // Don't expose tokens in response - local Alpha One will use them locally
      return res.json({
        status: 'completed',
        identity: {
          provider: session.identity.provider,
          email: session.identity.email,
          displayName: session.identity.displayName,
          avatarUrl: session.identity.avatarUrl,
        },
      })
    }

    if (session.status === 'failed') {
      return res.json({
        status: 'failed',
        error: session.error,
      })
    }

    return res.json({ status: 'pending' })
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to check status',
    })
  }
})

// ---------------------------------------------------------------------------
// Google OAuth — Verify (exchange session for tokens)
// ---------------------------------------------------------------------------

app.post('/google/oauth/verify', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.body as { sessionId?: string }

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    const session = await getOAuthSession(sessionId)

    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired' })
    }

    if (session.status !== 'completed') {
      return res.json({ status: session.status, error: session.error })
    }

    // Return tokens and identity, then delete session (one-time use)
    const result = {
      status: 'completed',
      identity: session.identity,
      tokens: session.tokens,
    }

    // Delete session after verification
    const sessions = await import('node:fs/promises').then(async (fs) => {
      try {
        const data = await fs.readFile(
          `${process.cwd()}/.alpha/infra/sessions.json`,
          'utf-8'
        )
        return JSON.parse(data) as Record<string, OAuthSession>
      } catch {
        return {} as Record<string, OAuthSession>
      }
    })
    delete sessions[sessionId]
    await import('node:fs/promises').then((fs) =>
      fs.writeFile(
        `${process.cwd()}/.alpha/infra/sessions.json`,
        JSON.stringify(sessions, null, 2)
      )
    )

    return res.json(result)
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to verify session',
    })
  }
})

// ---------------------------------------------------------------------------
// Version Manifest (Check Updates)
// ---------------------------------------------------------------------------

app.get('/releases/manifest.json', (_req: Request, res: Response) => {
  const manifest = {
    version: '1.0.0',
    releaseDate: new Date().toISOString(),
    releaseNotes: 'Initial production release.',
    downloads: {
      windows: undefined,
      android: undefined,
      sdk: undefined,
    },
  }

  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.json(manifest)
})

// ---------------------------------------------------------------------------
// Cleanup expired sessions periodically
// ---------------------------------------------------------------------------

setInterval(() => {
  void cleanupExpiredSessions()
}, 5 * 60 * 1000) // Every 5 minutes

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Alpha One Infrastructure server running on http://localhost:${PORT}`)
    // eslint-disable-next-line no-console
    console.log(`  Health: http://localhost:${PORT}/health`)
    // eslint-disable-next-line no-console
    console.log(`  OAuth: http://localhost:${PORT}/google/oauth/start`)
    // eslint-disable-next-line no-console
    console.log(`  Manifest: http://localhost:${PORT}/releases/manifest.json`)
  })
}

export { app }
