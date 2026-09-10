/**
 * TASK-085 CORRECTIVE: packaged OpenCode MCP config builder (pure, no imports).
 *
 * PROVEN DEFECT: opencode's `doom_loop` guard (same tool call repeats 3x with
 * identical input; defaults to `ask` per official docs) fired on legitimate
 * rapid `google-slides_slides_create_slide` bursts (session export proves 3+
 * identical parallel calls, all completed or aborted together). Headless
 * `opencode run` cannot answer interactive prompts, so `ask` auto-resolved to
 * "The user rejected permission to use this specific tool call." → exit 1.
 *
 * PROVEN SCHEMA CONSTRAINT (opencode runtime rejects anything else):
 * `doom_loop` accepts ONLY a plain action string — granular object syntax
 * (`{ "google-slides_*": "allow" }`) fails config load with
 * `Expected PermissionActionConfig`. A numeric threshold was considered but its
 * semantics are undocumented — rejected as unprovable. Therefore the narrowest
 * EXPRESSIBLE mechanism is `"doom_loop": "allow"`.
 *
 * Blast-radius justification (validation #7): exactly ONE permission changes,
 * ask→allow, in Alpha-generated packaged configs only. In headless Alpha runs
 * `ask` is non-functional (auto-reject), so this converts "mysterious exit 1 on
 * legitimate bursts" into "bursts proceed". All other permissions (tool
 * allows/denies, external_directory ask, question/plan_enter denies) are
 * byte-identical. Residual loop exposure is bounded in practice by model
 * self-termination, Alpha's bounded continuations, user Stop, and the R04
 * silence watchdog.
 */

export const PACKAGED_MCP_SERVERS = [
  'google-sheets',
  'google-docs',
  'google-slides',
  'google-drive',
  'google-apps-script',
  'google-calendar',
  'gmail',
] as const

export interface PackagedMcpEntry {
  type: 'local'
  command: [string, string]
  enabled: boolean
  timeout: number
}

export function buildPackagedMcpEntries(
  nodeExe: string,
  mcpBase: string,
  joinFn: (a: string, b: string) => string
): Record<string, PackagedMcpEntry> {
  const entries: Record<string, PackagedMcpEntry> = {}
  for (const name of PACKAGED_MCP_SERVERS) {
    entries[name] = {
      type: 'local',
      command: [nodeExe, joinFn(mcpBase, `${name}.js`)],
      enabled: true,
      timeout: 15000,
    }
  }
  return entries
}

/** doom_loop allow (plain action string — the only schema-valid form). */
export function buildPackagedMcpPermission(): Record<string, string> {
  return { doom_loop: 'allow' }
}

export function buildPackagedMcpConfig(
  nodeExe: string,
  mcpBase: string,
  joinFn: (a: string, b: string) => string
): Record<string, unknown> {
  return {
    $schema: 'https://opencode.ai/config.json',
    mcp: buildPackagedMcpEntries(nodeExe, mcpBase, joinFn),
    permission: buildPackagedMcpPermission(),
  }
}

function hasDoomLoopAllow(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false
  const perm = (parsed as Record<string, unknown>).permission
  if (!perm || typeof perm !== 'object') return false
  return (perm as Record<string, unknown>).doom_loop === 'allow'
}

/**
 * Staleness predicate: an existing user config is current only if it has all
 * servers with matching packaged paths AND the doom_loop allow rule.
 * Missing rule (pre-corrective installs) forces a rewrite on next launch.
 */
export function isPackagedMcpConfigCurrent(parsed: unknown, nodeExe: string): boolean {
  if (!parsed || typeof parsed !== 'object') return false
  const mcp = (parsed as Record<string, unknown>).mcp
  if (!mcp || typeof mcp !== 'object') return false
  const m = mcp as Record<string, unknown>
  const sheetsCmd = (m['google-sheets'] as Record<string, unknown> | undefined)?.command
  const hasAllServers = (PACKAGED_MCP_SERVERS as readonly string[]).every((name) => m[name])
  const nodePathMatches = Array.isArray(sheetsCmd) && sheetsCmd[0] === nodeExe
  const distPathOk =
    Array.isArray(sheetsCmd) &&
    typeof sheetsCmd[1] === 'string' &&
    (sheetsCmd[1] as string).includes('mcp-servers-dist') &&
    (sheetsCmd[1] as string).endsWith('.js')
  return Boolean(hasAllServers && nodePathMatches && distPathOk) && hasDoomLoopAllow(parsed)
}
