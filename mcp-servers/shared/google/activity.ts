/**
 * TASK-ALPHA-LOCAL-072: successful Google MCP activity telemetry (local).
 *
 * TASK-071 proved the VPS cannot observe MCP execution (MCP servers run as
 * local stdio processes), so telemetry MUST be observed at the local
 * execution boundary. This module is that boundary's shared contract.
 *
 * Event contract (operational usage metadata ONLY — never tokens, secrets,
 * arguments, contents, prompts, or results):
 *   { provider: 'google', provider_user_id, tool_name, occurred_at }
 *
 * Emission rules:
 * - emit ONLY after confirmed success (resolved result without isError);
 * - exactly one emission attempt per successful handler execution;
 * - fire-and-forget AFTER the result is computed: telemetry NEVER blocks or
 *   alters the MCP response, and delivery failure NEVER fails the tool call;
 * - bounded single POST (3s timeout, no retry), errors swallowed to a
 *   one-line stderr note without payload details.
 */

import { getBackendBaseUrl } from './auth'

export interface GoogleActivityEvent {
  provider: 'google'
  provider_user_id: string
  tool_name: string
  occurred_at: string
}

const TELEMETRY_TIMEOUT_MS = 3000
const MAX_TOOL_NAME_LEN = 128

function telemetryUrl(): string {
  return (
    process.env.GOOGLE_ACTIVITY_URL || 'https://alpha.kanal.asia/google/activity'
  )
}

function backendBaseUrl(): string {
  try {
    return getBackendBaseUrl()
  } catch {
    return 'http://127.0.0.1:3001'
  }
}

/**
 * Canonical success predicate shared by every instrumented boundary.
 * Services return normally-completed results unwrapped AND expected failures
 * (validation, auth, provider errors) as resolved `{ isError: true }` — a
 * resolved result is therefore NOT success unless isError is absent/false.
 * Rejections/throws are failures by definition (callers check before emit).
 */
export function shouldEmitActivityForResult(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false
  return (result as { isError?: unknown }).isError !== true
}

/**
 * Canonical tool identity: `<mcp-server-name>_<raw-tool-name>`
 * (e.g. `google-slides_slides_get_presentation`). The server name comes from
 * the MCP registration (`startMcpServer({ name })`), the tool name from the
 * tools/call dispatch — both stable, both local. Never beautified.
 */
export function composeActivityToolName(
  serverName: string,
  toolName: string
): string {
  return `${serverName}_${toolName}`
}

/**
 * Resolve the connected Google `sub` (provider_user_id) from the LOCAL
 * backend — AUTHORITATIVE: persisted from Google userinfo at OAuth verify
 * time, read back from the canonical credential store. Returns null when no
 * connection exists (no fabrication, ever).
 */
export async function resolveProviderUserId(): Promise<string | null> {
  try {
    const res = await fetch(`${backendBaseUrl()}/api/google/oauth/status`)
    if (!res.ok) return null
    const data = (await res.json()) as { providerUserId?: unknown }
    return typeof data.providerUserId === 'string' && data.providerUserId
      ? data.providerUserId
      : null
  } catch {
    return null
  }
}

/**
 * Build a validated activity event, or null when inputs are not safe to
 * transmit. Pure function — unit-testable without network.
 */
export function buildActivityEvent(
  serverName: string,
  toolName: string,
  providerUserId: string
): GoogleActivityEvent | null {
  if (!serverName || !toolName || !providerUserId) return null
  const name = composeActivityToolName(serverName, toolName)
  if (name.length > MAX_TOOL_NAME_LEN) return null
  return {
    provider: 'google',
    provider_user_id: providerUserId,
    tool_name: name,
    occurred_at: new Date().toISOString(),
  }
}

async function deliverActivityEvent(event: GoogleActivityEvent): Promise<void> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TELEMETRY_TIMEOUT_MS)
  try {
    await fetch(telemetryUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: ctrl.signal,
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Emit one successful-activity event for a completed tool call.
 * Fire-and-forget: callers MUST NOT await this. All failures are contained
 * (single stderr line with the tool name only — never payload/secret data).
 */
export function emitGoogleActivitySuccess(
  serverName: string,
  toolName: string
): void {
  void (async () => {
    try {
      const sub = await resolveProviderUserId()
      if (!sub) return
      const event = buildActivityEvent(serverName, toolName, sub)
      if (!event) return
      await deliverActivityEvent(event)
    } catch (err) {
      try {
        process.stderr.write(
          `[google-activity] telemetry failed for ${serverName}_${toolName}: ` +
            `${err instanceof Error ? err.message : 'unknown error'}\n`
        )
      } catch {
        /* logging must never break the MCP server */
      }
    }
  })()
}
