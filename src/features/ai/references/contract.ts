/**
 * Reference Attachment contract (provider-neutral).
 *
 * An attachment is a *reference* to a file, never the file itself. The
 * frontend only ever produces and sends this lightweight metadata; the backend
 * owns resolution and on-demand content access.
 */

export type ReferenceProvider = 'local' | 'google_drive' | 'apps_script'

export interface ReferenceAttachment {
  /** Frontend-generated temporary reference id (optional). */
  id?: string
  provider: ReferenceProvider
  /** Display name / filename. Never used as identity. */
  name: string
  /** MIME type when available. */
  mimeType?: string
  /** Byte size when available (Drives report sizes as strings). */
  size?: string | number
  /** Absolute filesystem path — required for `local`. */
  path?: string
  /** Google Drive file id — required for `google_drive`. */
  fileId?: string
  /** Last-modified timestamp when available. */
  modifiedTime?: string
}

export type ReferenceErrorCode =
  | 'FILE_NOT_FOUND'
  | 'FILE_ACCESS_DENIED'
  | 'DRIVE_AUTH_REQUIRED'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'LOCAL_PATH_NOT_ALLOWED'
  | 'REFERENCE_RESOLUTION_FAILED'

export interface ReferenceResolutionError {
  code: ReferenceErrorCode
  name: string
  /** User-safe message — never contains server filesystem paths. */
  message: string
}

export function isReferenceAttachment(value: unknown): value is ReferenceAttachment {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (v.provider !== 'local' && v.provider !== 'google_drive' && v.provider !== 'apps_script') return false
  if (typeof v.name !== 'string' || !v.name) return false
  if (v.provider === 'local' && (typeof v.path !== 'string' || !v.path)) return false
  if ((v.provider === 'google_drive' || v.provider === 'apps_script') && (typeof v.fileId !== 'string' || !v.fileId)) return false
  return true
}

/** Minimal, sanitized reference used in chat persistence (metadata only). */
export function sanitizeReference(
  reference: ReferenceAttachment
): ReferenceAttachment {
  return {
    provider: reference.provider,
    name: reference.name,
    mimeType: reference.mimeType,
    size: reference.size,
    path: reference.provider === 'local' ? reference.path : undefined,
    fileId: (reference.provider === 'google_drive' || reference.provider === 'apps_script') ? reference.fileId : undefined,
    modifiedTime: reference.modifiedTime,
  }
}