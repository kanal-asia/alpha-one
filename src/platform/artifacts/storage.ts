/**
 * Alpha Workspace ΓÇö Artifact Storage Adapter (Artifact Registry)
 *
 * Storage is behind a small interface so the registry itself stays
 * environment-agnostic (testable in the browser with MemoryStorage and used in
 * production with LocalStorage).
 */

export interface ArtifactStorage {
  /** Human-readable location (path for disk, `memory` for memory). */
  location?: string
  /** Persist bytes under a storage key. */
  write(key: string, bytes: Uint8Array): Promise<void>
  /** Read bytes for a key. Throws when missing. */
  read(key: string): Promise<Uint8Array>
  remove(key: string): Promise<void>
  has(key: string): Promise<boolean>
}

/** In-memory storage. Used by tests and as the default when no dir is given. */
export function createMemoryStorage(): ArtifactStorage {
  const store = new Map<string, Uint8Array>()
  return {
    location: 'memory',
    async write(key, bytes) {
      store.set(key, new Uint8Array(bytes))
    },
    async read(key) {
      const bytes = store.get(key)
      if (!bytes) throw new Error(`Storage key not found: ${key}`)
      return new Uint8Array(bytes)
    },
    async remove(key) {
      store.delete(key)
    },
    async has(key) {
      return store.has(key)
    },
  }
}
