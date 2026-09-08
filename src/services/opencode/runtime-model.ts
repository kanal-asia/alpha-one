import {
  toRuntimeModel,
  type RuntimeModel,
  type RuntimeProvider,
} from "../../features/runtime/contract";
import { fetchModelCatalog } from "./client";
import type { ProviderModel } from "./types";

/**
 * Runtime adapter: maps a discovered `ProviderModel` to the canonical
 * `RuntimeModel` contract. The canonical `id` was already built at discovery
 * (normalizeModel); this adapter ONLY maps fields — it never reconstructs the id.
 */
export function toRuntimeModelAdapter(pm: ProviderModel): RuntimeModel {
  return toRuntimeModel({
    provider: pm.provider,
    slug: pm.slug,
    displayName: pm.name,
    free: pm.pricing.free,
    contextWindow: pm.contextWindow ?? 0,
    supportsTools: pm.capabilities.includes("function-calling"),
    availability: pm.availability,
    latency: pm.latency === "unknown" ? undefined : pm.latency,
    variants: pm.variants,
  });
}

/**
 * OpenCode runtime provider — implements the RuntimeProvider contract.
 * `discoverModels()` returns `RuntimeModel[]` using the TTL-aware cache.
 * Fresh data is returned when the cache is fresh; stale data + background
 * refresh is used when the cache is stale.
 */
export const openCodeRuntimeProvider: RuntimeProvider = {
  id: "opencode",
  label: "OpenCode",
  async discoverModels(): Promise<RuntimeModel[]> {
    const discovery = await fetchModelCatalog();
    return discovery.models.map(toRuntimeModelAdapter);
  },
};

export function toRuntimeModels(models: ProviderModel[]): RuntimeModel[] {
  return models.map(toRuntimeModelAdapter);
}
