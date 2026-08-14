/**
 * Resource Library types.
 *
 * A resource is a *reference* to an original file/project — never a copy.
 * Identity is based on the canonical external source, not display name.
 */

export type ResourceProvider =
  | 'local'
  | 'google_drive'
  | 'google_docs'
  | 'google_sheets'
  | 'google_slides'
  | 'apps_script'

export interface ResourceReference {
  /** Stable internal ID (auto-generated). */
  id: string
  /** Resource type for display/routing. */
  provider: ResourceProvider
  /** Display name — NOT used as identity. */
  name: string
  /** Canonical external identity: file ID, script ID, or local path. */
  externalId: string
  /** MIME type when available. */
  mimeType?: string
  /** External URL to open the original resource. */
  url?: string
  /** Local filesystem path (for `local` provider). */
  path?: string
  /** Byte size when available. */
  size?: string | number
  /** Timestamp when registered. */
  registeredAt: string
  /** Last known modification time of the external resource. */
  lastModified?: string
  /** Additional metadata needed to reopen the resource. */
  metadata?: Record<string, unknown>
}

export interface ResourceStore {
  resources: ResourceReference[]
  addResource: (ref: Omit<ResourceReference, 'id' | 'registeredAt'>) => ResourceReference
  upsertResource: (ref: Omit<ResourceReference, 'id' | 'registeredAt'>) => ResourceReference
  removeResource: (id: string) => void
  findResource: (provider: ResourceProvider, externalId: string) => ResourceReference | undefined
}
