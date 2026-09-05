/**
 * TASK-OPENCODE-104: Production OAuth Client
 *
 * Client-side OAuth integration with alpha.kanal.asia production infrastructure.
 * Replaces the local server-side OAuth flow with direct production API calls.
 */

const PRODUCTION_BASE_URL = 'https://alpha.kanal.asia'

export interface ProductionOAuthStartResult {
  url: string
  state: string
}

export interface ProductionOAuthStatusResult {
  status: 'pending' | 'completed' | 'failed'
  identity?: {
    provider: string
    email: string
    displayName: string
    avatarUrl: string | null
  }
  error?: string
}

export interface ProductionOAuthVerifyResult {
  status: 'completed'
  identity: {
    provider: string
    providerUserId: string
    email: string
    displayName: string
    avatarUrl: string | null
    createdAt: string
    updatedAt: string
  }
  tokens: {
    accessToken: string
    refreshToken: string | undefined
    expiresAt: number
  }
}

/**
 * Generate a unique session ID for OAuth flow.
 */
function generateSessionId(): string {
  return `alpha-one-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Start the production OAuth flow.
 * Returns the Google authorization URL and state.
 */
export async function startProductionOAuth(): Promise<ProductionOAuthStartResult> {
  const sessionId = generateSessionId()

  // Capture the current page URL to return to after OAuth
  const returnTo = window.location.href

  const response = await fetch(`${PRODUCTION_BASE_URL}/api/google/oauth/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, returnTo }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to start OAuth')
  }

  const data = await response.json()

  // Store sessionId in sessionStorage for polling after redirect
  sessionStorage.setItem('alpha_oauth_session_id', sessionId)

  return {
    url: data.url,
    state: data.state,
  }
}

/**
 * Thrown when the user cancels an in-flight OAuth attempt (manual child close
 * or Cancel action). Callers must distinguish this from real OAuth failures so
 * cancellation returns the UI to idle instead of showing an error.
 */
export class OAuthCancelledError extends Error {
  constructor() {
    super('OAuth cancelled')
    this.name = 'OAuthCancelledError'
  }
}

/**
 * MSI-070: minimal local-only OAuth tracing. Structured event labels let a
 * failed completion be classified (success seen? persist ok? status ok?
 * cancelled?) without ever logging tokens, codes, secrets, or full URLs.
 */
export function traceOAuth(
  event:
    | 'oauth.completion_started'
    | 'oauth.status_completed'
    | 'oauth.verify_success'
    | 'oauth.local_persist_success'
    | 'oauth.local_persist_failed'
    | 'oauth.local_status_connected'
    | 'oauth.local_status_disconnected'
    | 'oauth.settled'
    | 'oauth.child_closed_after_success'
    | 'oauth.manual_cancel'
): void {
  try {
    console.info(`[oauth] ${event}`)
  } catch {
    /* logging must never break completion */
  }
}

/**
 * Poll the production OAuth status until completion or failure.
 * Returns the status result.
 *
 * MSI-066: optional `shouldAbort` hook lets the UI cancel a stuck poll
 * (e.g. user closed the OAuth child manually). The wait between attempts is
 * sliced so cancellation takes effect promptly (within ~250ms).
 */
export async function pollProductionOAuthStatus(
  sessionId: string,
  maxAttempts = 60,
  intervalMs = 2000,
  shouldAbort?: () => boolean
): Promise<ProductionOAuthStatusResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (shouldAbort?.()) {
      throw new OAuthCancelledError()
    }

    const response = await fetch(
      `${PRODUCTION_BASE_URL}/api/google/oauth/status/${sessionId}`,
      {
        headers: { Accept: 'application/json' },
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        return { status: 'failed', error: 'Session not found or expired' }
      }
      throw new Error(`Failed to check status: HTTP ${response.status}`)
    }

    const data = await response.json()

    if (data.status === 'completed' || data.status === 'failed') {
      return data
    }

    // Wait before next poll, checking for cancellation in small slices
    const slices = Math.max(1, Math.ceil(intervalMs / 250))
    for (let i = 0; i < slices; i++) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs / slices))
      if (shouldAbort?.()) {
        throw new OAuthCancelledError()
      }
    }
  }

  return { status: 'failed', error: 'OAuth polling timed out' }
}

/**
 * Verify the completed OAuth session and retrieve tokens.
 * This is a one-time use endpoint that deletes the session after verification.
 */
export async function verifyProductionOAuth(
  sessionId: string
): Promise<ProductionOAuthVerifyResult> {
  const response = await fetch(`${PRODUCTION_BASE_URL}/api/google/oauth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to verify OAuth')
  }

  return response.json()
}

/**
 * Get the stored session ID from sessionStorage.
 */
export function getStoredSessionId(): string | null {
  return sessionStorage.getItem('alpha_oauth_session_id')
}

/**
 * Clear the stored session ID from sessionStorage.
 */
export function clearStoredSessionId(): void {
  sessionStorage.removeItem('alpha_oauth_session_id')
}

/**
 * MSI-069: verify a completed session, persist credentials locally, and prove
 * persistence via local status — as ONE completion contract.
 *
 * Google approval and redirect alone are NOT success. Every step is checked:
 * non-2xx persistence throws, and the connection is only reported complete
 * after the local backend confirms `connected: true`. Callers therefore can
 * never mark Connected from an unverified completion result.
 */
export async function verifyAndPersistProductionOAuth(
  sessionId: string
): Promise<ProductionOAuthVerifyResult> {
  const verifyResult = await verifyProductionOAuth(sessionId)
  traceOAuth('oauth.verify_success')

  const persistRes = await fetch('/api/google/oauth/persist-production', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      identity: verifyResult.identity,
      tokens: verifyResult.tokens,
    }),
  })
  if (!persistRes.ok) {
    traceOAuth('oauth.local_persist_failed')
    throw new Error(
      `Local credential persistence failed (HTTP ${persistRes.status}). Google approval alone is not a completed connection.`
    )
  }
  traceOAuth('oauth.local_persist_success')

  const statusRes = await fetch('/api/google/oauth/status')
  if (!statusRes.ok) {
    traceOAuth('oauth.local_status_disconnected')
    throw new Error(
      `Local connection verification failed (HTTP ${statusRes.status}).`
    )
  }
  const status = (await statusRes.json()) as { connected?: boolean }
  if (!status.connected) {
    traceOAuth('oauth.local_status_disconnected')
    throw new Error('Google connection not verified after credential persist.')
  }
  traceOAuth('oauth.local_status_connected')

  return verifyResult
}

/**
 * Poll the production OAuth session to completion, then verify and persist the
 * resulting identity/tokens via the LOCAL backend (/api/google/oauth/persist-production).
 *
 * This is the local completion step that runs in the MAIN application window
 * (which survives the external OAuth navigation). It does NOT redesign the VPS
 * OAuth contract: it reuses start/poll/verify exactly as before, and only adds
 * the local persistence call that the existing GoogleConnectionCard performed.
 */
export async function completeProductionOAuth(
  sessionId: string,
  shouldAbort?: () => boolean,
  onStatusCompleted?: () => void
): Promise<ProductionOAuthVerifyResult> {
  traceOAuth('oauth.completion_started')
  const status = await pollProductionOAuthStatus(sessionId, 60, 2000, shouldAbort)

  if (status.status === 'failed') {
    throw new Error(status.error || 'OAuth failed')
  }
  if (status.status !== 'completed' || !status.identity) {
    throw new Error('OAuth session did not complete')
  }

  // MSI-070: success is recognized HERE — before verify/persist — so the
  // completion callback can arm the ordering guard ahead of the success
  // auto-close racing the child-closed watcher.
  traceOAuth('oauth.status_completed')
  onStatusCompleted?.()

  const result = await verifyAndPersistProductionOAuth(sessionId)
  traceOAuth('oauth.settled')
  return result
}
