/**
 * TASK-ALPHA-SUBSCRIBER-022: shared OAuth return-origin policy.
 *
 * Single source of truth for the TASK-017 loopback allowlist:
 * an accepted return target must parse as an `http(s)` URL whose origin is
 * on a loopback host (`localhost` / `127.0.0.1`). Used by the VPS product
 * OAuth broker (strict rejection) and by `resolveSafeReturnBase()` on the
 * desktop runtime (fallback semantics). Keeping one implementation prevents
 * the two allowlists from drifting apart.
 */

/** Parse a candidate return URL; return its origin only when loopback-allowed. */
export function parseLoopbackOrigin(
  value: string | null | undefined
): string | null {
  if (typeof value !== 'string' || value.length === 0) return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
    return url.origin
  }
  return null
}

/**
 * TASK-017 full policy: loopback origins are allowed; additionally the exact
 * configured non-loopback origin (e.g. CLIENT_URL) is allowed. Anything else
 * is rejected (returns null).
 */
export function isAllowedReturnOrigin(
  candidate: string | null | undefined,
  allowedExtraOrigin: string | null | undefined
): string | null {
  const loopback = parseLoopbackOrigin(candidate)
  if (loopback) return loopback
  if (typeof candidate !== 'string' || candidate.length === 0) return null
  if (typeof allowedExtraOrigin !== 'string' || allowedExtraOrigin.length === 0) {
    return null
  }
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (candidate === new URL(allowedExtraOrigin).origin) return url.origin
  } catch {
    return null
  }
  return null
}
