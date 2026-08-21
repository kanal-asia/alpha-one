/**
 * OpenCode Go dynamic model source (TASK-086).
 *
 * Fetches the model list from the OpenCode Go public API and exposes it to
 * the `/api/ai-big-deals/opencode-go` endpoint.  The data is fetched lazily
 * on first `ensureOpenCodeGoData()` call and cached in memory.  A TTL
 * controls staleness – a stale response is still served but flagged.
 *
 * Exports (consumed by server.ts):
 *   ensureOpenCodeGoData()  – async, fetches if needed
 *   getOpenCodeGoData()     – sync, returns the cached snapshot or null
 */

// ---------------------------------------------------------------------------
// Types – kept local to this module.  The shape mirrors what the OpenCode Go
// public API returns, plus the normalisation we apply for the frontend.
// ---------------------------------------------------------------------------

interface RawGoModel {
  id: string
  name?: string
  owned_by?: string | null
  created?: number | null
}

export interface GoModel {
  id: string
  displayName: string
  ownedBy: string | null
  created: number | null
}

export interface OpenCodeGoSnapshot {
  models: GoModel[]
  modelCount: number
  sourceUrl: string
  fetchedAt: string
  stale: boolean
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SOURCE_URL =
  process.env.OPENCODE_GO_MODELS_URL ?? 'https://opencode.ai/zen/go/v1/models'

/** How long (ms) a cached snapshot is considered fresh. */
const FRESHNESS_TTL_MS = 5 * 60 * 1000 // 5 minutes

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

let cache: OpenCodeGoSnapshot | null = null
let lastFetchMs = 0

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalise(raw: RawGoModel[]): GoModel[] {
  return raw.map((m) => ({
    id: m.id,
    displayName: m.name ?? m.id,
    ownedBy: m.owned_by ?? null,
    created: m.created ?? null,
  }))
}

async function fetchModels(): Promise<OpenCodeGoSnapshot | null> {
  try {
    const res = await fetch(SOURCE_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const body = (await res.json()) as { data?: RawGoModel[]; models?: RawGoModel[] }
    // The OpenCode Go API may return the array under `data` or `models`.
    const raw: RawGoModel[] = Array.isArray(body.data)
      ? body.data
      : Array.isArray(body.models)
        ? body.models
        : Array.isArray(body as unknown)
          ? (body as unknown as RawGoModel[])
          : []
    const models = normalise(raw)
    const now = new Date().toISOString()
    return {
      models,
      modelCount: models.length,
      sourceUrl: SOURCE_URL,
      fetchedAt: now,
      stale: false,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API – consumed by server.ts
// ---------------------------------------------------------------------------

/**
 * Ensure the OpenCode Go model data is loaded.  Safe to call multiple times;
 * subsequent calls are no-ops while the cache is fresh.
 */
export async function ensureOpenCodeGoData(): Promise<void> {
  const now = Date.now()
  if (cache && now - lastFetchMs < FRESHNESS_TTL_MS) return

  const snapshot = await fetchModels()
  if (snapshot) {
    cache = snapshot
    lastFetchMs = now
  } else if (!cache) {
    // First fetch failed – leave cache null so getOpenCodeGoData returns null.
  } else {
    // Subsequent fetch failed – mark the existing cache as stale.
    cache = { ...cache, stale: true }
  }
}

/**
 * Return the current OpenCode Go snapshot, or null if data has never been
 * fetched successfully.  The caller (server.ts) maps null → 503.
 */
export function getOpenCodeGoData(): OpenCodeGoSnapshot | null {
  return cache
}
