/**
 * TASK-ALPHA-SUBSCRIBER-022: desktop client for the VPS Product Identity
 * OAuth broker.
 *
 * The desktop runtime delegates the Google code exchange to the VPS so the
 * `GOOGLE_CLIENT_SECRET` never leaves the server. The redemption secret
 * returned once by the broker is held in MEMORY here, bound to its
 * transaction id, and presented exactly once at completion. It is never
 * persisted to disk and never forwarded to the SPA.
 */

const DEFAULT_BROKER_BASE = 'https://alpha.kanal.asia'

/** VPS broker base URL (public origin; Caddy strips the /api prefix). */
export function brokerBaseUrl(): string {
  return process.env.PRODUCT_OAUTH_BROKER_URL?.trim() || DEFAULT_BROKER_BASE
}

/**
 * Legacy local exchange (dev/offline tests only). Default is the VPS broker:
 * the packaged app ships no Google configuration and can only sign in via
 * the broker.
 */
export function isLocalProductExchange(): boolean {
  return process.env.PRODUCT_OAUTH_LOCAL_EXCHANGE === '1'
}

export interface BrokerLoginResult {
  url: string
  transactionId: string
  redemptionSecret: string
}

export interface BrokerCompleteResult {
  identity: {
    productUserId: string
    email: string | null
    name: string | null
    picture: string | null
  }
  idToken: string
  expiresIn: number
}

export class BrokerRequestError extends Error {
  readonly status: number
  readonly code: string | undefined
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'BrokerRequestError'
    this.status = status
    this.code = code
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${brokerBaseUrl()}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    })
  } catch {
    throw new BrokerRequestError(503, 'Product login service is unreachable.')
  }
  const data = (await res.json().catch(() => ({}))) as {
    error?: string
    code?: string
  }
  if (!res.ok) {
    throw new BrokerRequestError(
      res.status,
      data.error ?? 'Product login failed.',
      data.code
    )
  }
  return data as T
}

export async function brokerLogin(returnTo: string): Promise<BrokerLoginResult> {
  return postJson<BrokerLoginResult>('/api/google/oauth/product/login', {
    returnTo,
  })
}

export async function brokerComplete(
  code: string,
  redemptionSecret: string
): Promise<BrokerCompleteResult> {
  return postJson<BrokerCompleteResult>('/api/google/oauth/product/complete', {
    code,
    redemptionSecret,
  })
}

// ---------------------------------------------------------------------------
// In-memory redemption-secret registry (memory only — never persisted).
// ---------------------------------------------------------------------------

interface PendingRedemption {
  secret: string
  expiresAt: number
}

const PENDING_MAX = 8
const PENDING_TTL_MS = 15 * 60 * 1000
const pendingRedemptions = new Map<string, PendingRedemption>()

export function rememberRedemptionSecret(
  transactionId: string,
  secret: string
): void {
  // Bound the map size; stale entries are the least valuable.
  while (pendingRedemptions.size >= PENDING_MAX) {
    const oldest = pendingRedemptions.keys().next().value
    if (oldest === undefined) break
    pendingRedemptions.delete(oldest)
  }
  pendingRedemptions.set(transactionId, {
    secret,
    expiresAt: Date.now() + PENDING_TTL_MS,
  })
}

/** Single-use retrieval: the entry is removed on read. */
export function takeRedemptionSecret(transactionId: string): string | null {
  const entry = pendingRedemptions.get(transactionId)
  if (!entry) return null
  pendingRedemptions.delete(transactionId)
  if (Date.now() > entry.expiresAt) return null
  return entry.secret
}
