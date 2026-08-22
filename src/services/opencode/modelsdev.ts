import type {
  ModelsDevEnrichment,
  ModelsDevInputModality,
} from "./types";

/**
 * TASK-OPENCODE-084: Pure Models.dev metadata resolution.
 *
 * This module is intentionally dependency-free (no Node imports) so it can be
 * imported by the browser test suite and by the server-side client. Models.dev
 * is an ENRICHMENT source only ΓÇö provider/model availability stays
 * authoritative from the runtime. Enrichment fails open (a miss returns null).
 */

/** Raw per-model entry in the local Models.dev catalog snapshot. */
export interface ModelsDevModelEntry {
  id?: string;
  name?: string;
  cost?: { input?: number | null; output?: number | null };
  modalities?: { input?: string[] };
}

/** Raw per-provider entry in the local Models.dev catalog snapshot. */
export interface ModelsDevProviderEntryFull {
  id?: string;
  name?: string;
  models?: Record<string, ModelsDevModelEntry>;
}

export type ModelsDevCatalog = Record<string, ModelsDevProviderEntryFull>;

/**
 * TASK-OPENCODE-085: Model-centric (canonical) Models.dev catalog.
 * Keyed by canonical `<lab>/<model>` (e.g. "xiaomi/mimo-v2.5"). This is the
 * only source of the canonical model identity used for `models/<lab>/<model>/`
 * detail URLs. It is separate from the provider-centric snapshot.
 */
export interface CanonicalModelEntry {
  id?: string;
  name?: string;
  family?: string;
}

export type CanonicalModelMap = Record<string, CanonicalModelEntry>;

function normalizeModelsDevPrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[, ]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function normalizeInputModalities(raw: ModelsDevModelEntry): ModelsDevInputModality[] {
  const input = Array.isArray(raw.modalities?.input) ? raw.modalities!.input! : [];
  const known: ModelsDevInputModality[] = ["text", "image", "video", "audio", "pdf"];
  return known.filter((k) => input.includes(k));
}

function modelsDevDetailUrl(providerId: string, modelId: string): string {
  const safeProvider = encodeURIComponent(providerId);
  const safeModel = encodeURIComponent(modelId);
  return `https://models.dev/models/${safeProvider}/${safeModel}/`;
}

/**
 * Normalize a Models.dev name/id for canonical matching. Lowers case, removes
 * parenthetical annotations and edition suffixes (Free/latest), and collapses
 * whitespace/dashes so "MiMo V2.5 Free" and "MiMo-V2.5" compare equal.
 */
function normalizeCanonicalKey(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/\b(free|latest)\b/g, "")
    .replace(/[\s._]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * TASK-OPENCODE-085: Resolve the canonical Models.dev detail URL for a matched
 * provider model against the model-centric canonical map.
 *
 * Returns `null` (caller omits `Model details`) when no reliable canonical
 * identity exists. Matching uses Models.dev metadata names (not the runtime
 * display name / provider id) and only emits a URL for an UNAMBIGUOUS match ΓÇö
 * preferring the base (non-date-suffixed) canonical entry. Never fabricates.
 */
export function resolveCanonicalUrlFromMap(
  canonicalMap: CanonicalModelMap,
  providerModelName: string,
  providerModelSlug: string,
): string | null {
  if (!canonicalMap || Object.keys(canonicalMap).length === 0) return null;

  // Index canonical entries by normalized name AND by normalized model-part id.
  const byName = new Map<string, string[]>();
  const byModelPart = new Map<string, string[]>();
  for (const [key, entry] of Object.entries(canonicalMap)) {
    const nameKey = normalizeCanonicalKey(entry.name ?? key);
    if (nameKey) {
      const arr = byName.get(nameKey) ?? [];
      arr.push(key);
      byName.set(nameKey, arr);
    }
    const parts = key.split("/");
    const modelPart = parts[parts.length - 1] ?? "";
    const mpKey = normalizeCanonicalKey(modelPart);
    if (mpKey) {
      const arr = byModelPart.get(mpKey) ?? [];
      arr.push(key);
      byModelPart.set(mpKey, arr);
    }
  }

  // Candidate canonical keys from the provider model name/slug.
  const candidates = new Set<string>();
  for (const k of byName.get(normalizeCanonicalKey(providerModelName)) ?? []) candidates.add(k);
  for (const k of byModelPart.get(normalizeCanonicalKey(providerModelSlug)) ?? []) candidates.add(k);

  if (candidates.size === 0) return null;

  // Prefer the base entry when multiple candidates are date/pro-edit variants
  // of one another (e.g. "claude-sonnet-4-5-20250929" vs "claude-sonnet-4-5").
  const picked = [...candidates].sort((a, b) => a.length - b.length)[0];
  return `https://models.dev/models/${picked}/`;
}

/**
 * Resolve a runtime model against a given Models.dev catalog. Returns null when
 * no usable match exists ΓÇö enrichment is optional and never blocks availability.
 */
export function resolveModelsDevEnrichmentFromCatalog(
  providers: ModelsDevCatalog,
  provider: string,
  slug: string,
  canonicalMap?: CanonicalModelMap,
): ModelsDevEnrichment | null {
  const providerEntry = providers[provider];
  if (!providerEntry || !providerEntry.models) return null;

  // Strongest identity: Models.dev model `id` or catalog key equal to slug.
  let match: ModelsDevModelEntry | undefined;
  let matchKey: string | undefined;
  for (const [key, m] of Object.entries(providerEntry.models)) {
    if (m.id === slug || key === slug) {
      match = m;
      matchKey = key;
      break;
    }
  }
  // Fallback: prefix match to tolerate Models.dev date-suffixed ids
  // (e.g. "claude-sonnet-4-5@20250929") and provider-scoped ids
  // (e.g. "nvidia/nemotron-3-super-120b-a12b").
  if (!match) {
    for (const [key, m] of Object.entries(providerEntry.models)) {
      const id = m.id ?? key;
      if (id === slug || key === slug || id.startsWith(slug) || slug.startsWith(id)) {
        match = m;
        matchKey = key;
        break;
      }
    }
  }
  if (!match) return null;

  const modelId = match.id ?? matchKey ?? slug;
  const canonicalUrl = canonicalMap
    ? resolveCanonicalUrlFromMap(canonicalMap, match.name ?? modelId, slug)
    : null;
  return {
    providerId: providerEntry.id ?? provider,
    modelId,
    detailUrl: modelsDevDetailUrl(providerEntry.id ?? provider, modelId),
    ...(canonicalUrl ? { canonicalUrl } : {}),
    inputPrice: normalizeModelsDevPrice(match.cost?.input),
    outputPrice: normalizeModelsDevPrice(match.cost?.output),
    inputModalities: normalizeInputModalities(match),
    matched: true,
  };
}

/**
 * TASK-086: Resolve an OpenCode Go model against the Models.dev catalog using
 * a two-phase strategy:
 *
 * 1. Look up the model in the `opencode-go` provider (exact match by slug).
 *    This provides OpenCode Go pricing and input modalities ΓÇö the authoritative
 *    source for Go model display.
 *
 * 2. Search ALL other providers for the canonical model identity (exact match
 *    only, no prefix). This gives us the canonical lab/model URL
 *    (e.g. `moonshotai/kimi-k2.7-code`).
 *
 * 3. Merge: pricing + modalities from `opencode-go`, canonical URL from the
 *    best cross-provider match.
 *
 * Returns null only when no match exists in any provider.
 */
export function resolveGoModelEnrichmentFromCatalog(
  providers: ModelsDevCatalog,
  slug: string,
  canonicalMap?: CanonicalModelMap,
): ModelsDevEnrichment | null {
  // ---- Phase 1: opencode-go provider (pricing + modalities) ----
  const ocgEntry = providers["opencode-go"];
  let ocgMatch: ModelsDevModelEntry | undefined;
  if (ocgEntry?.models) {
    for (const [key, m] of Object.entries(ocgEntry.models)) {
      if (m.id === slug || key === slug) {
        ocgMatch = m;
        break;
      }
    }
  }

  // ---- Phase 2: cross-provider canonical search (canonical URL) ----
  let canonicalProviderId = "";
  let canonicalModelId = "";
  let canonicalMatch: ModelsDevModelEntry | undefined;

  for (const [providerKey, providerEntry] of Object.entries(providers)) {
    if (providerKey === "opencode-go") continue;
    if (!providerEntry?.models) continue;

    // Exact match only ΓÇö no prefix matching across providers to avoid
    // false positives (e.g. kimi-k2 must not match kimi-k2.7-code).
    for (const [key, m] of Object.entries(providerEntry.models)) {
      if (m.id === slug || key === slug) {
        canonicalMatch = m;
        canonicalProviderId = providerEntry.id ?? providerKey;
        canonicalModelId = m.id ?? key;
        break;
      }
    }
    if (canonicalMatch) break;
  }

  // Resolve canonical URL from the canonical model map using the best
  // available identity (canonical provider match > opencode-go match).
  let canonicalUrl: string | null = null;
  if (canonicalMap) {
    const nameForLookup = canonicalMatch?.name ?? ocgMatch?.name ?? slug;
    canonicalUrl = resolveCanonicalUrlFromMap(canonicalMap, nameForLookup, slug);
  }

  // ---- Phase 3: merge and return ----
  if (!ocgMatch && !canonicalMatch) return null;

  // Prefer opencode-go for pricing/modalities (OpenCode Go is source of truth).
  // Fall back to canonical provider data when opencode-go entry is missing.
  const pricingSource = ocgMatch ?? canonicalMatch!;
  const modelId = ocgMatch?.id ?? canonicalModelId ?? slug;
  const providerId = canonicalProviderId || "opencode-go";

  return {
    providerId,
    modelId,
    detailUrl: modelsDevDetailUrl(providerId, canonicalModelId || modelId),
    ...(canonicalUrl ? { canonicalUrl } : {}),
    inputPrice: normalizeModelsDevPrice(pricingSource.cost?.input),
    outputPrice: normalizeModelsDevPrice(pricingSource.cost?.output),
    inputModalities: normalizeInputModalities(
      ocgMatch ?? canonicalMatch!,
    ),
    matched: true,
  };
}
