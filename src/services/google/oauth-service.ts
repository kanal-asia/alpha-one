/**
 * Google Workspace OAuth 2.0 Service
 *
 * Handles the OAuth flow: authorization URL generation, callback handling,
 * token exchange, and token persistence. All tokens are stored server-side.
 */
import { randomBytes, createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  scope: string
}

export interface GoogleConnection {
  userId: string
  email: string
  accessToken: string
  refreshToken?: string
  tokenExpiry: number
  scopes: string[]
  connectedAt: string
  updatedAt: string
}

export interface OAuthState {
  state: string
  codeVerifier: string
  returnTo?: string
  createdAt: string
}

// ---------------------------------------------------------------------------
// Scopes - minimum required for Drive folder/file browsing
// ---------------------------------------------------------------------------

export const GOOGLE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/docs.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/presentations.readonly',
  'https://www.googleapis.com/auth/script.projects',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/calendar.readonly',
]

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const CONNECTIONS_DIR = join(process.cwd(), '.alpha', 'google')
const CONNECTIONS_FILE = join(CONNECTIONS_DIR, 'connections.json')
const STATES_DIR = join(CONNECTIONS_DIR, 'states')

function getConfig(): GoogleOAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Google OAuth credentials not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_OAUTH_REDIRECT_URI in your .env file.'
    )
  }

  return { clientId, clientSecret, redirectUri }
}

// ---------------------------------------------------------------------------
// State Management (CSRF protection)
// ---------------------------------------------------------------------------

function generateState(): string {
  return randomBytes(32).toString('hex')
}

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

async function saveOAuthState(state: OAuthState): Promise<void> {
  await mkdir(STATES_DIR, { recursive: true })
  const filePath = join(STATES_DIR, `${state.state}.json`)
  await writeFile(filePath, JSON.stringify(state, null, 2))
}

async function loadAndDeleteOAuthState(state: string): Promise<OAuthState | null> {
  try {
    const filePath = join(STATES_DIR, `${state}.json`)
    const data = await readFile(filePath, 'utf-8')
    await unlink(filePath).catch(() => {})
    return JSON.parse(data) as OAuthState
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Connection Persistence
// ---------------------------------------------------------------------------

async function loadConnections(): Promise<Record<string, GoogleConnection>> {
  try {
    const data = await readFile(CONNECTIONS_FILE, 'utf-8')
    return JSON.parse(data) as Record<string, GoogleConnection>
  } catch {
    return {}
  }
}

async function saveConnections(
  connections: Record<string, GoogleConnection>
): Promise<void> {
  await mkdir(CONNECTIONS_DIR, { recursive: true })
  await writeFile(CONNECTIONS_FILE, JSON.stringify(connections, null, 2))
}

// ---------------------------------------------------------------------------
// OAuth Flow
// ---------------------------------------------------------------------------

/**
 * Generate the Google OAuth authorization URL.
 * Returns the URL and the state parameter for CSRF protection.
 *
 * Optional incremental authorization (TASK-076):
 * - `scopes`: additional scopes to request on top of the baseline set.
 * - `includeGrantedScopes`: preserve every previously granted scope so the
 *   consent is additive and never replaces existing authorization.
 */
export async function generateAuthUrl(
  _userId: string,
  returnTo?: string,
  options?: { scopes?: string[]; includeGrantedScopes?: boolean }
): Promise<{
  url: string
  state: string
}> {
  const config = getConfig()
  const state = generateState()
  const codeVerifier = generateCodeVerifier()

  await saveOAuthState({
    state,
    codeVerifier,
    returnTo,
    createdAt: new Date().toISOString(),
  })

  const codeChallenge = generateCodeChallenge(codeVerifier)

  const scopes = [...GOOGLE_OAUTH_SCOPES, ...(options?.scopes ?? [])]

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

  if (options?.includeGrantedScopes) {
    params.set('include_granted_scopes', 'true')
  }

  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state,
  }
}

/**
 * Exchange authorization code for tokens and persist the connection.
 */
export async function handleOAuthCallback(
  code: string,
  state: string,
  userId: string
): Promise<GoogleConnection & { _returnTo?: string }> {
  const config = getConfig()

  // Validate state (CSRF protection)
  const savedState = await loadAndDeleteOAuthState(state)
  if (!savedState) {
    throw new Error('Invalid or expired OAuth state. Please try again.')
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
      code_verifier: savedState.codeVerifier,
    }),
  })

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text()
    throw new Error(`Token exchange failed: ${error}`)
  }

  const tokens: GoogleTokens = await tokenResponse.json() as GoogleTokens

  // Get user info to identify the account
  const userInfoResponse = await fetch(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }
  )

  if (!userInfoResponse.ok) {
    throw new Error('Failed to fetch user info from Google.')
  }

  const userInfo = await userInfoResponse.json() as { email: string; name: string }

  // Persist connection
  const connections = await loadConnections()
  const connection: GoogleConnection = {
    userId,
    email: userInfo.email,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiry: Date.now() + tokens.expires_in * 1000,
    scopes: tokens.scope.split(' '),
    connectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  connections[userId] = connection
  await saveConnections(connections)

  return { ...connection, _returnTo: savedState.returnTo }
}

/**
 * Get a valid access token for the user, refreshing if necessary.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const connections = await loadConnections()
  const connection = connections[userId]

  if (!connection) return null

  // Check if token is expired (with 5 minute buffer)
  if (Date.now() < connection.tokenExpiry - 5 * 60 * 1000) {
    return connection.accessToken
  }

  // Token expired, try to refresh
  if (!connection.refreshToken) return null

  const config = getConfig()
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
    // Refresh failed, connection is invalid
    await disconnectGoogle(userId)
    return null
  }

  const tokens: GoogleTokens = await refreshResponse.json() as GoogleTokens

  // Update connection with new token
  connection.accessToken = tokens.access_token
  connection.tokenExpiry = Date.now() + tokens.expires_in * 1000
  connection.updatedAt = new Date().toISOString()

  connections[userId] = connection
  await saveConnections(connections)

  return connection.accessToken
}

/**
 * Get the connection status for a user.
 */
export async function getConnection(
  userId: string
): Promise<GoogleConnection | null> {
  const connections = await loadConnections()
  return connections[userId] ?? null
}

/**
 * Disconnect Google Workspace for a user.
 */
export async function disconnectGoogle(userId: string): Promise<void> {
  const connections = await loadConnections()
  delete connections[userId]
  await saveConnections(connections)
}

/**
 * Check if Google OAuth is configured.
 */
export function isConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_OAUTH_REDIRECT_URI
  )
}
