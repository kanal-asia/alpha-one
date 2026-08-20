import type {
  ModelsDevEnrichment,
  ModelsDevInputModality,
} from "./types";

/**
 * TASK-OPENCODE-084: Pure Models.dev metadata resolution.
 *
 * This module is intentionally dependency-free (no Node imports) so it can be
 * imported by the browser test suite and by the server-side client. Models.dev
 * is an ENRICHMENT source only — provider/model availability stays
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
  // Models.dev model detail pages use the canonical provider/model identity.
  const safeProvider = encodeURIComponent(providerId);
  const safeModel = encodeURIComponent(modelId);
  return `https://models.dev/#/${safeProvider}/${safeModel}`;
}

/**
 * Resolve a runtime model against a given Models.dev catalog. Returns null when
 * no usable match exists — enrichment is optional and never blocks availability.
 */
export function resolveModelsDevEnrichmentFromCatalog(
  providers: ModelsDevCatalog,
  provider: string,
  slug: string,
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
  return {
    providerId: providerEntry.id ?? provider,
    modelId,
    detailUrl: modelsDevDetailUrl(providerEntry.id ?? provider, modelId),
    inputPrice: normalizeModelsDevPrice(match.cost?.input),
    outputPrice: normalizeModelsDevPrice(match.cost?.output),
    inputModalities: normalizeInputModalities(match),
    matched: true,
  };
}
