import 'dotenv/config'
import express, { type Request, type Response } from "express";
import cors from "cors";
import {
  resolveOpenCode,
  detectProviderStatus,
  fetchProviders,
  runChat,
} from "./client";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { RuntimeManager, detectWorkspace } from "./runtime";
import { openCodeRuntimeProvider, toRuntimeModelAdapter } from "./runtime-model";
import {
  assertCanonicalModelId,
  runtimeModelFromCanonicalId,
  type RuntimeModel,
} from "../../features/runtime/contract";
import {
  isReferenceAttachment,
  type ReferenceAttachment,
} from "../../features/ai/references/contract";
import { resolveReferences, uniqueResolvedPaths } from "../references/resolver";
import {
  listProviderStates,
  setProviderKey,
  removeProviderKey,
  setProviderEnabled,
  validateProviderKey,
} from "./providers-config";
import { createGoogleOAuthRouter } from "../google/oauth-router";
import { createGoogleDriveRouter } from "../google/drive-router";
import { openCodeAuthLogin, openCodeAuthLogout } from "./auth";
import { readOpenCodeConfig, patchOpenCodeConfig } from "./opencode-config";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Google Workspace OAuth & Drive
app.use("/api/google/oauth", createGoogleOAuthRouter());
app.use("/api/google/drive", createGoogleDriveRouter());

const runtimeManager = new RuntimeManager(Number(process.env.PORT) || 3001);

interface ChatRequestBody {
  model?: string;
  message?: string;
  sessionId?: string | null;
  files?: string[];
  references?: unknown[];
}

/**
 * Runtime Contract (TASK-AI-031): resolve the incoming canonical model id to a
 * RuntimeModel. The id is validated as `provider/id` — a display name or slug
 * can never reach the CLI. The id itself is never reconstructed.
 */
function resolveModel(model: string): RuntimeModel {
  const canonical = assertCanonicalModelId(model);
  const pm = runtimeManager.getModels().find((m) => m.id === canonical);
  return pm ? toRuntimeModelAdapter(pm) : runtimeModelFromCanonicalId(canonical);
}

function trace(
  layer: string,
  modelId: string | null,
  detail: string,
  extra: {
    payload?: Record<string, unknown>;
    cliArgs?: string[];
    exitCode?: number | null;
    ok?: boolean;
  } = {},
) {
  runtimeManager.trace({
    layer,
    ts: new Date().toISOString(),
    modelId,
    detail,
    ...extra,
  });
}

/**
 * Resolve the request's references to `--file` paths.
 * Returns `null` and sends a structured 400 response when any reference fails.
 */
async function resolveRequestReferences(
  req: Request,
  res: Response
): Promise<string[] | null> {
  const body = req.body as ChatRequestBody;
  const references: ReferenceAttachment[] = Array.isArray(body.references)
    ? body.references.filter(isReferenceAttachment)
    : [];

  const { resolved, errors } = await resolveReferences(references, {
    allowedRoots: [process.cwd()],
    userId: "local-user",
  });

  if (errors.length > 0) {
    res.status(400).json({
      error: "One or more attached references could not be resolved.",
      referenceErrors: errors,
    });
    return null;
  }

  return uniqueResolvedPaths(resolved);
}

// ---------------------------------------------------------------------------
// SSE chat endpoint
// ---------------------------------------------------------------------------
app.post("/api/opencode/chat/stream", async (req: Request, res: Response) => {
  const body: ChatRequestBody = req.body;
  const message = body.message?.trim();

  if (!body.model || !message) {
    return res.status(400).json({ error: "Both `model` and `message` are required." });
  }

  let model: RuntimeModel;
  try {
    model = resolveModel(body.model);
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : "Model must be in the form `provider/id`.",
    });
  }
  trace("payload", model.id, "chat stream request", {
    payload: {
      model: model.id,
      message,
      sessionId: body.sessionId ?? null,
      references: (Array.isArray(body.references) ? body.references : [])
        .filter(isReferenceAttachment)
        .map((r) => ({
          provider: r.provider,
          name: r.name,
          hasFileId: Boolean(r.fileId),
          hasPath: Boolean(r.path),
        })),
    },
  });

  // TASK-AIASSISTANT-005: references are resolved server-side on demand.
  const files = await resolveRequestReferences(req, res);
  if (files === null) return;

  const resolved = resolveOpenCode();
  if (!resolved) {
    return res.status(502).json({ error: "OpenCode CLI not found. Install with: npm i -g opencode-ai" });
  }

  const args = ["run", message, "--model", model.id, "--format", "json"];
  if (body.sessionId) args.push("--session", body.sessionId);
  for (const f of files) args.push("--file", f);
  trace("cli", model.id, "OpenCode CLI args", { cliArgs: args });

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const cleanup = () => {
    if (child && !child.killed) {
      child.kill("SIGTERM");
      setTimeout(() => child?.kill("SIGKILL"), 1000);
    }
  };

  let child: ReturnType<typeof spawn> | null = null;
  let settled = false;

  runtimeManager.setBusy(true);
  res.on("close", () => runtimeManager.setBusy(false));

  try {
    child = spawn(resolved.command, [...resolved.prefixArgs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
      detached: false,
      env: { ...process.env, OPENCODE_NO_TUI: "1", CI: "1", NO_COLOR: "1" },
    });
    if (process.env.NODE_ENV !== "test") console.log('[API] PROCESS SPAWNED', { pid: child.pid });
  } catch (err) {
    runtimeManager.setBusy(false);
    sendEvent("error", { message: err instanceof Error ? err.message : "Failed to spawn OpenCode" });
    res.end();
    return;
  }

  let stdout = "";
  let tokenCount = 0;
  let textExtracted = "";
  let extractedSessionId: string | null = null;
  const processStart = Date.now();
  let firstTextAt: number | null = null;
  let stepFinishAt: number | null = null;
  const timeout = setTimeout(() => {
    if (settled) return;
    settled = true;
    cleanup();
    if (process.env.NODE_ENV !== "test") console.log("[API] TIMEOUT", { pid: child?.pid });
    sendEvent("error", { message: "Request timed out after 60s" });
    res.end();
  }, 60_000);

  child.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    stdout += text;
    if (process.env.NODE_ENV !== "test") console.log("[API] STDOUT CHUNK", { pid: child?.pid, bytes: chunk.length, preview: text.slice(0, 300) });

    const lines = text.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      if (process.env.NODE_ENV !== "test") console.log("[API] RAW LINE", { pid: child?.pid, line: line.slice(0, 500) });
      let evt: Record<string, unknown>;
      try {
        evt = JSON.parse(line) as Record<string, unknown>;
      } catch (parseErr) {
        if (process.env.NODE_ENV !== "test") console.log("[API] PARSE ERROR", { pid: child?.pid, error: String(parseErr), line: line.slice(0, 200) });
        continue;
      }

      const evtType = String(evt.type ?? "");
      const part = evt.part as Record<string, unknown> | undefined;
      const partText = typeof part?.text === "string" ? part.text : "";
      const topText = typeof evt.text === "string" ? evt.text : "";
      const extracted = topText || partText;

      // TASK-AI-033: Extract real session ID from CLI output events.
      const evtSessionId = typeof evt.sessionID === "string" ? evt.sessionID : null;
      if (evtSessionId && !extractedSessionId) {
        extractedSessionId = evtSessionId;
        if (process.env.NODE_ENV !== "test") {
          console.log("[API] SESSION EXTRACTED", { pid: child?.pid, sessionId: evtSessionId });
        }
        sendEvent("session", { sessionId: evtSessionId });
      }

      tokenCount++;
      if (extracted) {
        textExtracted += extracted;
        if (firstTextAt === null) firstTextAt = Date.now();
      }

      if (process.env.NODE_ENV !== "test") {
        console.log("[API] PARSED EVENT", {
          pid: child?.pid,
          eventType: evtType,
          hasPartText: !!partText,
          hasTopText: !!topText,
          extractedText: extracted.slice(0, 100),
          tokenCount,
          textExtractedLength: textExtracted.length,
          latencyMs: Date.now() - processStart,
        });
      }

      // TASK-AI-034: Prevent duplicate step_finish events.
      // step_finish is its own canonical SSE event — do not also wrap it as a
      // "token" event. The frontend only uses the "step_finish" event.
      if (evtType === "step-finish" || evtType === "step_finish") {
        stepFinishAt = Date.now();
        sendEvent("step_finish", evt);
        if (process.env.NODE_ENV !== "test") {
          console.log("[API] STEP_FINISH", {
            pid: child?.pid,
            latencyMs: stepFinishAt - processStart,
            firstTextLatencyMs: firstTextAt ? stepFinishAt - firstTextAt : null,
          });
        }
      } else {
        sendEvent("token", evt);
      }
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    if (process.env.NODE_ENV !== "test") console.log("[API] STDERR", { pid: child?.pid, data: text.slice(0, 500) });
    // TASK-AI-034: Suppress the known non-actionable NO_COLOR / FORCE_COLOR warning.
    // This is a diagnostic warning from chalk/colorette, not an AI response error.
    // The env vars are intentionally set to control TUI behavior.
    if (/NO_COLOR.*FORCE_COLOR|FORCE_COLOR.*NO_COLOR/.test(text)) return;
    sendEvent("stderr", { data: text });
  });

  child.on("error", (err) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    runtimeManager.setBusy(false);
    if (process.env.NODE_ENV !== "test") console.log("[API] PROCESS ERROR", { pid: child?.pid, error: err.message });
    sendEvent("error", { message: err.message });
    res.end();
  });

  // TASK-AI-032: Instrument BOTH exit and close to document lifecycle differences.
  // exit fires when the process actually exits (code + signal available).
  // close fires when stdio streams are closed (may differ from exit on Windows).
  let exitEventReceived = false;
  let exitCode: number | null = null;
  let exitSignal: string | null = null;

  child.on("exit", (code, signal) => {
    exitEventReceived = true;
    exitCode = code;
    exitSignal = signal;
    if (process.env.NODE_ENV !== "test") {
      console.log("[API] PROCESS EXIT", {
        pid: child?.pid,
        code: code ?? 0,
        signal: signal ?? null,
        stdoutLength: stdout.length,
        textExtractedLength: textExtracted.length,
      });
    }
  });

  child.on("close", (code, signal) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    runtimeManager.setBusy(false);
    const finalCode = exitCode ?? code;
    const finalSignal = exitSignal ?? signal;
    trace("exit", model.id, "OpenCode process exited", { exitCode: finalCode ?? 0, ok: finalCode === 0 });
    if (process.env.NODE_ENV !== "test") {
      console.log("[API] PROCESS CLOSE", {
        pid: child?.pid,
        code: finalCode ?? 0,
        signal: finalSignal ?? null,
        stdoutLength: stdout.length,
        tokenCount,
        textExtractedLength: textExtracted.length,
        textExtractedPreview: textExtracted.slice(0, 200),
        exitEventReceived,
        extractedSessionId,
        totalLatencyMs: Date.now() - processStart,
        firstTextLatencyMs: firstTextAt ? firstTextAt - processStart : null,
        stepFinishLatencyMs: stepFinishAt ? stepFinishAt - processStart : null,
        decision: finalCode === 0 && textExtracted.length > 0
          ? "SUCCESS"
          : finalCode === 0 && textExtracted.length === 0
            ? "EMPTY_RESPONSE"
            : `EXIT_CODE_${finalCode}`,
      });
    }
    sendEvent("exit", { code: finalCode ?? 0 });
    res.end();
  });

  req.on("close", () => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    runtimeManager.setBusy(false);
    cleanup();
    sendEvent("cancelled", {});
    res.end();
  });
});

// Non-streaming chat endpoint (for compatibility)
app.post("/api/opencode/chat", async (req: Request, res: Response) => {
  const body: ChatRequestBody = req.body;
  const message = body.message?.trim();

  if (!body.model || !message) {
    return res.status(400).json({ error: "Both `model` and `message` are required." });
  }

  let model: RuntimeModel;
  try {
    model = resolveModel(body.model);
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : "Model must be in the form `provider/id`.",
    });
  }
  trace("payload", model.id, "chat request", {
    payload: {
      model: model.id,
      message,
      sessionId: body.sessionId ?? null,
      references: (Array.isArray(body.references) ? body.references : [])
        .filter(isReferenceAttachment)
        .map((r) => ({ provider: r.provider, name: r.name })),
    },
  });

  // TASK-AIASSISTANT-005: references are resolved server-side on demand.
  const files = await resolveRequestReferences(req, res);
  if (files === null) return;

  try {
    const result = await runChat({ model, message, sessionId: body.sessionId, files });
    trace("result", model.id, "chat completed", { ok: true });
    return res.json(result);
  } catch (err) {
    const message2 = err instanceof Error ? err.message : "Chat request failed.";
    trace("result", model.id, "chat failed", { ok: false });
    return res.status(502).json({ error: message2 });
  }
});

// ---------------------------------------------------------------------------
// Health / status — must never hang. Fast cached path, never spawns a CLI probe.
// ---------------------------------------------------------------------------
app.get("/api/opencode/health", async (_req: Request, res: Response) => {
  const health = runtimeManager.health();
  return res.json({ ...health, workspace: runtimeManager.snapshot().workspace });
});

app.get("/api/opencode/status", async (_req: Request, res: Response) => {
  const status = await detectProviderStatus(true);
  return res.json(status);
});

// ---------------------------------------------------------------------------
// Models — sorted free-first, supports freeOnly + degraded source reporting.
// ---------------------------------------------------------------------------
app.get("/api/opencode/models", async (req: Request, res: Response) => {
  const freeOnly = req.query.freeOnly === "true" || req.query.freeOnly === "1";
  const models = await openCodeRuntimeProvider.discoverModels();
  const sorted = [...models].sort((a, b) => {
    if (a.free !== b.free) return a.free ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });
  const filtered = freeOnly ? sorted.filter((m) => m.free) : sorted;
  return res.json({
    models: filtered,
    providers: [...new Set(filtered.map((m) => m.provider))],
    fetchedAt: new Date().toISOString(),
    source: "opencode",
    warnings: [],
  });
});

app.get("/api/opencode/providers", async (_req: Request, res: Response) => {
  try {
    const providers = await fetchProviders();
    return res.json({ providers, fetchedAt: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ providers: [], error: err instanceof Error ? err.message : "Failed to load providers" });
  }
});

// ---------------------------------------------------------------------------
// Provider auth — reuse OpenCode's own credential mechanism.
// ---------------------------------------------------------------------------
app.post("/api/opencode/auth/login", async (req: Request, res: Response) => {
  const providerId = typeof req.body?.provider === "string" ? req.body.provider.trim() : "";
  if (!providerId) return res.status(400).json({ error: "provider is required" });
  const result = await openCodeAuthLogin(providerId);
  return res.json(result);
});

app.post("/api/opencode/auth/logout", async (req: Request, res: Response) => {
  const providerId = typeof req.body?.provider === "string" ? req.body.provider.trim() : "";
  if (!providerId) return res.status(400).json({ error: "provider is required" });
  const result = await openCodeAuthLogout(providerId);
  return res.json(result);
});

// ---------------------------------------------------------------------------
// OpenCode configuration — read/write the real opencode.json source.
// ---------------------------------------------------------------------------
app.get("/api/opencode/config", (_req: Request, res: Response) => {
  try {
    const workspace = detectWorkspace();
    const result = readOpenCodeConfig(workspace.path);
    return res.json({ ...result, cwd: workspace.path });
  } catch (err) {
    return res.status(500).json({
      error: err instanceof Error ? err.message : "Failed to read OpenCode config",
    });
  }
});

app.patch("/api/opencode/config", (req: Request, res: Response) => {
  try {
    const patch = req.body?.patch;
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
      return res.status(400).json({ error: "patch object is required" });
    }
    const workspace = detectWorkspace();
    const result = patchOpenCodeConfig(workspace.path, patch as Record<string, unknown>);
    return res.json({ ...result, cwd: workspace.path });
  } catch (err) {
    return res.status(400).json({
      error: err instanceof Error ? err.message : "Failed to update OpenCode config",
    });
  }
});

// ---------------------------------------------------------------------------
// Runtime manager endpoints
// ---------------------------------------------------------------------------
app.get("/api/runtime", (_req: Request, res: Response) => {
  return res.json(runtimeManager.snapshot());
});

app.get("/api/runtime/logs", (_req: Request, res: Response) => {
  return res.json({ logs: runtimeManager.snapshot().logs });
});

app.post("/api/runtime/start", async (_req: Request, res: Response) => {
  const snapshot = await runtimeManager.start();
  return res.json(snapshot);
});

app.post("/api/runtime/restart", async (_req: Request, res: Response) => {
  const snapshot = await runtimeManager.restart();
  return res.json(snapshot);
});

app.post("/api/runtime/stop", async (_req: Request, res: Response) => {
  const snapshot = await runtimeManager.stop();
  return res.json(snapshot);
});

app.post("/api/runtime/refresh-models", async (_req: Request, res: Response) => {
  const info = await runtimeManager.refreshModels();
  return res.json(info);
});

app.post("/api/runtime/busy", (req: Request, res: Response) => {
  const busy = Boolean(req.body?.busy);
  runtimeManager.setBusy(busy);
  return res.json({ busy });
});

// ---------------------------------------------------------------------------
// Cloud provider settings
// ---------------------------------------------------------------------------
app.get("/api/providers", (_req: Request, res: Response) => {
  return res.json({ providers: listProviderStates() });
});

app.post("/api/providers/:id/key", (req: Request, res: Response) => {
  const { id } = req.params;
  const apiKey = typeof req.body?.apiKey === "string" ? req.body.apiKey : "";
  if (!apiKey.trim()) return res.status(400).json({ error: "API key is required." });
  const ok = setProviderKey(id, apiKey);
  if (!ok) return res.status(404).json({ error: `Unknown provider: ${id}` });
  return res.json({ ok: true, providers: listProviderStates() });
});

app.delete("/api/providers/:id/key", (req: Request, res: Response) => {
  const ok = removeProviderKey(req.params.id);
  if (!ok) return res.status(404).json({ error: `Unknown provider: ${req.params.id}` });
  return res.json({ ok: true, providers: listProviderStates() });
});

app.post("/api/providers/:id/validate", async (req: Request, res: Response) => {
  const result = await validateProviderKey(req.params.id);
  return res.json({ ...result, providers: listProviderStates() });
});

app.post("/api/providers/:id/toggle", (req: Request, res: Response) => {
  const ok = setProviderEnabled(req.params.id, Boolean(req.body?.enabled));
  if (!ok) return res.status(404).json({ error: `Unknown provider: ${req.params.id}` });
  return res.json({ ok: true, providers: listProviderStates() });
});

app.get("/api/runtime/workspace", (_req: Request, res: Response) => {
  return res.json({ workspace: runtimeManager.snapshot().workspace ?? detectWorkspace() });
});

export { app, runtimeManager };

// Start server if run directly
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = process.env.PORT || 3001;
  const server = app.listen(PORT, () => {
    if (process.env.NODE_ENV !== "test") console.log(`OpenCode API server running on http://localhost:${PORT}`);
    void runtimeManager.start();
  });

  const shutdown = () => {
    void runtimeManager.stop();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
