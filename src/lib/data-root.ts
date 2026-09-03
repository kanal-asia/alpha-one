/**
 * TASK-MSI-021: Runtime writable data root resolution.
 *
 * All persistent runtime data (databases, OAuth state, workspace artifacts)
 * must live outside the installation directory. This module resolves the
 * correct user-writable data root from:
 *
 *   1. ALPHA_DATA_DIR env var (set by Electron main process)
 *   2. %APPDATA%\Alpha One (Windows)
 *   3. ~/.alpha-one (fallback)
 *
 * The installation directory (C:\Program Files\Alpha One\) is read-only
 * at runtime and must never be used as a data root.
 */

import { join } from 'node:path'
import { homedir } from 'node:os'
import { mkdirSync } from 'node:fs'

function resolveDataRoot(): string {
  // 1. Explicit env var (Electron sets this)
  if (process.env.ALPHA_DATA_DIR) {
    return process.env.ALPHA_DATA_DIR
  }

  // 2. Platform-standard app data location
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData) {
      return join(appData, 'Alpha One')
    }
  }

  // 3. Fallback: user home
  return join(homedir(), '.alpha-one')
}

export const DATA_ROOT = resolveDataRoot()

/**
 * Ensure the data root directory exists. Call once at startup.
 */
export function ensureDataRoot(): string {
  mkdirSync(DATA_ROOT, { recursive: true })
  return DATA_ROOT
}

/**
 * Convenience: resolve a path under the data root.
 */
export function dataPath(...segments: string[]): string {
  return join(DATA_ROOT, ...segments)
}
