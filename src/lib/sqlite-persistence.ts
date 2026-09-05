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
import { DATA_ROOT } from './data-root'

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
// TASK-ALPHA-VPS-069: Canonical metadata types (no credentials)
// ---------------------------------------------------------------------------

export interface CanonicalGoogleProfile {
  providerUserId: string
  provider: string
  email: string | null
  displayName: string | null
  avatarUrl: string | null
  firstSeenAt: string
  lastSeenAt: string
  createdAt: string
  updatedAt: string
}

export interface CanonicalConnectionMetadata {
  providerUserId: string
  provider: string
  email: string | null
  status: string
  connectedAt: string
  updatedAt: string
  lastSeenAt: string
  disconnectedAt: string | null
  // TASK-ALPHA-VPS-071: factual connection telemetry (successful OAuth only)
  firstConnectedAt: string | null
  lastConnectedAt: string | null
  connectionCount: number
  // TASK-ALPHA-VPS-071: activity telemetry schema (UNWIRED — no safe shared
  // MCP success boundary exists on VPS; stays NULL, never fabricated)
  firstActivityAt: string | null
  lastActivityAt: string | null
  activityCount: number
  lastActivityTool: string | null
}

export interface DownloadEvent {
  id: number
  artifact: string
  version: string | null
  path: string
  ipAddress: string | null
  countryCode: string | null
  country: string | null
  region: string | null
  city: string | null
  userAgent: string | null
  referer: string | null
  cfRay: string | null
  downloadedAt: string
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const DATA_DIR = join(DATA_ROOT, 'data')
const DB_PATH = join(DATA_DIR, 'alpha-one.sql')

let db: InstanceType<typeof DatabaseSync> | null = null

function getDb(): InstanceType<typeof DatabaseSync> {
  if (!db) {
    // Ensure data directory exists
    mkdirSync(DATA_DIR, { recursive: true })

    // Open database
    db = new DatabaseSync(DB_PATH)

    // Create schema
    // TASK-ALPHA-VPS-070: final canonical names. The legacy credential
    // store lives in google_connections_credentials (renamed, data
    // preserved); google_connections is now metadata-only by design.
    db.exec(`
      CREATE TABLE IF NOT EXISTS google_connections_credentials (
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

    // TASK-ALPHA-VPS-069/070: Canonical metadata tables (additive; legacy
    // credential rows are never altered here). Final names since 070:
    // google_profiles (identity metadata), google_connections
    // (connection metadata only — NO token columns by design).
    db.exec(`
      CREATE TABLE IF NOT EXISTS google_profiles (
        provider_user_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL DEFAULT 'google',
        email TEXT,
        display_name TEXT,
        avatar_url TEXT,
        first_seen_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS google_connections (
        provider_user_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL DEFAULT 'google',
        email TEXT,
        status TEXT NOT NULL DEFAULT 'connected',
        connected_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        disconnected_at TEXT,
        first_connected_at TEXT,
        last_connected_at TEXT,
        connection_count INTEGER NOT NULL DEFAULT 0,
        first_activity_at TEXT,
        last_activity_at TEXT,
        activity_count INTEGER NOT NULL DEFAULT 0,
        last_activity_tool TEXT
      );
      CREATE TABLE IF NOT EXISTS download_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artifact TEXT NOT NULL,
        version TEXT,
        path TEXT NOT NULL,
        ip_address TEXT,
        country_code TEXT,
        country TEXT,
        region TEXT,
        city TEXT,
        user_agent TEXT,
        referer TEXT,
        cf_ray TEXT,
        downloaded_at TEXT NOT NULL
      );
    `)

    // TASK-ALPHA-VPS-071: ensure telemetry columns on pre-existing DBs.
    migrateConnectionTelemetry(db)
  }
  return db
}

function migrateDatabase(database: InstanceType<typeof DatabaseSync>): void {
  // Check which columns exist
  const columns = database.prepare("PRAGMA table_info(google_connections_credentials)").all() as Array<{ name: string }>
  const columnNames = new Set(columns.map(c => c.name))

  // Add 'provider' column if missing
  if (!columnNames.has('provider')) {
    database.exec("ALTER TABLE google_connections_credentials ADD COLUMN provider TEXT NOT NULL DEFAULT 'google'")
  }

  // Add 'status' column if missing
  if (!columnNames.has('status')) {
    database.exec("ALTER TABLE google_connections_credentials ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
  }

  // Add 'last_refresh_at' column if missing
  if (!columnNames.has('last_refresh_at')) {
    database.exec("ALTER TABLE google_connections_credentials ADD COLUMN last_refresh_at TEXT")
  }
}

// TASK-ALPHA-VPS-071: additive telemetry columns for canonical
// google_connections (NULL-able; existing rows backfilled by migration SQL,
// new rows initialized by upsertConnectionMetadata).
function migrateConnectionTelemetry(database: InstanceType<typeof DatabaseSync>): void {
  const columns = database.prepare("PRAGMA table_info(google_connections)").all() as Array<{ name: string }>
  const columnNames = new Set(columns.map(c => c.name))
  const wanted: Array<[string, string]> = [
    ['first_connected_at', 'TEXT'],
    ['last_connected_at', 'TEXT'],
    ['connection_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['first_activity_at', 'TEXT'],
    ['last_activity_at', 'TEXT'],
    ['activity_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['last_activity_tool', 'TEXT'],
  ]
  for (const [name, type] of wanted) {
    if (!columnNames.has(name)) {
      database.exec(`ALTER TABLE google_connections ADD COLUMN ${name} ${type}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Connection Operations
// ---------------------------------------------------------------------------

export async function loadConnections(): Promise<Record<string, GoogleConnection>> {
  const database = getDb()
  const stmt = database.prepare('SELECT * FROM google_connections_credentials')
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
  database.exec('DELETE FROM google_connections_credentials')

  // Insert all connections
  const stmt = database.prepare(`
    INSERT INTO google_connections_credentials (user_id, provider, provider_user_id, email, access_token, refresh_token, token_expiry, scopes, status, connected_at, updated_at, last_refresh_at)
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
  const stmt = database.prepare('SELECT * FROM google_connections_credentials WHERE user_id = ?')
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
    INSERT OR REPLACE INTO google_connections_credentials (user_id, provider, provider_user_id, email, access_token, refresh_token, token_expiry, scopes, status, connected_at, updated_at, last_refresh_at)
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
  const stmt = database.prepare('DELETE FROM google_connections_credentials WHERE user_id = ?')
  stmt.run(userId)
}

// ---------------------------------------------------------------------------
// TASK-ALPHA-VPS-069: Canonical metadata operations (credential-free)
// ---------------------------------------------------------------------------

/**
 * Idempotent provider-keyed profile upsert. Reconnecting the same
 * provider_user_id UPDATEs the existing row (preserving first_seen_at /
 * created_at); it never creates a duplicate and never uses 'local-user'.
 */
export async function upsertCanonicalProfile(input: {
  providerUserId: string
  provider?: string
  email?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  observedAt: string
}): Promise<CanonicalGoogleProfile> {
  const database = getDb()
  const existing = database
    .prepare('SELECT * FROM google_profiles WHERE provider_user_id = ?')
    .all(input.providerUserId)[0] as
    | {
        provider_user_id: string
        provider: string
        email: string | null
        display_name: string | null
        avatar_url: string | null
        first_seen_at: string
        last_seen_at: string
        created_at: string
        updated_at: string
      }
    | undefined

  if (!existing) {
    database
      .prepare(
        `INSERT INTO google_profiles
           (provider_user_id, provider, email, display_name, avatar_url,
            first_seen_at, last_seen_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.providerUserId,
        input.provider ?? 'google',
        input.email ?? null,
        input.displayName ?? null,
        input.avatarUrl ?? null,
        input.observedAt,
        input.observedAt,
        input.observedAt,
        input.observedAt
      )
  } else {
    database
      .prepare(
        `UPDATE google_profiles
         SET provider = ?, email = ?, display_name = ?, avatar_url = ?,
             last_seen_at = ?, updated_at = ?
         WHERE provider_user_id = ?`
      )
      .run(
        input.provider ?? existing.provider,
        input.email ?? existing.email,
        input.displayName ?? existing.display_name,
        input.avatarUrl ?? existing.avatar_url,
        input.observedAt,
        input.observedAt,
        input.providerUserId
      )
  }

  return (await getCanonicalProfile(input.providerUserId))!
}

/**
 * Idempotent provider-keyed connection-metadata upsert. connected_at
 * preserves first-connection semantics; last_seen_at tracks the latest
 * successful OAuth observation. Contains no token columns by design.
 */
export async function upsertConnectionMetadata(input: {
  providerUserId: string
  provider?: string
  email?: string | null
  status?: string
  observedAt: string
}): Promise<CanonicalConnectionMetadata> {
  const database = getDb()
  const existing = database
    .prepare('SELECT * FROM google_connections WHERE provider_user_id = ?')
    .all(input.providerUserId)[0] as
    | {
        provider_user_id: string
        provider: string
        email: string | null
        status: string
        connected_at: string
        updated_at: string
        last_seen_at: string
        disconnected_at: string | null
        first_connected_at: string | null
        last_connected_at: string | null
        connection_count: number
        first_activity_at: string | null
        last_activity_at: string | null
        activity_count: number
        last_activity_tool: string | null
      }
    | undefined

  if (!existing) {
    // First successful OAuth: counters initialize to exactly 1.
    database
      .prepare(
        `INSERT INTO google_connections
           (provider_user_id, provider, email, status,
            connected_at, updated_at, last_seen_at, disconnected_at,
            first_connected_at, last_connected_at, connection_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1)`
      )
      .run(
        input.providerUserId,
        input.provider ?? 'google',
        input.email ?? null,
        input.status ?? 'connected',
        input.observedAt,
        input.observedAt,
        input.observedAt,
        input.observedAt,
        input.observedAt
      )
  } else {
    // Reconnect: preserve first_connected_at, advance last_connected_at,
    // increment by exactly 1. Activity fields are never touched here.
    database
      .prepare(
        `UPDATE google_connections
         SET provider = ?, email = ?, status = ?,
             updated_at = ?, last_seen_at = ?,
             last_connected_at = ?, connection_count = ?
         WHERE provider_user_id = ?`
      )
      .run(
        input.provider ?? existing.provider,
        input.email ?? existing.email,
        input.status ?? existing.status,
        input.observedAt,
        input.observedAt,
        input.observedAt,
        (existing.connection_count ?? 0) + 1,
        input.providerUserId
      )
  }

  const row = database
    .prepare('SELECT * FROM google_connections WHERE provider_user_id = ?')
    .all(input.providerUserId)[0] as {
    provider_user_id: string
    provider: string
    email: string | null
    status: string
    connected_at: string
    updated_at: string
    last_seen_at: string
    disconnected_at: string | null
    first_connected_at: string | null
    last_connected_at: string | null
    connection_count: number
    first_activity_at: string | null
    last_activity_at: string | null
    activity_count: number
    last_activity_tool: string | null
  }

  return {
    providerUserId: row.provider_user_id,
    provider: row.provider,
    email: row.email,
    status: row.status,
    connectedAt: row.connected_at,
    updatedAt: row.updated_at,
    lastSeenAt: row.last_seen_at,
    disconnectedAt: row.disconnected_at,
    firstConnectedAt: row.first_connected_at,
    lastConnectedAt: row.last_connected_at,
    connectionCount: row.connection_count,
    firstActivityAt: row.first_activity_at,
    lastActivityAt: row.last_activity_at,
    activityCount: row.activity_count,
    lastActivityTool: row.last_activity_tool,
  }
}

export async function getCanonicalProfile(
  providerUserId: string
): Promise<CanonicalGoogleProfile | null> {
  const database = getDb()
  const row = database
    .prepare('SELECT * FROM google_profiles WHERE provider_user_id = ?')
    .all(providerUserId)[0] as
    | {
        provider_user_id: string
        provider: string
        email: string | null
        display_name: string | null
        avatar_url: string | null
        first_seen_at: string
        last_seen_at: string
        created_at: string
        updated_at: string
      }
    | undefined

  if (!row) return null
  return {
    providerUserId: row.provider_user_id,
    provider: row.provider,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Records one public-artifact download event. Anonymous downloads stay
 * anonymous: no profile/user linkage is created here by design.
 */
export async function recordDownloadEvent(input: {
  artifact: string
  version?: string | null
  path: string
  ipAddress?: string | null
  countryCode?: string | null
  country?: string | null
  region?: string | null
  city?: string | null
  userAgent?: string | null
  referer?: string | null
  cfRay?: string | null
  downloadedAt: string
}): Promise<number> {
  const database = getDb()
  const result = database
    .prepare(
      `INSERT INTO download_events
         (artifact, version, path, ip_address, country_code, country,
          region, city, user_agent, referer, cf_ray, downloaded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.artifact,
      input.version ?? null,
      input.path,
      input.ipAddress ?? null,
      input.countryCode ?? null,
      input.country ?? null,
      input.region ?? null,
      input.city ?? null,
      input.userAgent ?? null,
      input.referer ?? null,
      input.cfRay ?? null,
      input.downloadedAt
    )
  return Number(result.lastInsertRowid)
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
