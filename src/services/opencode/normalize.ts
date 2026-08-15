import type {
  Capability,
  LatencyCategory,
  ModelTag,
  OpenCodeRawModel,
  ProviderInfo,
  ProviderModel,
} from "./types";

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value.replace(/[, ]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Real `opencode models --verbose` emits one JSON object per model. The `cost`
 * field is either a single object (CLI) or an array with one entry (REST API).
 */
function firstCost(raw: OpenCodeRawModel): {
  input?: number | null;
  output?: number | null;
  cache?: { read?: number | null; write?: number | null };
  cache_read?: number | null;
  cache_write?: number | null;
} | null {
  const c = (raw as Record<string, unknown>).cost;
  if (Array.isArray(c) && c.length) return (c[0] as never) ?? null;
  if (c && typeof c === "object") return c as never;
  return null;
}

function limitOf(raw: OpenCodeRawModel): { context?: unknown; input?: unknown; output?: unknown } {
  const l = (raw as Record<string, unknown>).limit;
  if (l && typeof l === "object") return l as never;
  return {};
}

function caps(raw: OpenCodeRawModel): Record<string, unknown> {
  const c = (raw as Record<string, unknown>).capabilities;
  if (c && typeof c === "object") return c as never;
  return {};
}

function modality(raw: OpenCodeRawModel, kind: "input" | "output", key: string): boolean {
  const c = caps(raw);
  const m = (c[kind] ?? {}) as Record<string, unknown>;
  return m[key] === true;
}

const KNOWN_TAGS: ModelTag[] = ["free", "fast", "reasoning", "vision", "coding", "new", "recommended"];

function normalizeTags(raw: OpenCodeRawModel, free: boolean, reasoning: boolean, vision: boolean): ModelTag[] {
  const tags = new Set<ModelTag>();
  if (free) tags.add("free");
  if (reasoning) tags.add("reasoning");
  if (vision) tags.add("vision");
  if (raw.coding) tags.add("coding");
  if ((raw as Record<string, unknown>).latency === "low") tags.add("fast");

  const releaseDate = (raw as Record<string, unknown>).release_date;
  if (typeof releaseDate === "string") {
    const released = Date.parse(releaseDate);
    if (Number.isFinite(released) && released > Date.now() - 1000 * 60 * 60 * 24 * 90) tags.add("new");
  }

  if (Array.isArray(raw.tags)) {
    for (const t of raw.tags) {
      const tag = String(t).toLowerCase() as ModelTag;
      if (KNOWN_TAGS.includes(tag)) tags.add(tag);
    }
  }
  return [...tags];
}

function normalizeCapabilities(raw: OpenCodeRawModel, reasoning: boolean, vision: boolean): Capability[] {
  const capsList: Capability[] = [];
  const c = caps(raw);
  if (reasoning) capsList.push("reasoning");
  if (vision) capsList.push("vision");
  if (c.toolcall === true) capsList.push("function-calling");
  return capsList;
}

function normalizeLatency(value: unknown): LatencyCategory {
  const v = String(value ?? "").toLowerCase();
  if (v === "low" || v === "fast") return "low";
  if (v === "medium" || v === "moderate") return "medium";
  if (v === "high" || v === "slow") return "high";
  return "unknown";
}

function normalizeAvailability(value: unknown): ProviderModel["availability"] {
  const v = String(value ?? "").toLowerCase();
  if (v === "active" || v === "available" || v === "ok") return "available";
  if (v === "degraded") return "degraded";
  if (v === "unavailable" || v === "down" || v === "error") return "unavailable";
  return "unknown";
}

export function normalizeModel(raw: OpenCodeRawModel, fallbackProvider = "unknown"): ProviderModel {
  const provider = String((raw as Record<string, unknown>).providerID ?? raw.provider ?? fallbackProvider);
  // The raw `id` is the bare slug (CLI verbose output), e.g. "big-pickle".
  // Some REST endpoints already emit "provider/id" — never double-prefix those.
  const rawId = String(raw.id ?? raw.name ?? "unknown");
  const slug = rawId.includes("/") ? rawId.split("/").pop() ?? rawId : rawId;
  const id = rawId.includes("/") ? rawId : `${provider}/${slug}`;
  const name = String(raw.name ?? id);
  const family = String((raw as Record<string, unknown>).family ?? "");

  const cost = firstCost(raw);
  const input = toNumber(cost?.input);
  const output = toNumber(cost?.output);
  const free = input === 0 && output === 0;

  const lim = limitOf(raw);
  const c = caps(raw);
  const reasoning = c.reasoning === true;
  const vision = modality(raw, "input", "image");
  const status = String((raw as Record<string, unknown>).status ?? "");

  // TASK-OPENCODE-023: Extract variants from raw CLI output.
  const rawVariants = (raw as Record<string, unknown>).variants;
  const variants: Record<string, Record<string, unknown>> | undefined =
    rawVariants && typeof rawVariants === "object" && Object.keys(rawVariants).length > 0
      ? (rawVariants as Record<string, Record<string, unknown>>)
      : undefined;

  return {
    id,
    slug,
    provider,
    name,
    family,
    description: raw.description,
    apiUrl: (raw as Record<string, unknown>).api
      ? String(((raw as Record<string, unknown>).api as Record<string, unknown>).url ?? "")
      : undefined,
    pricing: {
      input,
      output,
      cacheRead: toNumber(cost?.cache_read ?? cost?.cache?.read),
      cacheWrite: toNumber(cost?.cache_write ?? cost?.cache?.write),
      currency: "USD",
      free,
    },
    contextWindow: toNumber(lim.context),
    maxOutputTokens: toNumber(lim.output),
    capabilities: normalizeCapabilities(raw, reasoning, vision),
    tags: normalizeTags(raw, free, reasoning, vision),
    latency: normalizeLatency((raw as Record<string, unknown>).latency),
    availability: normalizeAvailability(status || raw.availability),
    metadata: raw,
    variants,
  };
}

export function groupByProvider(models: ProviderModel[]): ProviderInfo[] {
  const map = new Map<string, ProviderModel[]>();
  for (const m of models) {
    if (!map.has(m.provider)) map.set(m.provider, []);
    map.get(m.provider)!.push(m);
  }
  return [...map.entries()].map(([id, mods]) => ({
    id,
    name: id,
    models: mods.sort((a, b) => a.name.localeCompare(b.name)),
  }));
}