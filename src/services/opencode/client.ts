import { spawn } from "node:child_process";
import { delimiter, join } from "node:path";
import { accessSync, constants, readFileSync, realpathSync, openSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import type {
  ChatResult,
  HealthStatus,
  ModelsResponse,
  OpenCodeChatEvent,
  OpenCodeRawModel,
  ProviderModel,
  ProviderStatus,
  ProviderSummary,
} from "./types";
import { groupByProvider, normalizeModel } from "./normalize";
import { assertCanonicalModelId, type RuntimeModel } from "../../features/runtime/contract";

export interface Resolved {
  command: string;
  prefixArgs: string[];
}

interface OpenCodeListShape {
  providers?: Array<{ id?: string; name?: string; models?: OpenCodeRawModel[] }>;
  models?: OpenCodeRawModel[];
  [key: string]: unknown;
}

function fileExists(p: string): boolean {
  try {
    accessSync(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function pathDirs(): string[] {
  return (process.env.PATH ?? "").split(delimiter).filter(Boolean);
}

/**
 * Resolve the OpenCode CLI to something that can be launched WITHOUT a shell and
 * WITHOUT invoking a Windows .cmd batch shim (which allocates a console window).
 *
 * Priority on Windows:
 *   1. A real .exe on PATH            -> run directly.
 *   2. An npm .cmd shim               -> DO NOT run the .cmd. Read the target it
 *                                        launches (a sibling .exe or .js) and run
 *                                        it directly with Node when needed.
 *   3. A bare `opencode` (JS) file    -> run with Node.
 * On POSIX: run the resolved binary directly.
 */
export function resolveOpenCode(): Resolved | null {
  const isWin = process.platform === "win32";

  if (!isWin) {
    for (const dir of pathDirs()) {
      const candidate = join(dir, "opencode");
      if (fileExists(candidate)) return { command: candidate, prefixArgs: [] };
    }
    return { command: "opencode", prefixArgs: [] };
  }

  for (const dir of pathDirs()) {
    const exe = join(dir, "opencode.exe");
    if (fileExists(exe)) return { command: exe, prefixArgs: [] };

    const cmd = join(dir, "opencode.cmd");
    if (fileExists(cmd)) {
      const target = resolveNpmShimTarget(dir, cmd);
      if (target) {
        if (target.endsWith(".exe")) return { command: target, prefixArgs: [] };
        return { command: process.execPath, prefixArgs: [target] };
      }
    }

    const bare = join(dir, "opencode");
    if (fileExists(bare)) return { command: process.execPath, prefixArgs: [bare] };
  }

  return null;
}

function resolveNpmShimTarget(dir: string, cmdPath: string): string | null {
  const guesses = [
    join(dir, "node_modules", "opencode-ai", "bin", "opencode.exe"),
    join(dir, "node_modules", "opencode-ai", "bin", "opencode.js"),
    join(dir, "node_modules", "opencode", "bin", "opencode.exe"),
    join(dir, "node_modules", "opencode", "bin", "opencode.js"),
  ];
  for (const g of guesses) {
    if (fileExists(g)) return realpathSafe(g);
  }

  // Parse the .cmd shim to extract the target it launches (exe or js).
  try {
    const content = readFileSync(cmdPath, "utf8");
    const m =
      content.match(/"%~dp0\\([^"]+\.(?:exe|mc?js))"/i) ??
      content.match(/"?([\w./\\:-]+\.(?:exe|mc?js))"?/i);
    if (m && m[1]) {
      const rel = m[1].replace(/^%~dp0\\?/i, "").replace(/^"|"$/g, "");
      const abs = join(dir, rel);
      if (fileExists(abs)) return realpathSafe(abs);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function realpathSafe(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}

/**
 * Run OpenCode headlessly. No shell, no .cmd shim, no detached process, no
 * console window. stdout/stderr are captured programmatically.
 */
export function runOpenCode(args: string[], timeoutMs = 30_000): Promise<string | null> {
  const resolved = resolveOpenCode();
  if (!resolved) return Promise.resolve(null);

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(resolved.command, [...resolved.prefixArgs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
      detached: false,
      env: { ...process.env, OPENCODE_NO_TUI: "1", CI: "1", NO_COLOR: "1" },
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolve(stdout.trim().length ? stdout : null);
    }, timeoutMs);

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(null);
    });

    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void stderr;
      resolve(stdout.trim().length ? stdout : null);
    });
  });
}

function parseJson(stdout: string): OpenCodeListShape | null {
  try {
    return JSON.parse(stdout) as OpenCodeListShape;
  } catch {
    return null;
  }
}

/**
 * Parse real `opencode models --verbose` output. Each model is introduced by a
 * `provider/id` header line, followed by a pretty-printed JSON object.
 */
function parseModelsVerbose(stdout: string): OpenCodeRawModel[] {
  const lines = stdout.split(/\r?\n/);
  const models: OpenCodeRawModel[] = [];
  let buffer: string[] = [];
  let headerProvider: string | null = null;

  const flush = () => {
    if (!headerProvider || buffer.length === 0) {
      buffer = [];
      return;
    }
    const blob = buffer.join("\n");
    try {
      const obj = JSON.parse(blob) as OpenCodeRawModel;
      models.push({ ...obj, providerID: obj.providerID ?? headerProvider });
    } catch {
      /* ignore malformed block */
    }
    buffer = [];
    headerProvider = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const headerMatch = trimmed.match(/^([\w.-]+)\/([\w.-]+)$/);
    if (headerMatch) {
      flush();
      headerProvider = headerMatch[1];
      continue;
    }
    if (headerProvider && (trimmed.startsWith("{") || trimmed.startsWith("}") || trimmed.includes(":"))) {
      buffer.push(line);
    }
  }
  flush();
  return models;
}

function flattenFromShape(shape: OpenCodeListShape): ProviderModel[] {
  const models: ProviderModel[] = [];
  if (Array.isArray(shape.models)) {
    for (const m of shape.models) models.push(normalizeModel(m, m.provider ?? "unknown"));
  }
  if (Array.isArray(shape.providers)) {
    for (const p of shape.providers) {
      const pid = p.id ?? p.name ?? "unknown";
      for (const m of p.models ?? []) models.push(normalizeModel({ ...m, provider: m.provider ?? pid }, pid));
    }
  }
  return models;
}

let cachedStatus: ProviderStatus | null = null;

export async function detectProviderStatus(force = false): Promise<ProviderStatus> {
  if (cachedStatus && !force) return cachedStatus;

  const resolved = resolveOpenCode();
  if (!resolved) {
    cachedStatus = {
      state: "not_installed",
      version: null,
      executablePath: null,
      resolvedCommand: null,
      probeMs: null,
      error: "OpenCode CLI not found on PATH. Install with: npm i -g opencode-ai",
      checkedAt: new Date().toISOString(),
    };
    return cachedStatus;
  }

  const start = Date.now();
  const out = await runOpenCode(["--version"], 15_000);
  const probeMs = Date.now() - start;

  if (out == null) {
    cachedStatus = {
      state: "not_installed",
      version: null,
      executablePath: resolved.command,
      resolvedCommand: `${resolved.command} ${resolved.prefixArgs.join(" ")}`.trim(),
      probeMs,
      error: "OpenCode CLI present but `--version` produced no output.",
      checkedAt: new Date().toISOString(),
    };
    return cachedStatus;
  }

  const version = out.trim().split(/\r?\n/).filter(Boolean).pop() ?? null;
  cachedStatus = {
    state: "installed",
    version,
    executablePath: resolved.command,
    resolvedCommand: `${resolved.command} ${resolved.prefixArgs.join(" ")}`.trim(),
    probeMs,
    error: null,
    checkedAt: new Date().toISOString(),
  };
  return cachedStatus;
}

function readConfiguredProviders(): Set<string> {
  const candidates = [
    join(homedir(), ".local", "share", "opencode", "auth.json"),
    join(homedir(), ".config", "opencode", "auth.json"),
  ];
  const found = new Set<string>();
  for (const p of candidates) {
    if (!fileExists(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, "utf8"));
      const add = (v: unknown) => {
        if (typeof v === "string" && v) found.add(v);
      };
      if (Array.isArray(data)) data.forEach((e) => add(e?.provider ?? e?.providerID));
      else if (data && typeof data === "object") {
        for (const key of Object.keys(data)) {
          if (Array.isArray(data[key])) data[key].forEach(add);
          else if (data[key] && typeof data[key] === "object") add(key);
          else add(key);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return found;
}

export interface ModelsDevRegistryProvider {
  id: string;
  name: string;
  modelCount: number;
  freeModelCount: number;
}

export interface ModelsDevRegistry {
  providers: ModelsDevRegistryProvider[];
  path: string | null;
}

interface RegistryProviderEntry {
  id?: string;
  name?: string;
  models?: Record<
    string,
    { id?: string; cost?: { input?: number | null; output?: number | null } }
  >;
}

function registryFreeCount(models: Record<string, { id?: string; cost?: unknown }>): number {
  let free = 0;
  for (const [key, m] of Object.entries(models)) {
    const cost = m.cost as { input?: number | null; output?: number | null } | undefined;
    const zeroCost = cost && (cost.input ?? 0) === 0 && (cost.output ?? 0) === 0;
    if (key.endsWith(":free") || zeroCost) free += 1;
  }
  return free;
}

function parseModelsDevRegistry(json: string): ModelsDevRegistryProvider[] {
  const parsed = JSON.parse(json) as Record<string, RegistryProviderEntry>;
  const providers: ModelsDevRegistryProvider[] = [];
  for (const [id, entry] of Object.entries(parsed)) {
    if (!entry || typeof entry !== "object") continue;
    const models = entry.models ?? {};
    const modelCount = Object.keys(models).length;
    if (modelCount === 0) continue;
    providers.push({
      id: entry.id ?? id,
      name: entry.name ?? id,
      modelCount,
      freeModelCount: registryFreeCount(models),
    });
  }
  return providers;
}

const REGISTRY_CACHE_TTL_MS = 60_000;
let registryCache: { at: number; value: ModelsDevRegistry } | null = null;

/**
 * Read the OpenCode-supported provider registry.
 *
 * OpenCode refreshes the models.dev catalog into a local JSON cache (via
 * `opencode models --refresh`). This file is the runtime-supported source of
 * available providers — including providers the user has NOT connected yet.
 * The CLI's own `opencode models --verbose` only lists providers with live
 * credentials, which is exactly why unconnected providers are otherwise
 * invisible.
 */
export function readModelsDevRegistry(force = false): ModelsDevRegistry {
  if (registryCache && !force && Date.now() - registryCache.at < REGISTRY_CACHE_TTL_MS) {
    return registryCache.value;
  }
  const candidates = [
    join(homedir(), ".cache", "opencode", "models.json"),
    join(homedir(), ".config", "opencode", "models.json"),
    join(homedir(), ".local", "share", "opencode", "models.json"),
  ];
  let providers: ModelsDevRegistryProvider[] = [];
  let path: string | null = null;
  for (const candidate of candidates) {
    if (!fileExists(candidate)) continue;
    try {
      providers = parseModelsDevRegistry(readFileSync(candidate, "utf8"));
      if (providers.length > 0) {
        path = candidate;
        break;
      }
    } catch {
      providers = [];
      continue;
    }
  }
  const value: ModelsDevRegistry = { providers, path };
  registryCache = { at: Date.now(), value };
  return value;
}

export async function fetchModelsFromOpenCode(): Promise<ModelsResponse> {
  const warnings: string[] = [];
  let source: ModelsResponse["source"] = "opencode";

  const status = await detectProviderStatus();
  if (status.state !== "installed") {
    return {
      providers: [],
      models: [],
      fetchedAt: new Date().toISOString(),
      source: "fallback",
      warnings: [status.error ?? "OpenCode CLI not installed."],
    };
  }

  const raw = await runOpenCode(["models", "--verbose"], 30_000);
  if (raw == null) {
    return {
      providers: [],
      models: [],
      fetchedAt: new Date().toISOString(),
      source: "fallback",
      warnings: ["OpenCode CLI returned no models output."],
    };
  }

  const models = parseModelsVerbose(raw).map((m) =>
    normalizeModel(m, String((m as Record<string, unknown>).providerID ?? "unknown")),
  );

  if (models.length === 0) {
    const shape = parseJson(raw);
    if (shape) {
      const fromShape = flattenFromShape(shape);
      models.push(...fromShape);
    }
    if (models.length === 0) {
      warnings.push("OpenCode returned no discoverable models.");
      source = "fallback";
    }
  }

  return {
    providers: groupByProvider(models),
    models,
    fetchedAt: new Date().toISOString(),
    source,
    warnings,
  };
}

export async function fetchProviders(): Promise<ProviderSummary[]> {
  const { models } = await fetchModelsFromOpenCode();
  const configured = readConfiguredProviders();
  const registry = readModelsDevRegistry();
  const registryById = new Map(registry.providers.map((p) => [p.id, p]));

  const byProvider = new Map<string, ProviderModel[]>();
  for (const m of models) {
    if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
    byProvider.get(m.provider)!.push(m);
  }

  const summaries: ProviderSummary[] = [];
  for (const [id, mods] of byProvider) {
    const hasCredentials = configured.has(id) || configured.has(`${id}/`);
    const freeCount = mods.filter((m) => m.pricing.free).length;
    let connection: ProviderSummary["connection"];
    if (id === "opencode" || freeCount > 0) connection = "connected";
    else if (hasCredentials) connection = "connected";
    else connection = "configured";

    summaries.push({
      id,
      name: registryById.get(id)?.name ?? id,
      connection,
      modelCount: mods.length,
      freeModelCount: freeCount,
      hasCredentials,
      requiresAuth: !hasCredentials && freeCount === 0 && id !== "opencode",
      source: "runtime",
    });
  }

  // Providers present in the OpenCode-supported registry but not yet connected.
  const runtimeIds = new Set(byProvider.keys());
  for (const reg of registry.providers) {
    if (runtimeIds.has(reg.id)) continue;
    const hasCredentials = configured.has(reg.id) || configured.has(`${reg.id}/`);
    summaries.push({
      id: reg.id,
      name: reg.name,
      connection: hasCredentials ? "configured" : "available",
      modelCount: reg.modelCount,
      freeModelCount: reg.freeModelCount,
      hasCredentials,
      requiresAuth: !hasCredentials,
      source: "registry",
    });
  }

  const connectionRank: Record<ProviderSummary["connection"], number> = {
    connected: 0,
    configured: 1,
    available: 2,
    unavailable: 3,
  };
  // Presentation-only ordering. IDs are taken verbatim from the runtime /
  // models.dev registry and are used strictly to rank rows in the UI — a
  // provider listed here that is not present in the catalog simply never
  // appears. The source of truth for availability stays the registry/runtime.
  const PROVIDER_PRIORITY = [
    "opencode",
    "openai",
    "anthropic",
    "google",
    "google-vertex",
    "openrouter",
  ];
  const priorityOf = (id: string) => {
    const rank = PROVIDER_PRIORITY.indexOf(id);
    return rank === -1 ? PROVIDER_PRIORITY.length : rank;
  };
  return summaries.sort(
    (a, b) =>
      (connectionRank[a.connection] - connectionRank[b.connection]) ||
      (priorityOf(a.id) - priorityOf(b.id)) ||
      a.name.localeCompare(b.name)
  );
}

export async function checkHealth(): Promise<HealthStatus> {
  const status = await detectProviderStatus(true);
  const notes: string[] = [];
  if (status.state !== "installed") {
    return {
      state: "down",
      cliReachable: false,
      version: null,
      probeMs: status.probeMs,
      checkedAt: new Date().toISOString(),
      notes: [status.error ?? "OpenCode CLI not reachable."],
    };
  }

  const models = await fetchModelsFromOpenCode();
  const degraded = models.source === "fallback";
  if (degraded) notes.push("Model discovery degraded.");
  if (models.models.length === 0) notes.push("No models discovered.");
  notes.push(`Discovered ${models.models.length} models across ${models.providers.length} providers.`);

  return {
    state: degraded ? "degraded" : "healthy",
    cliReachable: true,
    version: status.version,
    probeMs: status.probeMs,
    checkedAt: new Date().toISOString(),
    notes,
  };
}

export async function runChat(opts: {
  model: RuntimeModel;
  message: string;
  sessionId?: string | null;
  files?: string[];
}): Promise<ChatResult> {
  const modelId = assertCanonicalModelId(opts.model.id);
  const args = ["run", opts.message, "--model", modelId, "--format", "json"];
  if (opts.sessionId) args.push("--session", opts.sessionId);
  for (const f of opts.files ?? []) args.push("--file", f);

  const resolved = resolveOpenCode();
  if (!resolved) {
    throw new Error("OpenCode CLI not found. Install with: npm i -g opencode-ai");
  }

  const tmpDir = tmpdir();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const outPath = join(tmpDir, `oc-chat-${stamp}.out`);
  const errPath = join(tmpDir, `oc-chat-${stamp}.err`);
  const outFd = openSync(outPath, "w");
  const errFd = openSync(errPath, "w");

  return new Promise<ChatResult>((resolve, reject) => {
    let settled = false;
    let child: ReturnType<typeof spawn> | null = null;

    const readOut = () => {
      try {
        return readFileSync(outPath, "utf8");
      } catch {
        return "";
      }
    };

    try {
      child = spawn(resolved.command, [...resolved.prefixArgs, ...args], {
        stdio: ["ignore", outFd, errFd],
        windowsHide: true,
        shell: false,
        detached: false,
        env: { ...process.env, OPENCODE_NO_TUI: "1", CI: "1", NO_COLOR: "1" },
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Failed to spawn OpenCode."));
      return;
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child?.kill("SIGKILL");
      reject(new Error("Chat request timed out after 60s."));
    }, 60_000);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = readOut();
      if (code && code !== 0 && stdout.trim().length === 0) {
        let stderr = "";
        try {
          stderr = readFileSync(errPath, "utf8").trim();
        } catch {
          /* ignore */
        }
        reject(new Error(stderr || `OpenCode exited with code ${code}.`));
        return;
      }
      resolve(parseChatOutput(stdout));
    });
  });
}

function parseChatOutput(stdout: string): ChatResult {
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const events: OpenCodeChatEvent[] = [];
  let text = "";
  let sessionId: string | null = null;
  const tokens = { total: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cost: 0 };

  for (const line of lines) {
    let evt: OpenCodeChatEvent;
    try {
      evt = JSON.parse(line) as OpenCodeChatEvent;
    } catch {
      continue;
    }
    events.push(evt);
    if (!sessionId && typeof evt.sessionID === "string") sessionId = evt.sessionID;
    const part = evt.part as Record<string, unknown> | undefined;
    const evtText =
      typeof evt.text === "string"
        ? evt.text
        : (typeof part?.text === "string" ? part.text : "");
    if (evtText) text += evtText;
    const tok = (evt.tokens ?? part?.tokens) as
      | (Record<string, number> & { cache?: Record<string, number>; cost?: number })
      | undefined;
if ((evt.type === "step-finish" || evt.type === "step_finish") && tok) {
      tokens.total = tok.total ?? tokens.total;
      tokens.input = tok.input ?? tokens.input;
      tokens.output = tok.output ?? tokens.output;
      tokens.reasoning = tok.reasoning ?? tokens.reasoning;
      tokens.cacheRead = tok.cache?.read ?? tokens.cacheRead;
      tokens.cost = tok.cost ?? tokens.cost ?? 0;
    }
  }

  return { text: text.trim(), sessionId, tokens, events };
}