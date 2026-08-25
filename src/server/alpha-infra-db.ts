/**
 * TASK-OPENCODE-100: Alpha One Infrastructure Database
 *
 * JSON-file-based identity persistence for Google OAuth.
 * Stores provider identities (Google) for production auth.
 *
 * Design: Simple JSON file storage (no native dependencies).
 * Suitable for single-server deployment. For multi-server,
 * migrate to SQLite or PostgreSQL.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleIdentity {
  provider: 'google'
  providerUserId: string
  email: string
  displayName: string
  avatarUrl: string | null
  createdAt: string
  updatedAt: string
}

export interface OAuthSession {
  sessionId: string
  state: string
  codeVerifier: string
  returnTo?: string
  status: 'pending' | 'completed' | 'failed'
  identity: GoogleIdentity | null
  tokens: {
    accessToken: string
    refreshToken?: string
    expiresAt: number
  } | null
  error: string | null
  createdAt: string
  expiresAt: string
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const DATA_DIR = join(process.cwd(), '.alpha', 'infra')
const IDENTITIES_FILE = join(DATA_DIR, 'identities.json')
const SESSIONS_FILE = join(DATA_DIR, 'sessions.json')

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
}

async function readJson<T>(filePath: string): Promise<T> {
  try {
    const data = await readFile(filePath, 'utf-8')
    return JSON.parse(data) as T
  } catch {
    return {} as T
  }
}

async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await ensureDataDir()
  await writeFile(filePath, JSON.stringify(data, null, 2))
}

// ---------------------------------------------------------------------------
// Identity Operations
// ---------------------------------------------------------------------------

export async function getIdentityByGoogleSub(
  googleSub: string
): Promise<GoogleIdentity | null> {
  const identities = await readJson<Record<string, GoogleIdentity>>(
    IDENTITIES_FILE
  )
  return identities[`google:${googleSub}`] ?? null
}

export async function upsertIdentity(identity: GoogleIdentity): Promise<void> {
  const identities = await readJson<Record<string, GoogleIdentity>>(
    IDENTITIES_FILE
  )
  const key = `google:${identity.providerUserId}`
  const existing = identities[key]

  if (existing) {
    identities[key] = {
      ...existing,
      email: identity.email,
      displayName: identity.displayName,
      avatarUrl: identity.avatarUrl,
      updatedAt: new Date().toISOString(),
    }
  } else {
    identities[key] = identity
  }

  await writeJson(IDENTITIES_FILE, identities)
}

// ---------------------------------------------------------------------------
// Session Operations (for OAuth polling)
// ---------------------------------------------------------------------------

export async function createOAuthSession(
  session: OAuthSession
): Promise<void> {
  const sessions = await readJson<Record<string, OAuthSession>>(
    SESSIONS_FILE
  )
  sessions[session.sessionId] = session
  await writeJson(SESSIONS_FILE, sessions)
}

export async function getOAuthSession(
  sessionId: string
): Promise<OAuthSession | null> {
  const sessions = await readJson<Record<string, OAuthSession>>(
    SESSIONS_FILE
  )
  const session = sessions[sessionId]
  if (!session) return null

  // Check expiry
  if (new Date(session.expiresAt) < new Date()) {
    delete sessions[sessionId]
    await writeJson(SESSIONS_FILE, sessions)
    return null
  }

  return session
}

export async function completeOAuthSession(
  sessionId: string,
  identity: GoogleIdentity,
  tokens: OAuthSession['tokens']
): Promise<void> {
  const sessions = await readJson<Record<string, OAuthSession>>(
    SESSIONS_FILE
  )
  const session = sessions[sessionId]
  if (!session) return

  session.status = 'completed'
  session.identity = identity
  session.tokens = tokens
  await writeJson(SESSIONS_FILE, sessions)
}

export async function failOAuthSession(
  sessionId: string,
  error: string
): Promise<void> {
  const sessions = await readJson<Record<string, OAuthSession>>(
    SESSIONS_FILE
  )
  const session = sessions[sessionId]
  if (!session) return

  session.status = 'failed'
  session.error = error
  await writeJson(SESSIONS_FILE, sessions)
}

export async function cleanupExpiredSessions(): Promise<void> {
  const sessions = await readJson<Record<string, OAuthSession>>(
    SESSIONS_FILE
  )
  const now = new Date()
  let changed = false

  for (const [id, session] of Object.entries(sessions)) {
    if (new Date(session.expiresAt) < now) {
      delete sessions[id]
      changed = true
    }
  }

  if (changed) {
    await writeJson(SESSIONS_FILE, sessions)
  }
}
