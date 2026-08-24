import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  checkHealth,
  detectProviderStatus,
  fetchModelsFromOpenCode,
} from "./client";
import type { HealthStatus, ProviderModel } from "./types";
import type { RuntimeExecutionTrace } from "../../features/runtime/contract";

/**
 * Runtime lifecycle (observable by the UI):
 *
 *   stopped -> starting -> healthy -> loading_models -> ready -> busy
 *                                                             |       \
 *                                                             |        -> stopping -> stopped
 *                                                             v
 *                                                           error
 *
 * The RuntimeManager owns the startup sequence for a single-process
 * "zero-configuration" Alpha Workspace. It is process-lifetime scoped and is
 * started automatically by the API server on boot; the UI never has to start
 * more than `npm run dev`.
 */

export type RuntimeStage =
  | "idle"
  | "starting"
  | "checking_cli"
  | "loading_workspace"
  | "loading_models"
  | "chat"
  | "ready"
  | "stopping"
  | "stopped"
  | "error";

export type RuntimeLifecycle =
  | "stopped"
  | "starting"
  | "healthy"
  | "loading_models"
  | "ready"
  | "busy"
  | "stopping"
  | "error";

export type RuntimeLogLevel = "info" | "warn" | "error";

export interface RuntimeLog {
  id: string;
  ts: string;
  stage: RuntimeStage;
  level: RuntimeLogLevel;
  message: string;
}

export interface CliInfo {
  installed: boolean;
  version: string | null;
  executablePath: string | null;
  resolvedCommand: string | null;
  probeMs: number | null;
}

export interface WorkspaceInfo {
  path: string;
  name: string;
  isGit: boolean;
  gitBranch: string | null;
  packageManager: string | null;
  packageManagerVersion: string | null;
  hasPackageJson: boolean;
  projectName: string | null;
}

export interface RuntimeModelsInfo {
  total: number;
  free: number;
  providers: number;
  source: string;
  loadedAt: string | null;
  defaultModel: string | null;
  warnings: string[];
}

export interface RuntimeSnapshot {
  lifecycle: RuntimeLifecycle;
  stage: RuntimeStage;
  api: { up: boolean; port: number; pid: number | null };
  cli: CliInfo;
  health: HealthStatus;
  workspace: WorkspaceInfo | null;
  models: RuntimeModelsInfo;
  error: string | null;
  logs: RuntimeLog[];
  updatedAt: string;
}

let logSeq = 0;
function logId(): string {
  logSeq += 1;
  return `rt-${Date.now()}-${logSeq}`;
}

const RACE_MS = {
  cli: 12_000,
  models: 35_000,
  health: 8_000,
};

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function detectWorkspace(cwd = process.cwd()): WorkspaceInfo {
  let gitBranch: string | null = null;
  let isGit = false;
  const gitDir = join(cwd, ".git");
  if (existsSync(gitDir)) {
    isGit = true;
    try {
      const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
      const m = head.match(/ref:\s*refs\/heads\/(.+)/);
      gitBranch = m ? m[1] : head.slice(0, 7);
    } catch {
      gitBranch = null;
    }
  }

  let packageManager: string | null = null;
  let packageManagerVersion: string | null = null;
  for (const [lock, pm] of [
    ["pnpm-lock.yaml", "pnpm"],
    ["bun.lockb", "bun"],
    ["bun.lock", "bun"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
  ] as const) {
    if (existsSync(join(cwd, lock))) {
      packageManager = pm;
      break;
    }
  }

  let projectName: string | null = null;
  const pkgPath = join(cwd, "package.json");
  const hasPackageJson = existsSync(pkgPath);
  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { name?: string; packageManager?: string };
      projectName = pkg.name ?? null;
      if (!packageManager && typeof pkg.packageManager === "string") {
        const [name, version] = pkg.packageManager.split("@");
        packageManager = name || null;
        packageManagerVersion = version || null;
      }
    } catch {
      /* ignore malformed package.json */
    }
  }

  if (packageManager) {
    try {
      const readPmVersion = (file: string): string | null => {
        if (!existsSync(join(cwd, file))) return null;
        const m = readFileSync(join(cwd, file), "utf8").match(/"version"\s*:\s*"([^"]+)"/);
        return m ? m[1] : null;
      };
      packageManagerVersion =
        readPmVersion("node_modules/.modules.yaml") ??
        readPmVersion("node_modules/.package-lock.json") ??
        packageManagerVersion;
    } catch {
      /* ignore */
    }
  }

  return {
    path: cwd,
    name: basename(cwd) || cwd,
    isGit,
    gitBranch,
    packageManager,
    packageManagerVersion,
    hasPackageJson,
    projectName,
  };
}

export class RuntimeManager {
  private lifecycle: RuntimeLifecycle = "stopped";
  private stage: RuntimeStage = "idle";
  private logs: RuntimeLog[] = [];
  private cli: CliInfo = {
    installed: false,
    version: null,
    executablePath: null,
    resolvedCommand: null,
    probeMs: null,
  };
  private healthStatus: HealthStatus = {
    state: "unknown",
    cliReachable: false,
    version: null,
    probeMs: null,
    checkedAt: new Date().toISOString(),
    notes: [],
  };
  private workspace: WorkspaceInfo | null = null;
  private models: ProviderModel[] = [];
  private modelsSource: string = "none";
  private modelsLoadedAt: string | null = null;
  private modelWarnings: string[] = [];
  private defaultModel: string | null = null;
  private error: string | null = null;
  private updatedAt: string = new Date().toISOString();
  private busyCount = 0;
  private readonly port: number;

  constructor(port = 3001) {
    this.port = port;
  }

  private log(stage: RuntimeStage, level: RuntimeLogLevel, message: string) {
    const entry: RuntimeLog = { id: logId(), ts: new Date().toISOString(), stage, level, message };
    this.logs = [entry, ...this.logs].slice(0, 300);
    // Mirror to the terminal so `npm run dev` shows the startup sequence.
    if (process.env.NODE_ENV !== "test") {
      console.log(`[runtime:${stage}] ${level.toUpperCase()} ${message}`);
    }
  }

  private setLifecycle(lifecycle: RuntimeLifecycle) {
    this.lifecycle = lifecycle;
    this.updatedAt = new Date().toISOString();
  }

  private setStage(stage: RuntimeStage) {
    this.stage = stage;
    this.updatedAt = new Date().toISOString();
  }

  private touch() {
    this.updatedAt = new Date().toISOString();
  }

  /** Mark the runtime busy (frontend sets this while a stream is active). */
  setBusy(busy: boolean) {
    this.busyCount = Math.max(0, this.busyCount + (busy ? 1 : -1));
    if (this.lifecycle === "ready" || this.lifecycle === "busy") {
      this.setLifecycle(this.busyCount > 0 ? "busy" : "ready");
    }
  }

  /**
   * Record a runtime execution trace (TASK-AI-031). Every chat execution logs
   * the selected model, the canonical RuntimeModel, the payload, the CLI
   * command and the exit code so the contract can be verified end to end.
   */
  trace(entry: RuntimeExecutionTrace) {
    const detail = `${entry.detail}${
      entry.payload ? ` payload=${JSON.stringify(entry.payload)}` : ""
    }${
      entry.cliArgs ? ` cli=${JSON.stringify(entry.cliArgs)}` : ""
    }${entry.exitCode != null ? ` exit=${entry.exitCode}` : ""}`;
    this.log(
      "chat",
      entry.ok === false ? "error" : "info",
      `[trace:${entry.layer}] model=${entry.modelId ?? "n/a"} ${detail}`,
    );
  }

  async start(): Promise<RuntimeSnapshot> {
    this.error = null;
    this.setLifecycle("starting");
    this.setStage("starting");
    this.log("starting", "info", "Starting Alpha Workspace runtime.");

    // 1. Verify runtime process (self / API).
    this.log("starting", "info", `API server listening on port ${this.port}.`);
    this.healthStatus = { ...this.healthStatus, state: "unknown", notes: [] };

    // 2. Verify OpenCode executable + version.
    this.setStage("checking_cli");
    this.log("checking_cli", "info", "Resolving OpenCode CLI executable...");
    const status = await withTimeout(
      detectProviderStatus(true),
      RACE_MS.cli,
      null,
    );
    if (!status) {
      this.cli = {
        installed: false,
        version: null,
        executablePath: null,
        resolvedCommand: null,
        probeMs: null,
      };
      this.setLifecycle("error");
      this.setStage("error");
      this.error = "OpenCode CLI detection timed out.";
      this.log("checking_cli", "error", "OpenCode CLI detection timed out.");
      return this.snapshot();
    }
    this.cli = {
      installed: status.state === "installed",
      version: status.version,
      executablePath: status.executablePath,
      resolvedCommand: status.resolvedCommand,
      probeMs: status.probeMs,
    };

    if (!this.cli.installed) {
      this.setLifecycle("error");
      this.setStage("error");
      this.error = status.error ?? "OpenCode CLI not installed.";
      this.log("checking_cli", "error", this.error);
      this.log("checking_cli", "info", "Ensure opencode-ai is installed: npm install");
      this.healthStatus = {
        state: "down",
        cliReachable: false,
        version: null,
        probeMs: this.cli.probeMs,
        checkedAt: new Date().toISOString(),
        notes: [this.error],
      };
      return this.snapshot();
    }

    this.setLifecycle("healthy");
    this.log("checking_cli", "info", `OpenCode CLI detected (v${this.cli.version ?? "?"}).`);
    this.log("checking_cli", "info", `Resolved command: ${this.cli.resolvedCommand ?? this.cli.executablePath}`);

    // 3. Verify workspace + project.
    this.setStage("loading_workspace");
    this.log("loading_workspace", "info", "Detecting workspace, Git repository and package manager...");
    this.workspace = detectWorkspace();
    this.log(
      "loading_workspace",
      "info",
      `Workspace "${this.workspace.name}" @ ${this.workspace.path}${this.workspace.isGit ? ` (git: ${this.workspace.gitBranch ?? "unknown"})` : ""}${this.workspace.packageManager ? ` (${this.workspace.packageManager})` : ""}.`,
    );

    // 4. Discover models.
    this.setStage("loading_models");
    this.setLifecycle("loading_models");
    this.log("loading_models", "info", "Discovering models from OpenCode...");
    const discovery = await withTimeout(
      fetchModelsFromOpenCode(),
      RACE_MS.models,
      null,
    );
    if (discovery) {
      this.models = discovery.models;
      this.modelsSource = discovery.source;
      this.modelWarnings = discovery.warnings;
      this.modelsLoadedAt = new Date().toISOString();
      const free = this.models.filter((m) => m.pricing.free);
      this.defaultModel = free[0]?.id ?? this.models[0]?.id ?? null;
      this.log(
        "loading_models",
        "info",
        `Discovered ${this.models.length} models across ${new Set(this.models.map((m) => m.provider)).size} providers (${free.length} free).`,
      );
      if (this.models.length === 0) {
        this.log("loading_models", "warn", "No models discoverable. Chat may be unavailable.");
      }
      if (this.defaultModel) {
        this.log("loading_models", "info", `Default model selected: ${this.defaultModel}`);
      }
    } else {
      this.models = [];
      this.modelsSource = "fallback";
      this.modelWarnings = ["Model discovery timed out."];
      this.log("loading_models", "error", "Model discovery timed out.");
    }

    this.healthStatus = {
      state: this.models.length > 0 ? "healthy" : "degraded",
      cliReachable: true,
      version: this.cli.version,
      probeMs: this.cli.probeMs,
      checkedAt: new Date().toISOString(),
      notes: [...this.modelWarnings, `Discovered ${this.models.length} models.`],
    };

    this.setStage("ready");
    this.setLifecycle("ready");
    this.log("ready", "info", "Alpha Workspace runtime ready.");
    this.touch();
    return this.snapshot();
  }

  async restart(): Promise<RuntimeSnapshot> {
    this.setLifecycle("stopping");
    this.setStage("starting");
    this.log("starting", "info", "Restarting runtime...");
    return this.start();
  }

  async stop(): Promise<RuntimeSnapshot> {
    this.setLifecycle("stopping");
    this.log("stopping", "info", "Stopping runtime...");
    this.setLifecycle("stopped");
    this.setStage("idle");
    this.log("stopped", "info", "Runtime stopped.");
    this.touch();
    return this.snapshot();
  }

  async refreshModels(): Promise<RuntimeModelsInfo> {
    this.setStage("loading_models");
    this.setLifecycle("loading_models");
    this.log("loading_models", "info", "Refreshing models...");
    const discovery = await withTimeout(fetchModelsFromOpenCode(), RACE_MS.models, null);
    if (discovery) {
      this.models = discovery.models;
      this.modelsSource = discovery.source;
      this.modelWarnings = discovery.warnings;
      this.modelsLoadedAt = new Date().toISOString();
      const free = this.models.filter((m) => m.pricing.free);
      this.defaultModel = free[0]?.id ?? this.models[0]?.id ?? this.defaultModel;
      this.log("loading_models", "info", `Refreshed ${this.models.length} models (${free.length} free).`);
    }
    if (this.lifecycle === "loading_models") {
      this.setStage("ready");
      this.setLifecycle("ready");
    }
    return this.modelsInfo();
  }

  /** Fast health read used by the poll/ping path â€” never spawns a CLI process. */
  health(): HealthStatus {
    return {
      state: this.lifecycle === "error" ? "down" : this.healthStatus.state,
      cliReachable: this.cli.installed,
      version: this.cli.version,
      probeMs: this.cli.probeMs,
      checkedAt: this.updatedAt,
      notes: [...this.healthStatus.notes],
    };
  }

  async fullHealth(): Promise<HealthStatus> {
    return withTimeout(checkHealth(), RACE_MS.health, this.health());
  }

  getModels(): ProviderModel[] {
    return this.models;
  }

  snapshot(): RuntimeSnapshot {
    return {
      lifecycle: this.lifecycle,
      stage: this.stage,
      api: { up: true, port: this.port, pid: process.pid },
      cli: { ...this.cli },
      health: this.health(),
      workspace: this.workspace ? { ...this.workspace } : null,
      models: this.modelsInfo(),
      error: this.error,
      logs: [...this.logs],
      updatedAt: this.updatedAt,
    };
  }

  private modelsInfo(): RuntimeModelsInfo {
    return {
      total: this.models.length,
      free: this.models.filter((m) => m.pricing.free).length,
      providers: new Set(this.models.map((m) => m.provider)).size,
      source: this.modelsSource,
      loadedAt: this.modelsLoadedAt,
      defaultModel: this.defaultModel,
      warnings: [...this.modelWarnings],
    };
  }
}
