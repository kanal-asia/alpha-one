/**
 * TASK-OPENCODE-092: Semantic version comparison.
 *
 * Lightweight semver comparison without external dependencies.
 * Handles MAJOR.MINOR.PATCH format. Pre-release tags are not
 * supported (not needed for update comparison).
 */

export interface SemVer {
  major: number
  minor: number
  patch: number
}

/** Parse a semver string into its components. Returns null if invalid. */
export function parseSemVer(version: string): SemVer | null {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) return null
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  }
}

/**
 * Compare two semantic versions.
 *
 * Returns:
 *   -1 if a < b
 *    0 if a === b
 *   +1 if a > b
 *
 * Returns null if either version is invalid.
 */
export function compareSemVer(a: string, b: string): -1 | 0 | 1 | null {
  const pa = parseSemVer(a)
  const pb = parseSemVer(b)
  if (!pa || !pb) return null

  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1
  return 0
}

/** Check if version `a` is newer than version `b`. */
export function isNewer(a: string, b: string): boolean {
  return compareSemVer(a, b) === 1
}

/** Check if version `a` equals version `b`. */
export function isSame(a: string, b: string): boolean {
  return compareSemVer(a, b) === 0
}

/** Check if version `a` is older than version `b`. */
export function isOlder(a: string, b: string): boolean {
  return compareSemVer(a, b) === -1
}
