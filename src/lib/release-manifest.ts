/**
 * TASK-OPENCODE-092: Release manifest contract.
 *
 * Typed schema for release metadata fetched from the distribution server.
 * Used by the update checker to determine if a newer version is available.
 *
 * Production distribution: alpha.kanal.asia
 * Development: local/test manifest
 */

/** Platform-specific download information. */
export interface ReleaseDownloads {
  /** Windows installer URL. */
  windows?: string
  /** Android APK URL. */
  android?: string
  /** SDK/package URL. */
  sdk?: string
}

/** Release manifest fetched from the distribution server. */
export interface ReleaseManifest {
  /** Latest available version (semver). */
  version: string
  /** Minimum supported version. Clients below this must update. */
  minimumSupportedVersion?: string
  /** ISO 8601 release date. */
  releaseDate?: string
  /** Release notes (markdown or plain text). */
  releaseNotes?: string
  /** Platform-specific download URLs. */
  downloads?: ReleaseDownloads
}

/** Update check result status. */
export type UpdateStatus = 'up_to_date' | 'update_available' | 'check_failed'

/** Typed result from the update checker. */
export interface UpdateResult {
  status: UpdateStatus
  /** Current application version. */
  currentVersion: string
  /** Latest version from manifest (null if check failed). */
  latestVersion: string | null
  /** Release date from manifest (null if unavailable). */
  releaseDate: string | null
  /** Release notes from manifest (null if unavailable). */
  releaseNotes: string | null
  /** Download URLs from manifest (null if unavailable). */
  downloads: ReleaseDownloads | null
  /** Error message if check failed. */
  error: string | null
}

/**
 * Validate that a raw object conforms to the ReleaseManifest contract.
 * Returns a valid manifest or null if invalid.
 */
export function validateManifest(raw: unknown): ReleaseManifest | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>

  // version is required and must be a valid semver string
  if (typeof obj.version !== 'string') return null
  if (!/^\d+\.\d+\.\d+$/.test(obj.version.trim())) return null

  const manifest: ReleaseManifest = {
    version: obj.version.trim(),
  }

  if (typeof obj.minimumSupportedVersion === 'string') {
    manifest.minimumSupportedVersion = obj.minimumSupportedVersion.trim()
  }
  if (typeof obj.releaseDate === 'string') {
    manifest.releaseDate = obj.releaseDate.trim()
  }
  if (typeof obj.releaseNotes === 'string') {
    manifest.releaseNotes = obj.releaseNotes
  }
  if (obj.downloads && typeof obj.downloads === 'object') {
    const d = obj.downloads as Record<string, unknown>
    manifest.downloads = {}
    if (typeof d.windows === 'string') manifest.downloads.windows = d.windows
    if (typeof d.android === 'string') manifest.downloads.android = d.android
    if (typeof d.sdk === 'string') manifest.downloads.sdk = d.sdk
  }

  return manifest
}
