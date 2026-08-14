/**
 * Resource Registration API — client-side.
 *
 * Provides functions to register agent-created resources in the Resource Library.
 * Uses upsert to prevent duplicates based on canonical identity.
 */

import type { ResourceProvider } from './types'

const API_BASE = '/api/resources'

export interface RegisterResourcePayload {
  provider: ResourceProvider
  name: string
  externalId: string
  mimeType?: string
  url?: string
  path?: string
  size?: string | number
  lastModified?: string
  metadata?: Record<string, unknown>
}

/**
 * Register a resource on the server side (server persists the reference).
 * Returns the registered resource reference.
 */
export async function registerResource(
  payload: RegisterResourcePayload
): Promise<{ id: string } | { error: string }> {
  try {
    const res = await fetch(`${API_BASE}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      return { error: `HTTP ${res.status}` }
    }
    return await res.json()
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Registration failed' }
  }
}

/**
 * Register a resource on the client side (localStorage).
 * Uses upsert to prevent duplicates.
 */
export function registerResourceLocally(
  store: {
    upsertResource: (ref: Omit<import('./types').ResourceReference, 'id' | 'registeredAt'>) => import('./types').ResourceReference
  },
  payload: RegisterResourcePayload
): import('./types').ResourceReference {
  return store.upsertResource({
    provider: payload.provider,
    name: payload.name,
    externalId: payload.externalId,
    mimeType: payload.mimeType,
    url: payload.url,
    path: payload.path,
    size: payload.size,
    lastModified: payload.lastModified ?? new Date().toISOString(),
    metadata: payload.metadata,
  })
}
