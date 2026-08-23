/**
 * TASK-OPENCODE-092: Update checker.
 *
 * Fetches the release manifest from the distribution server and compares
 * the latest version against the current application version.
 *
 * Design constraints:
 * - MUST NOT block application startup
 * - MUST NOT crash on network failure or malformed manifest
 * - MUST NOT install software or modify the application
 * - Returns a typed result for the UI to consume
 */

import { APP_VERSION } from './version'
import { isNewer } from './semver'
import {
  type ReleaseManifest,
  type UpdateResult,
  validateManifest,
} from './release-manifest'

/**
 * Default manifest URL for production distribution.
 * Overridable via VITE_UPDATE_MANIFEST_URL env var for development.
 */
function manifestUrl(): string {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — Vite env
  return import.meta.env.VITE_UPDATE_MANIFEST_URL
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — Vite env
    ?? 'https://alpha.kanal.asia/releases/manifest.json'
}

/** Create a failed check result. */
function failedResult(error: string): UpdateResult {
  return {
    status: 'check_failed',
    currentVersion: APP_VERSION,
    latestVersion: null,
    releaseDate: null,
    releaseNotes: null,
    downloads: null,
    error,
  }
}

/** Create an up-to-date result. */
function upToDateResult(): UpdateResult {
  return {
    status: 'up_to_date',
    currentVersion: APP_VERSION,
    latestVersion: APP_VERSION,
    releaseDate: null,
    releaseNotes: null,
    downloads: null,
    error: null,
  }
}

/** Create an update-available result. */
function updateAvailableResult(manifest: ReleaseManifest): UpdateResult {
  return {
    status: 'update_available',
    currentVersion: APP_VERSION,
    latestVersion: manifest.version,
    releaseDate: manifest.releaseDate ?? null,
    releaseNotes: manifest.releaseNotes ?? null,
    downloads: manifest.downloads ?? null,
    error: null,
  }
}

/**
 * Check for application updates.
 *
 * Fetches the release manifest and compares versions.
 * Never throws — always returns a typed result.
 */
export async function checkForUpdates(): Promise<UpdateResult> {
  try {
    const url = manifestUrl()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    let response: Response
    try {
      response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!response.ok) {
      return failedResult(`HTTP ${response.status}`)
    }

    const raw = await response.json()
    const manifest = validateManifest(raw)

    if (!manifest) {
      return failedResult('Invalid release manifest')
    }

    if (isNewer(manifest.version, APP_VERSION)) {
      return updateAvailableResult(manifest)
    }

    return upToDateResult()
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Unknown error during update check'
    return failedResult(message)
  }
}
