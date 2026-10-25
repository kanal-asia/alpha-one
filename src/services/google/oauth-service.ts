/**
 * Google Workspace OAuth 2.0 Service
 *
 * Handles the OAuth flow: authorization URL generation, callback handling,
 * token exchange, and token persistence. All tokens are stored server-side.
 */
import { randomBytes, createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { DATA_ROOT } from '../../lib/data-root'
import {
  loadConnections as loadConnectionsSqlite,
  saveConnections as saveConnectionsSqlite,
  getConnection as getConnectionSqlite,
  saveConnection as saveConnectionSqlite,
  disconnectGoogle as disconnectGoogleSqlite,
} from '../../lib/sqlite-persistence'

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
  /** OpenID Connect identity token — present only when `openid` was requested. */
  id_token?: string
}

export interface GoogleConnection {
  userId: string
  providerUserId?: string
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
]

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const STATES_DIR = join(DATA_ROOT, '.alpha', 'google', 'states')

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
// Connection Persistence (SQLite)
// ---------------------------------------------------------------------------

async function loadConnections(): Promise<Record<string, GoogleConnection>> {
  return loadConnectionsSqlite()
}

async function saveConnections(
  connections: Record<string, GoogleConnection>
): Promise<void> {
  return saveConnectionsSqlite(connections)
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

  let config: GoogleOAuthConfig
  try {
    config = getConfig()
  } catch {
    // Credentials not configured locally — cannot refresh
    return null
  }
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
  return getConnectionSqlite(userId)
}

/**
 * Disconnect Google Workspace for a user.
 */
export async function disconnectGoogle(userId: string): Promise<void> {
  return disconnectGoogleSqlite(userId)
}

/**
 * Save a connection for a user (used by production OAuth flow).
 */
export async function saveConnection(
  userId: string,
  connection: Omit<GoogleConnection, 'userId'>
): Promise<void> {
  return saveConnectionSqlite(userId, connection)
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

// ---------------------------------------------------------------------------
// Product Login (OpenID Connect) — TASK-ALPHA-SUBSCRIPTION-002A
//
// A SEPARATE, minimal authentication flow for Alpha One product identity.
// It requests `openid email profile` ONLY: zero Workspace permissions, a
// distinct consent screen, and no connection to the Workspace connector
// scopes above. The returned ID token is cryptographically verified
// (google-id-token.ts); the canonical product identity is the verified
// `sub`. No Workspace connection is created, no tokens are persisted
// server-side — the verified ID token is handed to the SPA once, via a
// one-time completion code, and the SPA attaches it as Bearer on execution
// requests (see setProductSessionToken + auth-context.ts).
// ---------------------------------------------------------------------------

/** Minimal OIDC scopes for product login — deliberately NOT the Workspace set. */
export const PRODUCT_LOGIN_SCOPES = ['openid', 'email', 'profile']

const LOGIN_STATES_DIR = join(DATA_ROOT, '.alpha', 'google', 'login-states')

export interface ProductLoginIdentity {
  /** Canonical product user id (verified Google `sub`). */
  productUserId: string
  email: string | null
  name: string | null
  picture: string | null
}

interface ProductLoginState {
  state: string
  codeVerifier: string
  returnTo?: string
  createdAt: string
}

interface ProductLoginCompletion {
  identity: ProductLoginIdentity
  /** Verified ID token — handed to the SPA exactly once. */
  idToken: string
  /** Seconds until the ID token expires (informational for the SPA). */
  expiresIn: number
  createdAt: string
}

async function saveProductLoginState(state: ProductLoginState): Promise<void> {
  await mkdir(LOGIN_STATES_DIR, { recursive: true })
  await writeFile(join(LOGIN_STATES_DIR, `${state.state}.json`), JSON.stringify(state, null, 2))
}

async function loadAndDeleteProductLoginState(state: string): Promise<ProductLoginState | null> {
  try {
    const filePath = join(LOGIN_STATES_DIR, `${state}.json`)
    const data = await readFile(filePath, 'utf-8')
    await unlink(filePath).catch(() => {})
    const parsed = JSON.parse(data) as ProductLoginState
    // 10-minute TTL, same as the Workspace flow.
    if (Date.now() - new Date(parsed.createdAt).getTime() > 10 * 60 * 1000) return null
    return parsed
  } catch {
    return null
  }
}

async function saveLoginCompletion(code: string, completion: ProductLoginCompletion): Promise<void> {
  await mkdir(LOGIN_STATES_DIR, { recursive: true })
  await writeFile(join(LOGIN_STATES_DIR, `complete-${code}.json`), JSON.stringify(completion, null, 2))
}

async function loadAndDeleteLoginCompletion(code: string): Promise<ProductLoginCompletion | null> {
  try {
    const filePath = join(LOGIN_STATES_DIR, `complete-${code}.json`)
    const data = await readFile(filePath, 'utf-8')
    await unlink(filePath).catch(() => {})
    const parsed = JSON.parse(data) as ProductLoginCompletion
    if (Date.now() - new Date(parsed.createdAt).getTime() > 10 * 60 * 1000) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * TASK-ALPHA-SUBSCRIBER-017: loopback-safe OAuth return base.
 *
 * The packaged backend serves the SPA at a dynamic loopback port, so the
 * static CLIENT_URL fallback cannot address post-login redirects. A
 * per-request return base (stored in the state record, else the request
 * Origin header) is used when present — but ONLY when it parses as an
 * `http(s)` URL on a loopback host (or exactly the configured CLIENT_URL
 * origin). Anything else falls back, closing the open-redirect path that
 * could otherwise leak the one-time login code to an attacker origin.
 */
export function resolveSafeReturnBase(
  candidate: string | null | undefined,
  fallback: string
): string {
  const pick = (value: string | null | undefined): string | null => {
    if (typeof value !== 'string' || value.length === 0) return null
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return null
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
      return url.origin
    }
    try {
      if (value === new URL(fallback).origin) return url.origin
    } catch {
      // Fall through to null below.
    }
    return null
  }
  return pick(candidate) ?? fallback
}

/**
 * Build the Google product-login authorization URL (OIDC, minimal scopes).
 *
 * Uses the SAME registered redirect URI as the Workspace flow — no Google
 * Cloud console change is required. The two flows share the callback
 * endpoint and are distinguished by OAuth state: product-login states live
 * in a separate store (`peekProductLoginState`), so the Workspace callback
 * path is untouched.
 */
export async function generateProductLoginUrl(
  returnTo?: string
): Promise<{ url: string; state: string }> {
  const config = getConfig()
  const state = generateState()
  const codeVerifier = generateCodeVerifier()
  await saveProductLoginState({ state, codeVerifier, returnTo, createdAt: new Date().toISOString() })
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: PRODUCT_LOGIN_SCOPES.join(' '),
    state,
    code_challenge: generateCodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
  })
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`, state }
}

/**
 * Non-destructive check: does this OAuth state belong to a product login?
 * The router uses this to route the shared callback without touching the
 * Workspace flow. Returns false for missing/expired states (same fail-closed
 * outcome as the Workspace path).
 */
export async function peekProductLoginState(state: string): Promise<boolean> {
  if (typeof state !== 'string' || state.length < 16) return false
  try {
    const data = await readFile(join(LOGIN_STATES_DIR, `${state}.json`), 'utf-8')
    const parsed = JSON.parse(data) as ProductLoginState
    if (Date.now() - new Date(parsed.createdAt).getTime() > 10 * 60 * 1000) return false
    return true
  } catch {
    return false
  }
}

/**
 * Exchange a product-login code, verify the ID token, and mint a one-time
 * completion code. Returns the code plus where the SPA should continue.
 * Never persists a Workspace connection; never stores tokens server-side.
 */
export async function handleProductLoginCallback(
  code: string,
  state: string
): Promise<{ completionCode: string; returnTo?: string }> {
  const config = getConfig()
  const savedState = await loadAndDeleteProductLoginState(state)
  if (!savedState) {
    throw new Error('Invalid or expired product login state. Please try again.')
  }
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
    throw new Error('Product login token exchange failed.')
  }
  const tokens = (await tokenResponse.json()) as GoogleTokens
  if (!tokens.id_token) {
    throw new Error('Product login did not return an identity token.')
  }
  // Verify before trusting anything in the token. Dynamic import keeps the
  // Workspace-only bundle free of the verifier; failure here is fail-closed.
  const { verifyGoogleIdToken } = await import('../opencode/google-id-token')
  const verdict = await verifyGoogleIdToken(tokens.id_token)
  if (!verdict.ok || !verdict.productUserId) {
    throw new Error('Product login identity could not be verified.')
  }
  const completionCode = generateState()
  await saveLoginCompletion(completionCode, {
    identity: {
      productUserId: verdict.productUserId,
      email: verdict.email ?? null,
      name: verdict.name ?? null,
      picture: verdict.picture ?? null,
    },
    idToken: tokens.id_token,
    expiresIn: 3600,
    createdAt: new Date().toISOString(),
  })
  return { completionCode, returnTo: savedState.returnTo }
}

/**
 * Redeem a one-time product-login completion code. Single-use: the stored
 * completion is deleted on read, so a captured code cannot be replayed.
 */
export async function completeProductLogin(
  completionCode: string
): Promise<{ identity: ProductLoginIdentity; idToken: string; expiresIn: number } | null> {
  if (typeof completionCode !== 'string' || completionCode.length < 16) return null
  const completion = await loadAndDeleteLoginCompletion(completionCode)
  if (!completion) return null
  return { identity: completion.identity, idToken: completion.idToken, expiresIn: completion.expiresIn }
}
