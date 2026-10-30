/**
 * TASK-ALPHA-SUBSCRIBER-022: Product Identity OAuth broker store (VPS).
 *
 * SQLite-backed (existing persistence, additive table) transaction store for
 * the VPS-owned Google product-login exchange. Single-use semantics are
 * enforced with guarded UPDATE … RETURNING statements — atomic at the SQL
 * level and safe under concurrent requests; never an in-memory map (the
 * brief forbids non-atomic one-time redemption).
 *
 * Sensitivity: the ID token is held here only for the short window between
 * callback and redemption (10-minute TTL) because it is the artifact the
 * flow exists to deliver. Secrets are stored as SHA-256 hashes only. Nothing
 * in this module logs token or secret material.
 */
import { createHash } from 'node:crypto'
import { getDb } from '../lib/sqlite-persistence'

export type ProductLoginTxStatus =
  | 'pending'
  | 'exchanging'
  | 'completed'
  | 'consumed'
  | 'failed'

export interface ProductLoginTx {
  transactionId: string
  state: string
  pkceVerifier: string
  nonce: string
  returnTo: string
  secretHash: string
  status: ProductLoginTxStatus
  codeHash: string | null
  idToken: string | null
  identityJson: string | null
  error: string | null
  createdAt: string
  expiresAt: string
  consumedAt: string | null
}

interface TxRow {
  transaction_id: string
  state: string
  pkce_verifier: string
  nonce: string
  return_to: string
  secret_hash: string
  status: string
  code_hash: string | null
  id_token: string | null
  identity_json: string | null
  error: string | null
  created_at: string
  expires_at: string
  consumed_at: string | null
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

let schemaReady = false

function ensureSchema(): void {
  if (schemaReady) return
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_login_tx (
      transaction_id TEXT PRIMARY KEY,
      state TEXT NOT NULL UNIQUE,
      pkce_verifier TEXT NOT NULL,
      nonce TEXT NOT NULL,
      return_to TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      code_hash TEXT,
      id_token TEXT,
      identity_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT
    )
  `)
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_product_login_tx_state ON product_login_tx(state)'
  )
  schemaReady = true
}

function rowToTx(row: TxRow): ProductLoginTx {
  return {
    transactionId: row.transaction_id,
    state: row.state,
    pkceVerifier: row.pkce_verifier,
    nonce: row.nonce,
    returnTo: row.return_to,
    secretHash: row.secret_hash,
    status: row.status as ProductLoginTxStatus,
    codeHash: row.code_hash,
    idToken: row.id_token,
    identityJson: row.identity_json,
    error: row.error,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  }
}

export async function createProductLoginTx(input: {
  transactionId: string
  state: string
  pkceVerifier: string
  nonce: string
  returnTo: string
  secretHash: string
  createdAt: string
  expiresAt: string
}): Promise<void> {
  ensureSchema()
  getDb()
    .prepare(
      `INSERT INTO product_login_tx
        (transaction_id, state, pkce_verifier, nonce, return_to, secret_hash,
         status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .run(
      input.transactionId,
      input.state,
      input.pkceVerifier,
      input.nonce,
      input.returnTo,
      input.secretHash,
      input.createdAt,
      input.expiresAt
    )
}

/** Non-destructive lookup by state (for redirect-target resolution). */
export async function peekProductLoginTxByState(
  state: string
): Promise<ProductLoginTx | null> {
  ensureSchema()
  const row = getDb()
    .prepare('SELECT * FROM product_login_tx WHERE state = ?')
    .get(state) as TxRow | undefined
  return row ? rowToTx(row) : null
}

/**
 * Atomically claim a pending, unexpired state for the token exchange.
 * Single guarded UPDATE: only one concurrent caller can win; double
 * callbacks with the same state are rejected fail-closed.
 */
export async function claimProductLoginState(
  state: string,
  nowIso: string
): Promise<ProductLoginTx | null> {
  ensureSchema()
  const row = getDb()
    .prepare(
      `UPDATE product_login_tx
         SET status = 'exchanging'
       WHERE state = ? AND status = 'pending' AND expires_at > ?
       RETURNING *`
    )
    .get(state, nowIso) as TxRow | undefined
  return row ? rowToTx(row) : null
}

export async function recordExchangeResult(input: {
  transactionId: string
  codeHash: string
  idToken: string
  identityJson: string
}): Promise<boolean> {
  ensureSchema()
  const info = getDb()
    .prepare(
      `UPDATE product_login_tx
          SET status = 'completed', code_hash = ?, id_token = ?, identity_json = ?
        WHERE transaction_id = ? AND status = 'exchanging'`
    )
    .run(input.codeHash, input.idToken, input.identityJson, input.transactionId)
  return info.changes === 1
}

export async function failProductLoginTx(
  transactionId: string,
  error: string
): Promise<void> {
  ensureSchema()
  getDb()
    .prepare(
      `UPDATE product_login_tx
          SET status = 'failed', error = ?
        WHERE transaction_id = ? AND status != 'consumed'`
    )
    .run(error, transactionId)
}

/**
 * Atomic single-use completion redemption: succeeds exactly once per
 * transaction even under concurrent requests (guarded UPDATE + RETURNING —
 * the row is returned only by the statement that actually consumed it).
 */
export async function consumeCompletionCode(input: {
  transactionId: string
  codeHash: string
  secretHash: string
  nowIso: string
  consumedAtIso: string
}): Promise<{ idToken: string; identityJson: string } | null> {
  ensureSchema()
  const row = getDb()
    .prepare(
      `UPDATE product_login_tx
          SET status = 'consumed', consumed_at = ?
        WHERE transaction_id = ?
          AND status = 'completed'
          AND code_hash = ?
          AND secret_hash = ?
          AND expires_at > ?
       RETURNING id_token, identity_json`
    )
    .get(
      input.consumedAtIso,
      input.transactionId,
      input.codeHash,
      input.secretHash,
      input.nowIso
    ) as { id_token: string; identity_json: string } | undefined
  if (!row || !row.id_token || !row.identity_json) return null
  return { idToken: row.id_token, identityJson: row.identity_json }
}

export async function cleanupExpiredProductLoginTx(
  nowIso: string
): Promise<void> {
  ensureSchema()
  getDb()
    .prepare('DELETE FROM product_login_tx WHERE expires_at <= ?')
    .run(nowIso)
}
