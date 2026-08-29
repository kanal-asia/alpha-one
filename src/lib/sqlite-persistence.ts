/**
 * TASK-OPENCODE-107/109/MSI-026: Alpha One SQLite Database Foundation
 *
 * SQLite persistence for Google OAuth connections.
 * Replaces the JSON file-based persistence with SQLite.
 */

// Use createRequire to import node:sqlite (experimental built-in)
// The bundler strips the node: prefix, so we use this pattern
import { createRequire as _createRequire } from 'node:module'
const _require = _createRequire(import.meta.url)
const { DatabaseSync } = _require('node:sqlite') as typeof import('node:sqlite')
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleConnection {
  userId: string
  provider?: string
  providerUserId?: string
  email: string
  accessToken: string
  refreshToken?: string
  tokenExpiry: number
  scopes: string[]
  status?: string
  connectedAt: string
  updatedAt: string
  lastRefreshAt?: string
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const DATA_DIR = join(process.cwd(), 'data')
const DB_PATH = join(DATA_DIR, 'alpha-one.sql')

let db: DatabaseSync | null = null

function getDb(): DatabaseSync {
  if (!db) {
    // Ensure data directory exists
    mkdirSync(DATA_DIR, { recursive: true })

    // Open database
    db = new DatabaseSync(DB_PATH)

    // Create schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS google_connections (
        user_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL DEFAULT 'google',
        provider_user_id TEXT,
        email TEXT NOT NULL,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        token_expiry INTEGER NOT NULL,
        scopes TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        connected_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_refresh_at TEXT
      );
    `)

    // Migration: Add missing columns if they don't exist
    migrateDatabase(db)
  }
  return db
}

function migrateDatabase(database: DatabaseSync): void {
  // Check which columns exist
  const columns = database.prepare("PRAGMA table_info(google_connections)").all() as Array<{ name: string }>
  const columnNames = new Set(columns.map(c => c.name))

  // Add 'provider' column if missing
  if (!columnNames.has('provider')) {
    database.exec("ALTER TABLE google_connections ADD COLUMN provider TEXT NOT NULL DEFAULT 'google'")
  }

  // Add 'status' column if missing
  if (!columnNames.has('status')) {
    database.exec("ALTER TABLE google_connections ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
  }

  // Add 'last_refresh_at' column if missing
  if (!columnNames.has('last_refresh_at')) {
    database.exec("ALTER TABLE google_connections ADD COLUMN last_refresh_at TEXT")
  }
}

// ---------------------------------------------------------------------------
// Connection Operations
// ---------------------------------------------------------------------------

export async function loadConnections(): Promise<Record<string, GoogleConnection>> {
  const database = getDb()
  const stmt = database.prepare('SELECT * FROM google_connections')
  const rows = stmt.all() as Array<{
    user_id: string
    provider: string | null
    provider_user_id: string | null
    email: string
    access_token: string
    refresh_token: string | null
    token_expiry: number
    scopes: string
    status: string | null
    connected_at: string
    updated_at: string
    last_refresh_at: string | null
  }>

  const connections: Record<string, GoogleConnection> = {}
  for (const row of rows) {
    connections[row.user_id] = {
      userId: row.user_id,
      provider: row.provider ?? 'google',
      providerUserId: row.provider_user_id ?? undefined,
      email: row.email,
      accessToken: row.access_token,
      refreshToken: row.refresh_token ?? undefined,
      tokenExpiry: row.token_expiry,
      scopes: JSON.parse(row.scopes),
      status: row.status ?? 'active',
      connectedAt: row.connected_at,
      updatedAt: row.updated_at,
      lastRefreshAt: row.last_refresh_at ?? undefined,
    }
  }
  return connections
}

export async function saveConnections(
  connections: Record<string, GoogleConnection>
): Promise<void> {
  const database = getDb()

  // Delete all existing connections
  database.exec('DELETE FROM google_connections')

  // Insert all connections
  const stmt = database.prepare(`
    INSERT INTO google_connections (user_id, provider, provider_user_id, email, access_token, refresh_token, token_expiry, scopes, status, connected_at, updated_at, last_refresh_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const [userId, connection] of Object.entries(connections)) {
    stmt.run(
      userId,
      connection.provider ?? 'google',
      connection.providerUserId ?? null,
      connection.email,
      connection.accessToken,
      connection.refreshToken ?? null,
      connection.tokenExpiry,
      JSON.stringify(connection.scopes),
      connection.status ?? 'active',
      connection.connectedAt,
      connection.updatedAt,
      connection.lastRefreshAt ?? null
    )
  }
}

export async function getConnection(userId: string): Promise<GoogleConnection | null> {
  const database = getDb()
  const stmt = database.prepare('SELECT * FROM google_connections WHERE user_id = ?')
  const row = stmt.all(userId)[0] as {
    user_id: string
    provider: string | null
    provider_user_id: string | null
    email: string
    access_token: string
    refresh_token: string | null
    token_expiry: number
    scopes: string
    status: string | null
    connected_at: string
    updated_at: string
    last_refresh_at: string | null
  } | undefined

  if (!row) return null

  return {
    userId: row.user_id,
    provider: row.provider ?? 'google',
    providerUserId: row.provider_user_id ?? undefined,
    email: row.email,
    accessToken: row.access_token,
    refreshToken: row.refresh_token ?? undefined,
    tokenExpiry: row.token_expiry,
    scopes: JSON.parse(row.scopes),
    status: row.status ?? 'active',
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
    lastRefreshAt: row.last_refresh_at ?? undefined,
  }
}

export async function saveConnection(
  userId: string,
  connection: Omit<GoogleConnection, 'userId'>
): Promise<void> {
  const database = getDb()
  const stmt = database.prepare(`
    INSERT OR REPLACE INTO google_connections (user_id, provider, provider_user_id, email, access_token, refresh_token, token_expiry, scopes, status, connected_at, updated_at, last_refresh_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  stmt.run(
    userId,
    connection.provider ?? 'google',
    connection.providerUserId ?? null,
    connection.email,
    connection.accessToken,
    connection.refreshToken ?? null,
    connection.tokenExpiry,
    JSON.stringify(connection.scopes),
    connection.status ?? 'active',
    connection.connectedAt,
    connection.updatedAt,
    connection.lastRefreshAt ?? null
  )
}

export async function disconnectGoogle(userId: string): Promise<void> {
  const database = getDb()
  const stmt = database.prepare('DELETE FROM google_connections WHERE user_id = ?')
  stmt.run(userId)
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
