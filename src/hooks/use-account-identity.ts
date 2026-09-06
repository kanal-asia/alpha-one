import { useEffect, useState, useCallback } from 'react'
import { getDisplayNameInitials } from '@/lib/utils'

/**
 * TASK-078R1C1: Shared account identity consumer for LOCAL Alpha One.
 *
 * Fetches factual connection state from the existing LOCAL
 * `/api/google/oauth/status` endpoint on every mount. Concurrent
 * mounts deduplicate via an in-flight promise. A `refreshAccountIdentity()`
 * function is exposed for post-connect/disconnect invalidation.
 *
 * Architecture constraint: LOCAL persistence is NOT the canonical
 * Google profile source. This hook exposes the minimum identity
 * fields available from the LOCAL connection record:
 *   - `email` — factual Google email when connected
 *   - `connected` — boolean connection state
 *
 * Canonical name/avatar remain a VPS concern (deferred to TASK-078R2).
 */

interface AccountIdentity {
  connected: boolean
  email: string
  name: string
  initials: string
  avatar: string
  loading: boolean
}

const DISCONNECTED_NAME = 'Workspace User'
const DISCONNECTED_EMAIL = 'local@workspace'

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

async function fetchIdentity(): Promise<AccountIdentity> {
  try {
    const res = await fetch('/api/google/oauth/status')
    if (!res.ok) {
      return disconnectedIdentity()
    }
    const data = (await res.json()) as {
      connected?: boolean
      email?: string
      providerUserId?: string | null
    }

    if (!data.connected || !data.email) {
      return disconnectedIdentity()
    }

    // Connected: use factual Google email. Neutral display name fallback
    // until canonical VPS name/avatar consumption is implemented.
    const name = DISCONNECTED_NAME
    const email = data.email
    const initials = getDisplayNameInitials(name)
    return {
      connected: true,
      email,
      name,
      initials,
      avatar: '',
      loading: false,
    }
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

  const doFetch = useCallback(async () => {
    const result = await fetchWithDedup()
    setState(result)
  }, [])

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
