/**
 * Alpha Workspace ΓÇö Runtime Contract (Runtime Platform, TASK-ENGINEERING-001)
 *
 * A Runtime executes AI/workload capabilities on behalf of operations. The
 * contract is deliberately narrow:
 *
 *   - A Runtime receives a CAPABILITY (e.g. `summarize`), a CONTEXT, ARTIFACT
 *     REFERENCES and an optional CREDENTIAL REFERENCE.
 *   - A Runtime NEVER receives artifact bytes and never talks to the UI.
 *   - The platform is runtime-agnostic: adapters (OpenCode, and future CLIs)
 *     implement the same interface.
 */
import type { ArtifactRecord } from '../artifacts/types'

export interface RuntimeContext {
  taskId: string | null
  workflowRunId: string | null
  capability: string
  input: Record<string, unknown>
  /** Artifact REFERENCES only ΓÇö ids plus metadata, never content. */
  artifacts: ArtifactRecord[]
  /** e.g. `{ provider: 'opencode', key: '...' }`. Never exposes the secret. */
  credentialRef: { provider: string; key: string } | null
  workspace: { id: string; name: string; path: string }
}

export interface RuntimeResult {
  ok: boolean
  data: Record<string, unknown>
  error?: string
  usage?: { inputTokens?: number; outputTokens?: number; cost?: number }
}

export interface RuntimeAdapter {
  /** Canonical runtime id, e.g. `opencode`. */
  id: string
  label: string
  /** Whether the runtime binary/credentials are currently usable. */
  isAvailable(): Promise<boolean>
  run(ctx: RuntimeContext): Promise<RuntimeResult>
}

export interface RuntimeRegistry {
  register(adapter: RuntimeAdapter): void
  get(id: string): RuntimeAdapter | null
  list(): RuntimeAdapter[]
}

export function createRuntimeRegistry(): RuntimeRegistry {
  const adapters = new Map<string, RuntimeAdapter>()
  return {
    register(adapter) {
      adapters.set(adapter.id, adapter)
    },
    get(id) {
      return adapters.get(id) ?? null
    },
    list() {
      return [...adapters.values()]
    },
  }
}
