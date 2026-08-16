import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Cloud provider credential store + validation for Alpha Workspace.
 *
 * Keys are persisted locally (never sent anywhere except the provider you
 * configure). The server is the only reader of the raw key; the UI only ever
 * sees a masked form.
 */

export type ProviderAuthKind = "bearer" | "x-api-key" | "query-key";

export interface ProviderDefinition {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  auth: ProviderAuthKind;
  modelsPath: string;
}

export const PROVIDER_DEFINITIONS: ProviderDefinition[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    description: "Unified gateway to hundreds of open and closed models.",
    baseUrl: "https://openrouter.ai",
    auth: "bearer",
    modelsPath: "/api/v1/models",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT models and assistants API.",
    baseUrl: "https://api.openai.com",
    auth: "bearer",
    modelsPath: "/v1/models",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models (Claude Code).",
    baseUrl: "https://api.anthropic.com",
    auth: "x-api-key",
    modelsPath: "/v1/models",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini models from Google AI Studio / Vertex.",
    baseUrl: "https://generativelanguage.googleapis.com",
    auth: "query-key",
    modelsPath: "/v1beta/models",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Ultra-fast inference for open models.",
    baseUrl: "https://api.groq.com",
    auth: "bearer",
    modelsPath: "/openai/v1/models",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek reasoning and chat models.",
    baseUrl: "https://api.deepseek.com",
    auth: "bearer",
    modelsPath: "/models",
  },
  {
    id: "opencode-cloud",
    name: "OpenCode Cloud",
    description: "Alpha/OpenCode hosted models (Zen gateway).",
    baseUrl: "https://opencode.ai",
    auth: "bearer",
    modelsPath: "/zen/v1/models",
  },
];

interface StoredProvider {
  enabled: boolean;
  apiKey: string | null;
  health: "unknown" | "ok" | "failed";
  lastHealthCheck: string | null;
  lastError: string | null;
  modelCount: number | null;
}

interface StoreFile {
  providers: Record<string, StoredProvider>;
}

const CONFIG_DIR = join(homedir(), ".alpha-one");
const CONFIG_FILE = join(CONFIG_DIR, "providers.json");

function emptyStore(): StoreFile {
  return { providers: {} };
}

function readStore(): StoreFile {
  try {
    if (!existsSync(CONFIG_FILE)) return emptyStore();
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as StoreFile;
  } catch {
    return emptyStore();
  }
}

function writeStore(store: StoreFile) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.error("[providers] failed to persist config", err);
  }
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export function providerDefinition(id: string): ProviderDefinition | undefined {
  return PROVIDER_DEFINITIONS.find((p) => p.id === id);
}

export function listProviderStates() {
  const store = readStore();
  return PROVIDER_DEFINITIONS.map((def) => {
    const stored = store.providers[def.id];
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      enabled: stored?.enabled ?? true,
      apiKeySet: Boolean(stored?.apiKey),
      apiKeyMasked: stored?.apiKey ? maskKey(stored.apiKey) : null,
      health: stored?.health ?? "unknown",
      lastHealthCheck: stored?.lastHealthCheck ?? null,
      lastError: stored?.lastError ?? null,
      modelCount: stored?.modelCount ?? null,
    };
  });
}

export function setProviderKey(id: string, apiKey: string): boolean {
  const def = providerDefinition(id);
  if (!def) return false;
  const store = readStore();
  store.providers[id] = {
    enabled: store.providers[id]?.enabled ?? true,
    apiKey: apiKey.trim(),
    health: "unknown",
    lastHealthCheck: null,
    lastError: null,
    modelCount: null,
  };
  writeStore(store);
  return true;
}

export function removeProviderKey(id: string): boolean {
  const store = readStore();
  if (!store.providers[id]) return false;
  delete store.providers[id];
  writeStore(store);
  return true;
}

export function setProviderEnabled(id: string, enabled: boolean): boolean {
  const def = providerDefinition(id);
  if (!def) return false;
  const store = readStore();
  store.providers[id] = {
    ...store.providers[id],
    enabled,
    health: store.providers[id]?.health ?? "unknown",
    lastHealthCheck: store.providers[id]?.lastHealthCheck ?? null,
    lastError: store.providers[id]?.lastError ?? null,
    modelCount: store.providers[id]?.modelCount ?? null,
  };
  writeStore(store);
  return true;
}

export async function validateProviderKey(
  id: string,
): Promise<{ ok: boolean; message: string; latencyMs: number; modelCount: number }> {
  const def = providerDefinition(id);
  if (!def) return { ok: false, message: `Unknown provider: ${id}`, latencyMs: 0, modelCount: 0 };

  const store = readStore();
  const apiKey = store.providers[id]?.apiKey;
  if (!apiKey) {
    return { ok: false, message: "No API key configured for this provider.", latencyMs: 0, modelCount: 0 };
  }

  const url = `${def.baseUrl}${def.modelsPath}`;
  const headers: Record<string, string> = {};
  if (def.auth === "bearer") headers["Authorization"] = `Bearer ${apiKey}`;
  if (def.auth === "x-api-key") headers["x-api-key"] = apiKey;

  const start = Date.now();
  try {
    const res = await fetch(def.auth === "query-key" ? `${url}?key=${encodeURIComponent(apiKey)}` : url, {
      headers: { Accept: "application/json", ...headers },
      signal: AbortSignal.timeout(12_000),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const message = `HTTP ${res.status} ${res.statusText}`;
      store.providers[id] = {
        ...store.providers[id],
        health: "failed",
        lastHealthCheck: new Date().toISOString(),
        lastError: message,
      };
      writeStore(store);
      return { ok: false, message, latencyMs, modelCount: 0 };
    }
    const body = (await res.json()) as { data?: unknown[]; models?: unknown[] };
    const modelCount = Array.isArray(body.data)
      ? body.data.length
      : Array.isArray(body.models)
        ? body.models.length
        : 0;
    store.providers[id] = {
      ...store.providers[id],
      health: "ok",
      lastHealthCheck: new Date().toISOString(),
      lastError: null,
      modelCount,
    };
    writeStore(store);
    return { ok: true, message: `Connection validated (${modelCount} models).`, latencyMs, modelCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Validation failed.";
    const latencyMs = Date.now() - start;
    store.providers[id] = {
      ...store.providers[id],
      health: "failed",
      lastHealthCheck: new Date().toISOString(),
      lastError: message,
    };
    writeStore(store);
    return { ok: false, message, latencyMs, modelCount: 0 };
  }
}
