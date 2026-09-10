import { useEffect, useState } from 'react'
import { getDisplayNameInitials } from '@/lib/utils'

/**
 * TASK-078R3: Shared account identity consumer for LOCAL Alpha One.
 *
 * Resolution chain:
 *   1. LOCAL `/api/google/oauth/status` → connection state, email, providerUserId
 *   2. VPS `POST /api/google/profile/resolve` → canonical displayName, avatarUrl
 *   3. Identity precedence: enriched → connected fallback → disconnected
 *
 * LOCAL OAuth status remains authoritative for connection state and email.
 * VPS canonical profile is an enrichment source only.
 */

interface AccountIdentity {
  connected: boolean
  email: string
  name: string
  initials: string
  avatar: string
  loading: boolean
}

interface OAuthStatusResponse {
  connected?: boolean
  email?: string
  providerUserId?: string | null
}

interface CanonicalProfileResponse {
  providerUserId?: string
  email?: string
  displayName?: string | null
  avatarUrl?: string | null
}

const DISCONNECTED_NAME = 'Workspace User'
const DISCONNECTED_EMAIL = 'local@workspace'
const VPS_BASE_URL = 'https://alpha.kanal.asia'
const ENRICHMENT_TIMEOUT_MS = 5000

// In-flight dedup: multiple concurrent mounts share one fetch.
let inflightFetch: Promise<AccountIdentity> | null = null

// Subscriber set for cross-component refresh (post-connect/disconnect).
const refreshListeners = new Set<() => void>()

function disconnectedIdentity(): AccountIdentity {
  const initials = getDisplayNameInitials(DISCONNECTED_NAME)
  return {
    connected: false,
    email: DISCONNECTED_EMAIL,
    name: DISCONNECTED_NAME,
    initials,
    avatar: '',
    loading: false,
  }
}

function connectedFallbackIdentity(email: string): AccountIdentity {
  const name = DISCONNECTED_NAME
  const initials = getDisplayNameInitials(name)
  return {
    connected: true,
    email,
    name,
    initials,
    avatar: '',
    loading: false,
  }
}

function isValidAvatarUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Resolve canonical Google profile from VPS.
 * Returns null on any failure (network, timeout, 404, malformed response).
 * Never throws.
 */
async function resolveCanonicalProfile(
  providerUserId: string,
  email: string
): Promise<CanonicalProfileResponse | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ENRICHMENT_TIMEOUT_MS)

    const res = await fetch(`${VPS_BASE_URL}/api/google/profile/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerUserId, email }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) return null

    const data = (await res.json()) as Record<string, unknown>

    // Defensive validation: must have displayName to be useful.
    if (typeof data.displayName !== 'string' || !data.displayName.trim()) {
      return null
    }

    return {
      providerUserId: typeof data.providerUserId === 'string' ? data.providerUserId : undefined,
      email: typeof data.email === 'string' ? data.email : undefined,
      displayName: data.displayName,
      avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
    }
  } catch {
    return null
  }
}

/**
 * Build enriched identity from OAuth status + canonical profile.
 */
function buildEnrichedIdentity(
  email: string,
  profile: CanonicalProfileResponse
): AccountIdentity {
  const name = profile.displayName ?? DISCONNECTED_NAME
  const initials = getDisplayNameInitials(name)
  const avatar = isValidAvatarUrl(profile.avatarUrl) ? profile.avatarUrl! : ''
  return {
    connected: true,
    email,
    name,
    initials,
    avatar,
    loading: false,
  }
}

/**
 * Fetch identity: LOCAL OAuth status + optional VPS canonical enrichment.
 */
async function fetchIdentity(): Promise<AccountIdentity> {
  try {
    const res = await fetch('/api/google/oauth/status')
    if (!res.ok) {
      return disconnectedIdentity()
    }
    const data = (await res.json()) as OAuthStatusResponse

    if (!data.connected || !data.email) {
      return disconnectedIdentity()
    }

    // Connected with email — attempt canonical enrichment.
    // Enrichment is optional: failure preserves connected fallback.
    if (data.providerUserId) {
      const profile = await resolveCanonicalProfile(data.providerUserId, data.email)
      if (profile) {
        return buildEnrichedIdentity(data.email, profile)
      }
    }

    // Connected but no enrichment — neutral fallback with factual email.
    return connectedFallbackIdentity(data.email)
  } catch {
    return disconnectedIdentity()
  }
}

/**
 * Fetch identity with in-flight deduplication. Multiple concurrent
 * callers share the same promise.
 */
function fetchWithDedup(): Promise<AccountIdentity> {
  if (!inflightFetch) {
    inflightFetch = fetchIdentity().finally(() => {
      inflightFetch = null
    })
  }
  return inflightFetch
}

/**
 * Shared hook: fetches identity on every mount. Subscribes to
 * `refreshAccountIdentity()` events for post-connect/disconnect
 * invalidation without polling.
 */
export function useAccountIdentity(): AccountIdentity {
  const [state, setState] = useState<AccountIdentity>({
    ...disconnectedIdentity(),
    loading: true,
  })

  // Fetch on mount + subscribe to refresh events.
  useEffect(() => {
    let cancelled = false

    async function load() {
      const result = await fetchWithDedup()
      if (!cancelled) {
        setState(result)
      }
    }

    void load()

    // Re-fetch when refreshAccountIdentity() is called.
    const listener = () => { void load() }
    refreshListeners.add(listener)

    return () => {
      cancelled = true
      refreshListeners.delete(listener)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return state
}

/**
 * Force all consumers to re-fetch identity. Call after successful
 * OAuth connect or disconnect.
 */
export function refreshAccountIdentity(): void {
  inflightFetch = null
  for (const fn of refreshListeners) {
    fn()
  }
}

/**
 * Reset module-level state. Test-only.
 */
export function _resetForTesting(): void {
  inflightFetch = null
  refreshListeners.clear()
}
