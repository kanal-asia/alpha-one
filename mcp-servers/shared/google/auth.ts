/**
 * TASK-066: Shared local Google OAuth credential access.
 *
 * Reads the existing local credential file used by the proven Google Sheets MCP
 * (mcp-servers/google-sheets/server.ts) and returns a usable access token,
 * refreshing it locally when near expiry.
 *
 * Boundary:
 * - Credentials stay on the user's machine. This module never sends credentials
 *   anywhere except Google's OAuth token endpoint during refresh.
 * - It knows nothing about service scopes, tools, or API calls.
 * - It never decides which scopes a service needs (that belongs to each
 *   service's authorization layer).
 */

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface GoogleConnection {
  userId?: string
  email?: string
  accessToken: string
  refreshToken?: string
  tokenExpiry: number
  scopes?: string[]
}

const DEFAULT_CONNECTIONS_FILE = join(process.cwd(), '.alpha', 'google', 'connections.json')
const DEFAULT_CONNECTION_KEY = 'local-user'

export function connectionsFilePath(): string {
  return process.env.GOOGLE_CONNECTIONS_FILE || DEFAULT_CONNECTIONS_FILE
}

export function connectionKeyName(): string {
  return process.env.GOOGLE_CONNECTION_KEY || DEFAULT_CONNECTION_KEY
}

/** Persist an updated connection for the active local key, preserving the file format. */
export async function persistConnection(updated: GoogleConnection): Promise<void> {
  const file = connectionsFilePath()
  const allData = await readFile(file, 'utf-8')
  const all = JSON.parse(allData) as Record<string, GoogleConnection>
  all[connectionKeyName()] = updated
  await writeFile(file, JSON.stringify(all, null, 2))
}

export async function loadGoogleConnection(): Promise<GoogleConnection | null> {
  try {
    const data = await readFile(connectionsFilePath(), 'utf-8')
    const connections = JSON.parse(data) as Record<string, GoogleConnection>
    return connections[connectionKeyName()] ?? null
  } catch {
    return null
  }
}

/** Expose the granted scopes stored in the local credentials (read-only view). */
export async function getGrantedScopes(): Promise<string[] | undefined> {
  const conn = await loadGoogleConnection()
  return conn?.scopes
}

export async function getAccessToken(): Promise<string> {
  const conn = await loadGoogleConnection()
  if (!conn) {
    throw new Error('Google account not connected. Connect your Google account locally before using this MCP.')
  }

  // Token still valid (5 min buffer)
  if (Date.now() < conn.tokenExpiry - 5 * 60 * 1000) {
    return conn.accessToken
  }

  // Try refresh
  if (!conn.refreshToken) {
    throw new Error('Google authorization expired. Reconnect your Google account locally.')
  }

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth credentials not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).')
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!resp.ok) {
    throw new Error('Google authorization expired. Reconnect your Google account locally.')
  }

  const tokens = (await resp.json()) as { access_token: string; expires_in: number }

  // Write back only the token fields, preserving the existing credential format.
  const file = connectionsFilePath()
  const allData = await readFile(file, 'utf-8')
  const all = JSON.parse(allData) as Record<string, GoogleConnection>
  const updated: GoogleConnection = {
    ...all[connectionKeyName()],
    accessToken: tokens.access_token,
    tokenExpiry: Date.now() + tokens.expires_in * 1000,
  }
  await persistConnection(updated)

  return updated.accessToken
}