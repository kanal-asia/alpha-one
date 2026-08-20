/** Input modality kinds as represented by Models.dev. */
export type ModelsDevInputModality = "text" | "image" | "video" | "audio" | "pdf";

/**
 * Models.dev enrichment for a single model (TASK-OPENCODE-084).
 *
 * This is OPTIONAL, additive metadata resolved from the local Models.dev
 * catalog (OpenCode's models.dev snapshot). It is enrichment only — never the
 * source of truth for provider/model availability. All fields are `null`/
 * absent when Models.dev has no usable entry for the model.
 */
export interface ModelsDevEnrichment {
  /** Provider id as it appears in Models.dev (e.g. "google-vertex"). */
  providerId: string;
  /** Resolved Models.dev model id (e.g. "gemini-2.5-flash"). */
  modelId: string;
  /** Models.dev model detail page URL. */
  detailUrl: string;
  /** Input price per 1M tokens (USD). Null when unknown. */
  inputPrice: number | null;
  /** Output price per 1M tokens (USD). Null when unknown. */
  outputPrice: number | null;
  /** Supported input modalities. Empty when unknown. */
  inputModalities: ModelsDevInputModality[];
  /** True when a valid Models.dev match was found. */
  matched: boolean;
}

export type Capability = "reasoning" | "vision" | "coding" | "function-calling";

export type ModelTag = "free" | "fast" | "reasoning" | "vision" | "coding" | "new" | "recommended";

export type LatencyCategory = "low" | "medium" | "high" | "unknown";

export type Availability = "available" | "degraded" | "unavailable" | "unknown";

export interface ModelPricing {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  currency: string;
  free: boolean;
}

export interface ProviderModel {
  /** Canonical model identity `provider/slug` (e.g. "opencode/deepseek-v4-flash-free"). Immutable once discovered. */
  id: string;
  /** Bare model key (e.g. "deepseek-v4-flash-free"). Search/filter only. */
  slug: string;
  provider: string;
  name: string;
  family?: string;
  description?: string;
  apiUrl?: string;
  pricing: ModelPricing;
  contextWindow: number | null;
  maxOutputTokens: number | null;
  capabilities: Capability[];
  tags: ModelTag[];
  latency: LatencyCategory;
  availability: Availability;
  metadata?: Record<string, unknown>;
  /** TASK-OPENCODE-023: Available reasoning variants (e.g. "low", "high"). */
  variants?: Record<string, Record<string, unknown>>;
}

export interface ProviderInfo {
  id: string;
  name: string;
  models: ProviderModel[];
}

export type ProviderSource = "opencode" | "fallback" | "mock";

export interface ModelsResponse {
  providers: ProviderInfo[];
  models: ProviderModel[];
  fetchedAt: string;
  source: ProviderSource;
  warnings: string[];
}

export type InstallState = "installed" | "not_installed";

export interface ProviderStatus {
  state: InstallState;
  version: string | null;
  executablePath: string | null;
  resolvedCommand: string | null;
  probeMs: number | null;
  error: string | null;
  checkedAt: string;
}

export type ConnectionState = "connected" | "configured" | "available" | "unavailable";

/** Where a provider entry came from. */
export type ProviderSourceKind = "runtime" | "registry";

export interface ProviderSummary {
  id: string;
  name: string;
  connection: ConnectionState;
  modelCount: number;
  freeModelCount: number;
  hasCredentials: boolean;
  requiresAuth: boolean;
  /**
   * `runtime` = provider has live models discovered from the OpenCode CLI
   * (`opencode models --verbose`). `registry` = provider exists in the
   * OpenCode-supported models.dev registry cache but has no credentials yet.
   */
  source: ProviderSourceKind;
}

export type HealthState = "healthy" | "degraded" | "down" | "unknown";

export interface HealthStatus {
  state: HealthState;
  cliReachable: boolean;
  version: string | null;
  probeMs: number | null;
  checkedAt: string;
  notes: string[];
}

export interface OpenCodeChatEvent {
  type: string;
  text?: string;
  tokens?: {
    total?: number;
    input?: number;
    output?: number;
    reasoning?: number;
    cache?: { read?: number; write?: number };
    cost?: number;
  };
  [key: string]: unknown;
}

export interface ChatResult {
  text: string;
  sessionId: string | null;
  tokens: {
    total: number;
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
    cost: number;
  };
  events: OpenCodeChatEvent[];
}

export interface OpenCodeRawModel {
  id?: string;
  name?: string;
  provider?: string;
  description?: string;
  cost?: {
    input?: number | null;
    output?: number | null;
    cache_read?: number | null;
    cache_write?: number | null;
    currency?: string;
  } | null;
  context?: number | null;
  max_output?: number | null;
  reasoning?: boolean;
  vision?: boolean;
  coding?: boolean;
  function_calling?: boolean;
  latency?: LatencyCategory;
  availability?: Availability;
  tags?: string[];
  [key: string]: unknown;
}

export interface TokenUsage {
  input: number;
  output: number;
  reasoning: number;
  cached: number;
  total: number;
}

export interface SessionStats {
  id: string;
  createdAt: string;
  lastActivity: string;
  model: string | null;
  provider: string | null;
  mode: string;
  contextLimit: number | null;
  contextUsed: number;
  usagePercent: number;
  messages: number;
  userMessages: number;
  assistantMessages: number;
  tokens: TokenUsage;
  estimatedCost: number;
  executionTimeMs: number;
  avgResponseMs: number;
  project: string | null;
  developerMode: boolean;
}

export interface AttachmentMeta {
  id: string;
  name: string;
  size: number;
  type: string;
  kind: "image" | "markdown" | "pdf" | "text" | "code" | "archive" | "other";
  dataUrl?: string;
}

export interface DevConsoleEvent {
  id: string;
  ts: string;
  level: "request" | "response" | "tool" | "runtime" | "error" | "warning" | "performance";
  category: string;
  title: string;
  detail?: string;
  durationMs?: number;
  raw?: unknown;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  createdAt: string;
  tokens?: ChatResult["tokens"];
  error?: boolean;
}