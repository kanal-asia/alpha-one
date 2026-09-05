/**
 * TASK-066 / MSI-054: Shared Google OAuth credential access.
 *
 * Returns a usable access token by calling the Alpha One backend, which
 * owns the SQLite credential state and server-side client credentials.
 *
 * Boundary:
 * - Credentials stay on the backend. This module never handles client
 *   secrets — only the returned access token.
 * - It knows nothing about service scopes, tools, or API calls.
 * - It never decides which scopes a service needs (that belongs to each
 *   service's authorization layer).
 */

export interface GoogleConnection {
  userId?: string
  email?: string
  accessToken: string
  refreshToken?: string
  tokenExpiry: number
  scopes?: string[]
}

/**
 * Backend base URL. In the Electron MSI runtime the backend listens on
 * 127.0.0.1:PORT where PORT is injected by the Electron main process.
 * MCP servers inherit this via process.env from the spawned backend.
 */
export function getBackendBaseUrl(): string {
  const port = process.env.PORT || '3001'
  return `http://127.0.0.1:${port}`
}

/**
 * Fetch a valid access token from the Alpha One backend.
 *
 * The backend reads from SQLite (google_connections), validates token
 * expiry, refreshes using server-side GOOGLE_CLIENT_ID/SECRET if needed,
 * and returns the valid token. This keeps client secrets server-side only.
 */
export async function getAccessToken(): Promise<string> {
  const baseUrl = getBackendBaseUrl()
  const resp = await fetch(`${baseUrl}/api/google/oauth/mcp/token`)

  if (resp.status === 401) {
    const body = await resp.json().catch(() => ({}))
    const msg = (body as { error?: string }).error || 'Google account not connected.'
    throw new Error(msg)
  }

  if (!resp.ok) {
    throw new Error(`Google auth backend unavailable (HTTP ${resp.status}). Is the Alpha One backend running?`)
  }

  const data = (await resp.json()) as { accessToken: string; email?: string }
  return data.accessToken
}

/**
 * Load the current Google connection metadata from the backend.
 * Returns null if not connected.
 */
export async function loadGoogleConnection(): Promise<GoogleConnection | null> {
  try {
    const baseUrl = getBackendBaseUrl()
    const resp = await fetch(`${baseUrl}/api/google/oauth/status`)
    if (!resp.ok) return null
    const data = (await resp.json()) as { connected: boolean; email?: string; scopes?: string[] }
    if (!data.connected) return null
    return { email: data.email, accessToken: '', tokenExpiry: 0, scopes: data.scopes }
  } catch {
    return null
  }
}

/** Expose the granted scopes stored in the local credentials (read-only view). */
export async function getGrantedScopes(): Promise<string[] | undefined> {
  try {
    const baseUrl = getBackendBaseUrl()
    const resp = await fetch(`${baseUrl}/api/google/oauth/status`)
    if (!resp.ok) return undefined
    const data = (await resp.json()) as { connected: boolean; scopes?: string[] }
    return data.scopes
  } catch {
    return undefined
  }
}

/**
 * Persist an updated connection. Used by progressive authorization
 * (scope expansion) in capabilities.ts.
 *
 * NOTE: In the MSI production environment, this is a no-op because
 * progressive authorization requires GOOGLE_CLIENT_ID/SECRET which
 * are not available client-side. The main production OAuth flow handles
 * full-scope authorization via the VPS.
 */
export async function persistConnection(_updated: GoogleConnection): Promise<void> {
  console.warn('[Google Auth] persistConnection called — progressive authorization is not supported in MSI runtime. Use the production OAuth flow for scope changes.')
}
