/**
 * TASK-OPENCODE-092: Single authoritative application version source.
 *
 * Reads from package.json at build time via Vite's JSON import.
 * This is the ONLY place the application version is defined.
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — Vite resolves ../package.json at build time
import pkg from '../../package.json'

/** Current application version (single source of truth). */
export const APP_VERSION: string = pkg.version
