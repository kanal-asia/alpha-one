/**
 * TASK-082-CORRECTIVE (C01): deterministic OpenCode chat working directory.
 *
 * Root cause (PACKAGED_OPENCODE_CWD_NOT_ISOLATED): no-project chat spawns used
 * `cwd: projectCwd ?? undefined`, so the child inherited the server process CWD.
 * When Alpha One runs from the development repository, OpenCode picks up the
 * repo-local `opencode.jsonc` (dev/source MCP configuration) instead of the
 * packaged/global MCP configuration, and MCP startup fails.
 *
 * Pure resolver (no fs side effects; fully unit-testable). Call sites pass the
 * already-ensured neutral directory (Alpha One DATA_ROOT: user-writable, contains
 * no opencode.jsonc, so OpenCode falls through to the packaged/global config).
 *
 * Contract:
 * - explicit Local Project path (non-blank) -> used verbatim (existing behavior);
 * - anything else (null/undefined/blank) -> neutralCwd, NEVER inherited process CWD.
 */
export function resolveChatCwd(projectCwd: string | null | undefined, neutralCwd: string): string {
  const selected = typeof projectCwd === 'string' ? projectCwd.trim() : ''
  if (selected) return selected
  return neutralCwd
}
