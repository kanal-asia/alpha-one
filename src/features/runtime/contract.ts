/**
 * Alpha Workspace Runtime Contract (TASK-AI-031)
 *
 * Every model in the system MUST be represented as one canonical object:
 *
 * ```ts
 * interface RuntimeModel {
 *   id: string          // canonical "provider/slug" — immutable, sent to the runtime
 *   provider: string    // e.g. "opencode"
 *   slug: string        // e.g. "deepseek-v4-flash-free" — used only for search/filter
 *   displayName: string // UI only — never sent to the runtime
 *   free: boolean
 *   contextWindow: number
 *   supportsTools: boolean
 * }
 * ```
 *
 * Rules:
 *   1. `displayName` is used ONLY for the UI. Never sent to the runtime.
 *   2. `slug` is used ONLY for searching/filtering. Never sent to the runtime.
 *   3. `id` is ALWAYS sent to the runtime. It is never reconstructed,
 *      concatenated, split, or normalized downstream. Treat it as immutable.
 *
 * `id` is created exactly once, at model discovery
 * (`toRuntimeModel` / `createCanonicalId`). Every other layer passes it through
 * unchanged.
 *
 * This module is dependency-free on purpose so it can be shared by the browser
 * UI, the Node runtime API, and any future provider adapter (Claude Code,
 * Codex CLI, Gemini CLI, Kilo Code, Aider).
 */

export interface RuntimeModel {
  /** Canonical identity: `${provider}/${slug}`. Immutable. Always sent to runtime. */
  id: string
  /** Provider namespace, e.g. "opencode". */
  provider: string
  /** Bare model key, e.g. "deepseek-v4-flash-free". Search/filter only. */
  slug: string
  /** Friendly name, e.g. "DeepSeek V4 Flash Free". Display only. */
  displayName: string
  /** True when input+output cost is 0 (chat works without an API key). */
  free: boolean
  contextWindow: number
  supportsTools: boolean
  /** Display-only. Optional so non-display layers can build RuntimeModel without it. */
  availability?: string
  /** Display-only latency hint. Optional for the same reason. */
  latency?: string
  /** TASK-OPENCODE-023: Available reasoning variants for this model (e.g. "low", "high"). */
  variants?: Record<string, Record<string, unknown>>
  /**
   * TASK-OPENCODE-084: Optional Models.dev metadata enrichment (pricing, input
   * modalities, detail URL). Enrichment only — never a source of truth for
   * provider/model availability. Absent when Models.dev has no usable match.
   */
  modelsDev?: {
    providerId: string
    modelId: string
    detailUrl: string
    inputPrice: number | null
    outputPrice: number | null
    inputModalities: string[]
    matched: boolean
  }
}

/**
 * Runtime Provider Contract.
 *
 * Every provider implements `discoverModels()` which returns `RuntimeModel[]`.
 * No provider returns arbitrary strings. The OpenCode adapter implements this
 * on the server side; future CLIs (Claude Code, Codex, Gemini, Kilo, Aider)
 * implement the same interface with zero UI changes.
 */
export interface RuntimeProvider {
  readonly id: string
  readonly label: string
  discoverModels(): Promise<RuntimeModel[]>
}

/**
 * A model id is canonical when it is in the exact form `provider/id`.
 * Both `provider` and `id` may contain word chars, dots and dashes.
 */
export const RUNTIME_MODEL_ID_RE = /^[\w.-]+\/[\w.-]+$/

export function isValidModelId(id: string): boolean {
  return RUNTIME_MODEL_ID_RE.test(id)
}

/**
 * Throws when the model id is not canonical `provider/id`.
 * Use at every runtime boundary so a display name or slug can never reach the CLI.
 */
export function assertCanonicalModelId(id: string): string {
  if (!isValidModelId(id)) {
    throw new Error(
      `Model must be in the form provider/id. Received: "${id}". ` +
        `Only RuntimeModel.id (canonical) may reach the runtime.`,
    )
  }
  return id
}

/**
 * Builds the canonical id. Called EXACTLY ONCE, at model discovery.
 * Downstream layers must never call this — they must pass `id` through unchanged.
 */
export function createCanonicalId(provider: string, slug: string): string {
  return `${provider}/${slug}`
}

/**
 * Creates a RuntimeModel from a raw model. This is the discovery boundary where
 * the canonical id is born. After this point the id is immutable.
 */
export function toRuntimeModel(input: {
  provider: string
  slug: string
  displayName: string
  free: boolean
  contextWindow: number
  supportsTools: boolean
  availability?: RuntimeModel['availability']
  latency?: RuntimeModel['latency']
  variants?: RuntimeModel['variants']
}): RuntimeModel {
  return {
    id: createCanonicalId(input.provider, input.slug),
    provider: input.provider,
    slug: input.slug,
    displayName: input.displayName,
    free: input.free,
    contextWindow: input.contextWindow,
    supportsTools: input.supportsTools,
    ...(input.availability != null ? { availability: input.availability } : {}),
    ...(input.latency != null ? { latency: input.latency } : {}),
    ...(input.variants != null && Object.keys(input.variants).length > 0 ? { variants: input.variants } : {}),
  }
}

/**
 * Safety-net fallback used only when the selected canonical id is not present
 * in the currently loaded model list (e.g. a stale persisted setting). The
 * `id` is preserved VERBATIM — it is never reconstructed. provider/slug/name
 * are derived for display purposes only.
 */
export function runtimeModelFromCanonicalId(id: string): RuntimeModel {
  const parts = id.split('/')
  const provider = parts.length > 1 ? parts[0] : 'unknown'
  const slug = parts.length > 1 ? parts.slice(1).join('/') : id
  return {
    id,
    provider,
    slug,
    displayName: slug,
    free: false,
    contextWindow: 0,
    supportsTools: false,
  }
}

/**
 * Resolves a canonical id to the known RuntimeModel, falling back to a
 * preserved-id stub when the model is not in the loaded list.
 */
export function resolveRuntimeModel(
  models: RuntimeModel[],
  id: string,
): RuntimeModel {
  return models.find((m) => m.id === id) ?? runtimeModelFromCanonicalId(id)
}

/** Single execution trace recorded by every runtime execution. */
export interface RuntimeExecutionTrace {
  layer: string
  ts: string
  modelId: string | null
  detail: string
  payload?: Record<string, unknown>
  cliArgs?: string[]
  exitCode?: number | null
  ok?: boolean
}
