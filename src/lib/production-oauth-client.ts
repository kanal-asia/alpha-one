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
 * Poll the production OAuth status until completion or failure.
 * Returns the status result.
 */
export async function pollProductionOAuthStatus(
  sessionId: string,
  maxAttempts = 60,
  intervalMs = 2000
): Promise<ProductionOAuthStatusResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
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

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
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
