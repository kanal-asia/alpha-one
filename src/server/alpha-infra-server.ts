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
import { join } from 'node:path'
import { DATA_ROOT } from '../lib/data-root'
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

import { saveConnection, getConnection, upsertCanonicalProfile, upsertConnectionMetadata, recordDownloadEvent } from '../lib/sqlite-persistence'
import { stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PORT = Number(process.env.PORT) || 3002
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000'
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000 // 5 minutes safety buffer

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
// TASK-MSI-027: VPS Token Refresh
// ---------------------------------------------------------------------------

/**
 * Get a valid Google access token for the specified user.
 *
 * This function:
 * 1. Loads the user's Google connection from VPS SQLite
 * 2. Checks if the access token is still valid (with 5-minute safety buffer)
 * 3. If valid, returns the existing access token
 * 4. If expired and refresh_token exists, calls Google's token endpoint
 * 5. On success, persists the new tokens and returns the new access token
 * 6. On failure, returns null (connection preserved for retry)
 *
 * @param userId - The user ID (always 'local-user' in single-user architecture)
 * @returns Valid access token, or null if unavailable/expired
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  // 1. Load connection from SQLite
  const connection = await getConnection(userId)
  if (!connection) {
    return null
  }

  // 2. Check if token is still valid (with safety buffer)
  if (Date.now() < connection.tokenExpiry - TOKEN_EXPIRY_BUFFER_MS) {
    return connection.accessToken
  }

  // 3. No refresh token available - cannot refresh
  if (!connection.refreshToken) {
    return null
  }

  // 4. Attempt refresh via Google token endpoint
  try {
    const config = getGoogleConfig()

    const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: connection.refreshToken,
        grant_type: 'refresh_token',
      }),
    })

    if (!refreshResponse.ok) {
      // Refresh failed - connection preserved for retry
      return null
    }

    const tokens = await refreshResponse.json() as {
      access_token: string
      refresh_token?: string
      expires_in: number
    }

    // 5. Persist refreshed tokens
    const now = new Date().toISOString()
    await saveConnection(userId, {
      provider: connection.provider ?? 'google',
      providerUserId: connection.providerUserId,
      email: connection.email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? connection.refreshToken, // Handle rotation
      tokenExpiry: Date.now() + tokens.expires_in * 1000,
      scopes: connection.scopes,
      status: connection.status ?? 'active',
      connectedAt: connection.connectedAt,
      updatedAt: now,
      lastRefreshAt: now,
    })

    return tokens.access_token
  } catch {
    // Network error - connection preserved for retry
    return null
  }
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
    const { sessionId, returnTo } = req.body as {
      sessionId?: string
      returnTo?: string
    }

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    // Validate returnTo URL to prevent open redirect attacks
    // Only allow localhost URLs for local-first architecture
    let validatedReturnTo: string | undefined
    if (returnTo) {
      try {
        const returnUrl = new URL(returnTo)
        // Only allow localhost URLs (http or https)
        if (
          returnUrl.hostname === 'localhost' ||
          returnUrl.hostname === '127.0.0.1' ||
          returnUrl.hostname === '::1'
        ) {
          validatedReturnTo = returnTo
        }
      } catch {
        // Invalid URL, ignore
      }
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
      returnTo: validatedReturnTo,
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
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/docs.readonly',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/presentations.readonly',
      'https://www.googleapis.com/auth/presentations',
      'https://www.googleapis.com/auth/script.projects',
      'https://www.googleapis.com/auth/script.scriptapp',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      // People API profile enrichment scopes
      'https://www.googleapis.com/auth/user.addresses.read',
      'https://www.googleapis.com/auth/user.birthday.read',
      'https://www.googleapis.com/auth/user.gender.read',
      'https://www.googleapis.com/auth/user.organization.read',
      'https://www.googleapis.com/auth/user.phonenumbers.read',
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
          join(DATA_ROOT, '.alpha', 'infra', 'sessions.json'),
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

    // TASK-ALPHA-VPS-069: Canonical metadata persistence (credential-free,
    // provider-keyed, idempotent). Failure is observable via server logs but
    // must not break the OAuth redirect contract.
    try {
      const observedAt = new Date().toISOString()
      await upsertCanonicalProfile({
        providerUserId: identity.providerUserId,
        provider: identity.provider,
        email: identity.email,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        observedAt,
      })
      await upsertConnectionMetadata({
        providerUserId: identity.providerUserId,
        provider: identity.provider,
        email: identity.email,
        status: 'connected',
        observedAt,
      })
    } catch (metadataErr) {
      // eslint-disable-next-line no-console
      console.error(
        '[canonical-metadata] failed to persist OAuth metadata for provider_user_id:',
        identity.providerUserId,
        metadataErr instanceof Error ? metadataErr.message : metadataErr
      )
    }

    // MSI-069 Case A: VPS-side credential persistence REMOVED. Audit proved no
    // desktop production consumer reads the VPS `google_connections` row —
    // desktop obtains one-time tokens from /verify and persists LOCALLY, and
    // no caller uses VPS /google/access-token or /google/connection. The
    // shared 'local-user' row was ambiguous multi-device state with no proven
    // consumer. Identity row (upsertIdentity) and session completion above are
    // the only VPS writes the desktop flow requires.

    // Redirect to success page
    // Use returnTo from session if available, otherwise fallback to CLIENT_URL
    const redirectUrl = sessionEntry.returnTo
      ? `${sessionEntry.returnTo}?google_connected=true`
      : `${CLIENT_URL}/settings?google_connected=true`
    return res.redirect(redirectUrl)
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

    // Return tokens and identity
    // NOTE: Session is NOT deleted here to avoid race condition with
    // persist-production (which verifies against /status before persisting).
    // Expired sessions are cleaned up by the 5-minute cleanup interval.
    return res.json({
      status: 'completed',
      identity: session.identity,
      tokens: session.tokens,
    })
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to verify session',
    })
  }
})

// ---------------------------------------------------------------------------
// Google Connection — Stored Connection (SQLite read-back)
// ---------------------------------------------------------------------------

app.get('/google/connection', async (_req: Request, res: Response) => {
  try {
    const connection = await getConnection('local-user')

    if (!connection) {
      return res.status(404).json({ error: 'No Google connection found' })
    }

    // Return connection metadata (NOT tokens - security)
    return res.json({
      provider: connection.provider,
      email: connection.email,
      providerUserId: connection.providerUserId,
      scopes: connection.scopes,
      status: connection.status,
      connectedAt: connection.connectedAt,
      updatedAt: connection.updatedAt,
      lastRefreshAt: connection.lastRefreshAt,
    })
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to read connection',
    })
  }
})

// ---------------------------------------------------------------------------
// TASK-MSI-027/028: Google Access Token (for VPS API proxying)
// ---------------------------------------------------------------------------

app.get('/google/access-token', async (_req: Request, res: Response) => {
  try {
    const accessToken = await getValidAccessToken('local-user')

    if (!accessToken) {
      return res.status(401).json({
        error: 'Google account not connected or token refresh failed',
      })
    }

    // Return access token for VPS-internal API proxying
    // This endpoint is NOT exposed to external clients
    return res.json({ accessToken })
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to get access token',
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
// Google People API — Profile Extraction
// ---------------------------------------------------------------------------

app.get('/google/people/profile', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.query as { sessionId?: string }

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId is required' })
    }

    // Get the session to find the access token
    const session = await getOAuthSession(sessionId)
    if (!session || session.status !== 'completed' || !session.tokens) {
      return res.status(404).json({ error: 'Session not found or not completed' })
    }

    const accessToken = session.tokens.accessToken

    // Request full People API profile
    const personFields = [
      'addresses',
      'ageRanges',
      'biographies',
      'birthdays',
      'calendarUrls',
      'clientData',
      'coverPhotos',
      'emailAddresses',
      'events',
      'externalIds',
      'genders',
      'imClients',
      'interests',
      'locales',
      'locations',
      'memberships',
      'metadata',
      'miscKeywords',
      'names',
      'nicknames',
      'occupations',
      'organizations',
      'phoneNumbers',
      'photos',
      'relations',
      'sipAddresses',
      'skills',
      'urls',
      'userDefined',
    ].join(',')

    const response = await fetch(
      `https://people.googleapis.com/v1/people/me?personFields=${personFields}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )

    if (!response.ok) {
      const error = await response.text()
      return res.status(response.status).json({
        error: `People API request failed: ${error}`,
      })
    }

    const profile = await response.json()

    // Remove any tokens from the response before returning
    delete profile.tokens

    return res.json(profile)
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to fetch profile',
    })
  }
})

// ---------------------------------------------------------------------------
// TASK-MSI-028: Google Drive API Proxy
// ---------------------------------------------------------------------------

const GOOGLE_DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'

const DRIVE_LIST_FIELDS = 'nextPageToken,files(id,name,mimeType,modifiedTime,size,iconLink,webViewLink,thumbnailLink,hasThumbnail,videoMediaMetadata,parents)'

/**
 * Authenticated fetch wrapper for Google Drive API.
 * Uses VPS-side getValidAccessToken() for token management.
 */
async function driveProxyFetch<T>(
  userId: string,
  path: string,
  params: Record<string, string> = {},
  options: RequestInit = {}
): Promise<T> {
  const accessToken = await getValidAccessToken(userId)
  if (!accessToken) {
    throw new Error('Google account not connected or token refresh failed')
  }

  const url = new URL(path)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  const response = await fetch(url.toString(), {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorBody = await response.text()
    const error = new Error(`Google Drive API error: ${response.status}`)
    ;(error as any).status = response.status
    ;(error as any).body = errorBody
    throw error
  }

  return response.json() as Promise<T>
}

/**
 * List files from Google Drive.
 * GET /google/drive/files?q=...&pageSize=...&pageToken=...&orderBy=...&fields=...
 */
app.get('/google/drive/files', async (req: Request, res: Response) => {
  try {
    const userId = 'local-user'
    const { q, pageSize, pageToken, orderBy, fields } = req.query as {
      q?: string
      pageSize?: string
      pageToken?: string
      orderBy?: string
      fields?: string
    }

    const params: Record<string, string> = {
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
    }

    if (q) params.q = q
    if (pageSize) params.pageSize = pageSize
    if (pageToken) params.pageToken = pageToken
    if (orderBy) params.orderBy = orderBy
    params.fields = fields || DRIVE_LIST_FIELDS

    const result = await driveProxyFetch<any>(
      userId,
      `${GOOGLE_DRIVE_API_BASE}/files`,
      params
    )

    return res.json(result)
  } catch (err: any) {
    const status = err.status || 500
    return res.status(status).json({
      error: err.message || 'Failed to list Drive files',
    })
  }
})

/**
 * Get file metadata from Google Drive.
 * GET /google/drive/files/:fileId?fields=...
 */
app.get('/google/drive/files/:fileId', async (req: Request, res: Response) => {
  try {
    const userId = 'local-user'
    const { fileId } = req.params
    const { fields } = req.query as { fields?: string }

    const params: Record<string, string> = {
      supportsAllDrives: 'true',
    }
    if (fields) params.fields = fields

    const result = await driveProxyFetch<any>(
      userId,
      `${GOOGLE_DRIVE_API_BASE}/files/${fileId}`,
      params
    )

    return res.json(result)
  } catch (err: any) {
    const status = err.status || 500
    return res.status(status).json({
      error: err.message || 'Failed to get file metadata',
    })
  }
})

/**
 * Download/export file content from Google Drive.
 * GET /google/drive/files/:fileId/content?mimeType=...&alt=media
 */
app.get('/google/drive/files/:fileId/content', async (req: Request, res: Response) => {
  try {
    const userId = 'local-user'
    const { fileId } = req.params
    const { mimeType } = req.query as { mimeType?: string; alt?: string }

    const accessToken = await getValidAccessToken(userId)
    if (!accessToken) {
      return res.status(401).json({ error: 'Google account not connected or token refresh failed' })
    }

    // Determine if this is an export or media download
    let url: string
    if (mimeType && mimeType !== 'application/vnd.google-apps.script') {
      // Export Google Workspace file
      url = `${GOOGLE_DRIVE_API_BASE}/files/${fileId}/export?mimeType=${encodeURIComponent(mimeType)}`
    } else {
      // Download binary content
      url = `${GOOGLE_DRIVE_API_BASE}/files/${fileId}?alt=media`
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      const errorBody = await response.text()
      const error = new Error(`Google Drive API error: ${response.status}`)
      ;(error as any).status = response.status
      ;(error as any).body = errorBody
      throw error
    }

    // Stream the response
    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    res.setHeader('Content-Type', contentType)

    if (response.headers.get('content-length')) {
      res.setHeader('Content-Length', response.headers.get('content-length')!)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      return res.status(500).json({ error: 'Failed to stream response' })
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
    res.end()
  } catch (err: any) {
    const status = err.status || 500
    return res.status(status).json({
      error: err.message || 'Failed to download file',
    })
  }
})

/**
 * Proxy thumbnail image from Google Drive.
 * GET /google/drive/files/:fileId/thumbnail
 */
app.get('/google/drive/files/:fileId/thumbnail', async (req: Request, res: Response) => {
  try {
    const userId = 'local-user'
    const { fileId } = req.params

    // First get the file metadata to find the thumbnail link
    const metadata = await driveProxyFetch<any>(
      userId,
      `${GOOGLE_DRIVE_API_BASE}/files/${fileId}`,
      { fields: 'thumbnailLink,hasThumbnail', supportsAllDrives: 'true' }
    )

    if (!metadata.thumbnailLink) {
      return res.status(404).json({ error: 'No thumbnail available' })
    }

    // Fetch the thumbnail
    const accessToken = await getValidAccessToken(userId)
    if (!accessToken) {
      return res.status(401).json({ error: 'Google account not connected' })
    }

    const response = await fetch(metadata.thumbnailLink, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch thumbnail' })
    }

    // Stream the thumbnail
    const contentType = response.headers.get('content-type') || 'image/jpeg'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=3600')

    const reader = response.body?.getReader()
    if (!reader) {
      return res.status(500).json({ error: 'Failed to stream thumbnail' })
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(value)
    }
    res.end()
  } catch (err: any) {
    const status = err.status || 500
    return res.status(status).json({
      error: err.message || 'Failed to proxy thumbnail',
    })
  }
})

// ---------------------------------------------------------------------------
// TASK-ALPHA-VPS-069: Public artifact download tracking
// ---------------------------------------------------------------------------
//
// Topology: Cloudflare -> Caddy -> Node. Caddy routes /downloads/* here
// (static file_server no longer serves them). Only proxy headers produced
// by this topology are trusted: CF-Connecting-IP / CF-IPCountry / CF-RAY
// (Cloudflare) and X-Forwarded-For (appended by Caddy). Arbitrary
// client-supplied forwarding headers are ignored. Geographic fields are
// best-effort: only what Cloudflare actually sends is persisted; the rest
// stays NULL (never fabricated, no GeoIP lookup).
//
// Event policy (documented to avoid count inflation):
// - HEAD            -> headers only, NO event.
// - GET, no Range   -> 200 full body + one event.
// - GET, single Range starting at byte 0 -> 206 partial + one event.
// - GET, resumed Range (start > 0) / If-Range mismatch -> 206, NO event.
// - GET, multipart Range -> Range ignored, 200 full + one event.
// - Invalid Range   -> 416, NO event.

const DOWNLOADS_DIR =
  process.env.ALPHA_DOWNLOADS_DIR || '/var/www/kanal.asia/alpha/downloads'

function singleHeader(req: Request, name: string): string | null {
  const value = req.headers[name]
  if (typeof value !== 'string' || !value.trim()) return null
  return value.trim().split(',')[0].trim() || null
}

function getDownloadClientIp(req: Request): string | null {
  return (
    singleHeader(req, 'cf-connecting-ip') ??
    singleHeader(req, 'x-forwarded-for') ??
    req.socket.remoteAddress ??
    null
  )
}

function downloadContentType(fileName: string): string {
  if (fileName.endsWith('.exe')) return 'application/octet-stream'
  if (fileName.endsWith('.msi')) return 'application/octet-stream'
  if (fileName.endsWith('.zip')) return 'application/zip'
  if (fileName.endsWith('.json')) return 'application/json'
  return 'application/octet-stream'
}

async function handleDownload(req: Request, res: Response): Promise<void> {
  try {
    const rel = (req.params as Record<string, string>)[0] ?? ''
    const resolved = join(DOWNLOADS_DIR, rel)
    // Path-traversal guard: resolved path must stay inside DOWNLOADS_DIR.
    if (!resolved.startsWith(DOWNLOADS_DIR + '/')) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    let fileStat
    try {
      fileStat = await stat(resolved)
    } catch {
      res.status(404).json({ error: 'Not found' })
      return
    }
    if (!fileStat.isFile()) {
      res.status(404).json({ error: 'Not found' })
      return
    }

    const size = fileStat.size
    const artifact = resolved.split('/').pop() ?? rel
    const etag = `W/"${size.toString(16)}-${Number(fileStat.mtimeMs).toString(16)}"`
    const lastModified = fileStat.mtime.toUTCString()

    const recordEvent = async (): Promise<void> => {
      try {
        await recordDownloadEvent({
          artifact,
          // No version source exists alongside the served artifacts;
          // stored as NULL rather than fabricated.
          version: null,
          path: req.path,
          ipAddress: getDownloadClientIp(req),
          // Best-effort Cloudflare geo/request metadata. CF-IPCountry and
          // CF-RAY arrive on all plans; city/region headers require extra
          // Cloudflare configuration and are NULL when absent.
          countryCode: singleHeader(req, 'cf-ipcountry'),
          country: null,
          region:
            singleHeader(req, 'cf-region') ??
            singleHeader(req, 'cf-region-code'),
          city: singleHeader(req, 'cf-ipcity') ?? singleHeader(req, 'cf-city'),
          userAgent:
            typeof req.headers['user-agent'] === 'string'
              ? req.headers['user-agent']
              : null,
          referer:
            typeof req.headers['referer'] === 'string'
              ? req.headers['referer']
              : null,
          cfRay: singleHeader(req, 'cf-ray'),
          downloadedAt: new Date().toISOString(),
        })
      } catch (eventErr) {
        // eslint-disable-next-line no-console
        console.error(
          '[download-events] failed to record event for path:',
          req.path,
          eventErr instanceof Error ? eventErr.message : eventErr
        )
      }
    }

    res.setHeader('Content-Type', downloadContentType(artifact))
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Last-Modified', lastModified)
    res.setHeader('ETag', etag)

    // HEAD: reachable check only, never a download event.
    if (req.method === 'HEAD') {
      res.setHeader('Content-Length', String(size))
      res.status(200).end()
      return
    }

    const rangeHeader =
      typeof req.headers.range === 'string' ? req.headers.range : null

    if (!rangeHeader) {
      res.setHeader('Content-Length', String(size))
      res.status(200)
      await recordEvent()
      createReadStream(resolved).on('error', () => res.destroy()).pipe(res)
      return
    }

    // Multipart ranges are not supported: serve the full body instead.
    const single = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
    if (!single || rangeHeader.includes(',')) {
      res.setHeader('Content-Length', String(size))
      res.status(200)
      await recordEvent()
      createReadStream(resolved).on('error', () => res.destroy()).pipe(res)
      return
    }

    let start = single[1] === '' ? NaN : Number(single[1])
    let end = single[2] === '' ? NaN : Number(single[2])
    if (Number.isNaN(start)) {
      // Suffix range: last N bytes.
      start = Number.isNaN(end) ? NaN : Math.max(size - end, 0)
      end = size - 1
    } else if (Number.isNaN(end)) {
      end = size - 1
    }
    if (Number.isNaN(start) || start < 0 || start >= size || end < start) {
      res.setHeader('Content-Range', `bytes */${size}`)
      res.status(416).end()
      return
    }
    end = Math.min(end, size - 1)

    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`)
    res.setHeader('Content-Length', String(end - start + 1))
    res.status(206)
    // Only the initial chunk (start == 0) counts as a download event;
    // resumed chunks must not inflate the count.
    if (start === 0) {
      await recordEvent()
    }
    createReadStream(resolved, { start, end })
      .on('error', () => res.destroy())
      .pipe(res)
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Download failed',
      })
    } else {
      res.destroy()
    }
  }
}

app.get('/downloads/*', handleDownload)
app.head('/downloads/*', handleDownload)

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
