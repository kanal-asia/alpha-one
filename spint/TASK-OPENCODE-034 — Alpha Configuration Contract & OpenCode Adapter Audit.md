# TASK-OPENCODE-034 — Alpha Configuration Contract & OpenCode Adapter Audit

## Type

Architecture Audit / Core Contract Definition

## Priority

P0 — Alpha One Core → SDK Foundation

## Status

COMPLETE — PASS WITH FINDINGS

---

# Executive Conclusion

The Alpha One / OpenCode boundary is **deeply coupled** across all four layers (transport, store, UI, config) with **no abstraction boundary**. The `StreamChunk` type is a 1:1 mapping of OpenCode SSE events. The store contains ~200 lines of OpenCode event interpretation logic. The type system propagates OpenCode-specific concepts into every layer.

However, the coupling is **localized** within `src/features/ai/opencode/` and `src/services/opencode/`. The adapter pattern exists conceptually but lacks formal boundaries.

**SDK Readiness: NOT READY** — The configuration contract and adapter boundary must be defined before SDK architecture begins. This audit provides the definition.

**Verdict: PASS WITH FINDINGS** — The boundary is understood. Small corrective work is required before SDK proceeds.

---

# 1. Sources Inspected

## OpenCode Source

| Source | URL / Path | Key Concepts |
|--------|-----------|--------------|
| OpenCode config schema | `https://opencode.ai/config.json` | 25 top-level keys, ~130+ properties |
| Installed OpenCode config | `~/.config/opencode/opencode.jsonc` | model, shell, default_agent, mcp |
| OpenCode CLI events | `server.ts` stdout parsing | step_finish, tool_use, exit, session |

## Alpha One Sources

| File | Role |
|------|------|
| `src/features/ai/opencode/types.ts` | 13 OpenCode-specific type definitions |
| `src/features/ai/opencode/services/http-transport.ts` | SSE event parsing, 15+ OpenCode references |
| `src/features/ai/opencode/store/opencode-store.ts` | 20+ OpenCode event interpretations |
| `src/features/ai/opencode/components/chat-message.tsx` | UI rendering, hardcoded "OpenCode" label |
| `src/services/opencode/server.ts` | SSE event forwarding, 8+ OpenCode references |
| `src/services/opencode/opencode-config.ts` | Config reader/writer, whitelisted keys |
| `src/services/opencode/providers-config.ts` | Provider credential store |
| `src/business/presentation/ai-engine.ts` | Business layer directly imports OpenCode client |
| `src/platform/runtime/adapters/opencode.ts` | Platform runtime adapter |
| `.env` | Google OAuth, CLIENT_URL |
| `vite.config.ts` | Frontend port, proxy target |

---

# 2. Current Alpha Configuration Architecture

## Configuration Sources

| Source | Persists To | SSOT For | Alpha or OpenCode |
|--------|------------|----------|-------------------|
| `opencode.jsonc` (filesystem) | File | Model, agent, shell, MCP | OpenCode-native |
| `alpha-workspace:opencode-settings` (localStorage) | Browser | UI preferences | Alpha-specific |
| `alpha-workspace:opencode-chats` (localStorage) | Browser | Chat history | Alpha-specific |
| `alpha-workspace:model-preferences` (localStorage) | Browser | Model favorites | Alpha-specific |
| `alpha-workspace:tool-config` (localStorage) | Browser | Tool overrides | Alpha-specific |
| `alpha-workspace:projects` (localStorage) | Browser | Projects | Alpha-specific |
| `alpha-workspace:resources` (localStorage) | Browser | Resources | Alpha-specific |
| `alpha-workspace:custom-skills` (localStorage) | Browser | Skills | Alpha-specific |
| `.env` (filesystem) | File | Google OAuth | Alpha-specific |
| `~/.alpha-workspace/providers.json` (filesystem) | File | Provider keys | Alpha-specific |
| `~/.local/share/opencode/auth.json` (filesystem) | File | OpenCode auth | OpenCode-native |
| Cookies (6) | Browser | Theme, layout, font, dev mode | Alpha-specific |

## SSOT Tension: Dual Model Persistence

The active model is stored in **THREE places simultaneously**:
1. `opencode.jsonc` on disk (OpenCode SSOT)
2. `alpha-workspace:opencode-settings` in localStorage (Alpha UI SSOT)
3. `INTENDED_DEFAULT_MODEL` hardcoded constant in `opencode-store.ts:33`

Bidirectional sync exists (`syncConfigMode()`, `patchOpenCodeConfig()`) but drift is possible.

## SSOT Tension: Two Credential Systems

Alpha maintains `~/.alpha-workspace/providers.json` AND delegates to `~/.local/share/opencode/auth.json`. They are **separate and unsynchronized**.

---

# 3. OpenCode Configuration Architecture

## Schema Statistics

- **Total top-level config keys**: 25
- **Total unique config definitions**: ~30
- **Total leaf properties**: ~130+
- **User-facing properties**: ~120+
- **Runtime-only properties**: ~10 (model metadata: cost, limit, attachment, reasoning, tool_call, modalities)

## Key OpenCode Concepts

| Concept | Type | Purpose | Alpha Equivalent |
|---------|------|---------|-----------------|
| `model` | `string` | Primary model (`provider/model`) | `defaultModel` in settings |
| `default_agent` | `string` | Default agent (`build`/`plan`) | `defaultMode` in settings |
| `agent.*.variant` | `string` | Model variant/reasoning | `defaultVariant` in settings |
| `agent.*.steps` | `integer` | Max agentic iterations | **No Alpha equivalent** |
| `agent.*.prompt` | `string` | System prompt override | **No Alpha equivalent** |
| `permission` | `PermissionConfig` | Tool permissions | **No Alpha equivalent** |
| `mcp` | `McpConfig` | MCP server definitions | **No Alpha equivalent** |
| `plugin` | `PluginConfig` | Plugin array | **No Alpha equivalent** |
| `instructions` | `string[]` | Instruction file paths | **No Alpha equivalent** |
| `tools` | `object<string, boolean>` | Tool enable/disable | Alpha Tools (separate system) |
| `provider` | `ProviderConfig` | Custom providers | Alpha Providers (separate system) |
| `experimental` | `ExperimentalConfig` | Feature flags | **No Alpha equivalent** |

---

# 4. Configuration Mapping Matrix

| OpenCode Concept | Alpha One Concept | Classification | Adapter Required | User-Facing | Decision |
|------------------|-------------------|----------------|------------------|-------------|----------|
| `model` | `defaultModel` | **A — Alpha Core** | Yes (sync) | Yes | Alpha owns the selection UI; adapter patches opencode.jsonc |
| `default_agent` | `defaultMode` | **A — Alpha Core** | Yes (sync) | Yes | Alpha owns mode selection; adapter patches opencode.jsonc |
| `agent.*.variant` | `defaultVariant` | **A — Alpha Core** | Yes (sync) | Yes | Alpha owns variant UI; adapter patches opencode.jsonc |
| `agent.*.steps` | *None* | **E — OpenCode Internal** | No | No | Steps are runtime behavior, not product config |
| `agent.*.prompt` | *None* | **E — OpenCode Internal** | No | No | System prompts are runtime-internal |
| `agent.*.temperature` | *None* | **E — OpenCode Internal** | No | No | Sampling params are runtime-internal |
| `permission` | *None* | **D — Adapter Contract** | Yes | No | Alpha does not yet expose permission UI; adapter must translate if needed |
| `mcp` | *None* | **D — Adapter Contract** | Yes | Partially | MCP servers are adapter-managed; Alpha does not expose MCP config UI |
| `plugin` | *None* | **F — Not Required** | No | No | No Alpha plugin system exists |
| `instructions` | *None* | **E — OpenCode Internal** | No | No | Instruction files are runtime-internal |
| `tools` | Alpha Tools | **C — Alpha Tool Contract** | No | Yes | Alpha has its own tool registry; OpenCode tools are runtime-internal |
| `provider` | Alpha Providers | **B — Alpha Provider Contract** | Partially | Yes | Alpha has its own provider system; adapter must reconcile |
| `experimental` | *None* | **E — OpenCode Internal** | No | No | Feature flags are runtime-internal |
| `compaction` | *None* | **E — OpenCode Internal** | No | No | Context management is runtime-internal |
| `server.port` | `PORT` env var | **D — Adapter Contract** | Yes | No | Adapter manages port allocation |
| `shell` | *None* | **E — OpenCode Internal** | No | No | Shell is runtime-internal |
| `logLevel` | *None* | **E — OpenCode Internal** | No | No | Logging is runtime-internal |
| `snapshot` | *None* | **E — OpenCode Internal** | No | No | Undo/redo is runtime-internal |
| `share` | *None* | **F — Not Required** | No | No | Session sharing is not an Alpha product feature |
| `username` | *None* | **F — Not Required** | No | No | Display name is not an Alpha product feature |
| `skills` | Alpha Skills | **C — Alpha Extension Contract** | No | Yes | Alpha has its own skill system |
| `references` | Alpha Resources | **C — Alpha Extension Contract** | No | Yes | Alpha has its own resource system |
| `command` | *None* | **F — Not Required** | No | No | Custom commands are OpenCode-specific |
| `formatter` | *None* | **E — OpenCode Internal** | No | No | Code formatting is runtime-internal |
| `lsp` | *None* | **E — OpenCode Internal** | No | No | LSP is runtime-internal |
| `attachment` | *None* | **E — OpenCode Internal** | No | No | Image processing is runtime-internal |
| `tool_output` | *None* | **E — OpenCode Internal** | No | No | Output truncation is runtime-internal |
| `watcher` | *None* | **E — OpenCode Internal** | No | No | File watching is runtime-internal |
| `enterprise` | *None* | **F — Not Required** | No | No | Enterprise config is not an Alpha product feature |

---

# 5. Alpha One Configuration Contract

## Minimum Required Alpha Configuration

Based on evidence, only **5 concepts** require Alpha One ownership:

### 5.1 Assistant Configuration

| Field | Type | Required | User-Facing | Purpose |
|-------|------|----------|-------------|---------|
| `defaultModel` | `string` | Yes | Yes | Active AI model (`provider/model`) |
| `defaultMode` | `string` | Yes | Yes | Active agent mode (`build`/`plan`) |
| `defaultVariant` | `string` | No | Yes | Active reasoning variant |
| `streaming` | `boolean` | Yes | Yes | Enable streaming responses |
| `developerMode` | `boolean` | Yes | Yes | Enable developer diagnostics |

**SSOT**: `alpha-workspace:opencode-settings` (localStorage)
**Adapter sync**: Patches `opencode.jsonc` via `patchOpenCodeConfig()`

### 5.2 Provider Configuration

| Field | Type | Required | User-Facing | Purpose |
|-------|------|----------|-------------|---------|
| `providers` | `ProviderDef[]` | Yes | Yes | Available AI providers |
| `credentials` | `Record<provider, key>` | Yes | Yes (masked) | API keys per provider |

**SSOT**: `~/.alpha-workspace/providers.json` (filesystem)
**Note**: Alpha maintains its own credential store, separate from OpenCode's auth system

### 5.3 Tool Configuration

| Field | Type | Required | User-Facing | Purpose |
|-------|------|----------|-------------|---------|
| `toolConfig` | `Record<toolId, ToolConfig>` | No | Yes | Per-tool enable/disable, executable path |

**SSOT**: `alpha-workspace:tool-config` (localStorage) overlaying `tool-registry.ts` defaults

### 5.4 Extension Configuration

| Field | Type | Required | User-Facing | Purpose |
|-------|------|----------|-------------|---------|
| `skills` | `SkillDef[]` | No | Yes | Custom AI skills |
| `resources` | `ResourceRef[]` | No | Yes | Registered resources |

**SSOT**: `alpha-workspace:custom-skills` and `alpha-workspace:resources` (localStorage)

### 5.5 Runtime Configuration

| Field | Type | Required | User-Facing | Purpose |
|-------|------|----------|-------------|---------|
| `port` | `number` | Yes | No | Backend runtime port |
| `workspacePath` | `string` | Yes | No | Runtime workspace root |

**SSOT**: `PORT` env var / `process.env.PORT`; `workspacePath` from runtime detection

---

# 6. OpenCode Adapter Boundary

## Adapter Responsibilities

The OpenCode Adapter must translate between Alpha Configuration and OpenCode Runtime:

### Configuration Translation

| Alpha Config | → | OpenCode Config | Direction |
|-------------|---|-----------------|-----------|
| `defaultModel` | → | `model` in `opencode.jsonc` | Alpha → OpenCode |
| `defaultMode` | → | `default_agent` in `opencode.jsonc` | Alpha → OpenCode |
| `defaultVariant` | → | `agent.*.variant` in `opencode.jsonc` | Alpha → OpenCode |
| Provider credentials | → | `~/.local/share/opencode/auth.json` | Alpha → OpenCode |
| MCP servers | → | `mcp` in `opencode.jsonc` | Alpha → OpenCode |

### Execution Translation

| OpenCode Event | → | Alpha State | Direction |
|---------------|---|-------------|-----------|
| `step_finish` (reason=stop) | → | `executionState: 'completed'` | OpenCode → Alpha |
| `step_finish` (reason=tool-calls) | → | `executionState: 'progress'` | OpenCode → Alpha |
| `tool_use` | → | `ToolEvent` | OpenCode → Alpha |
| `exit` (code=0) | → | `exitCode: 0` | OpenCode → Alpha |
| `error` | → | `executionState: 'error'` | OpenCode → Alpha |
| `session` | → | `chat.sessionId` | OpenCode → Alpha |

### What the Adapter Must NOT Expose

- `step_finish` raw event structure
- `reason` field values (`tool-calls`, `stop`)
- OpenCode session lifecycle states (`not_started`, `starting`, `running`, `busy`, `finished`, `stopped`, `error`)
- OpenCode agent IDs (`plan`, `build`, `general`, `explore`, `title`, `summary`, `compaction`)
- OpenCode-specific error messages (`"Session not found"`)
- OpenCode CLI flags (`--session`, `--agent`, `--variant`, `--format`)

---

# 7. Execution Lifecycle Boundary

## Current Direct Dependencies (PROVEN)

Alpha One directly depends on these OpenCode-specific concepts:

| OpenCode Concept | Location | Layer | Classification |
|-----------------|----------|-------|---------------|
| `step_finish` event | `http-transport.ts:507` | Transport | PROVEN — direct SSE event parsing |
| `reason` field | `http-transport.ts:515-516` | Transport | PROVEN — `reason === 'stop'` check |
| `tool_use` event | `http-transport.ts:472` | Transport | PROVEN — direct SSE event detection |
| `tool-calls` reason | `http-transport.ts:513` | Transport | PROVEN — comment/reference |
| `stop` reason | `http-transport.ts:516` | Transport | PROVEN — terminal detection |
| `exit` event | `http-transport.ts:549` | Transport | PROVEN — exit code extraction |
| `session` event | `http-transport.ts:580` | Transport | PROVEN — session ID extraction |
| `"Session not found"` | `opencode-store.ts:730` | Store | PROVEN — string-based error handling |
| Session ID on Chat | `types.ts:215` | Types | PROVEN — OpenCode session model |
| `OpenCodeSessionState` | `types.ts:8-15` | Types | PROVEN — OpenCode lifecycle states |
| `ToolEvent.tool` | `types.ts:152` | Types | PROVEN — OpenCode tool names |

## Recommended Abstraction Boundary

```
OpenCode SSE Events (transport layer — acceptable coupling)
        ↓
Alpha Execution Events (store layer — needs formal types)
        ↓
Alpha Execution State (UI layer — already abstracted via ExecutionState)
```

The transport layer should continue parsing OpenCode events directly (it IS the adapter). The store should interpret them into Alpha-native concepts. The UI should never see OpenCode event names.

---

# 8. Coupling Findings

## CRITICAL

| # | Finding | File | Issue |
|---|---------|------|-------|
| C1 | `StreamChunk` is 1:1 OpenCode mapping | `types.ts:46-64` | Every chunk type maps directly to an OpenCode SSE event |
| C2 | Store interprets raw OpenCode events | `opencode-store.ts:580-779` | ~200 lines of OpenCode event interpretation |
| C3 | Business layer imports OpenCode client | `ai-engine.ts:7` | `import { runChat } from '../../services/opencode/client'` |
| C4 | 13 OpenCode-specific types | `types.ts` | `OpenCodeSession`, `OpenCodeSessionState`, `OpenCodeSettings`, etc. |

## HIGH

| # | Finding | File | Issue |
|---|---------|------|-------|
| H1 | Assistant imports 8 OpenCode components | `assistant-chat-page.tsx:4-11` | Entire assistant coupled to OpenCode |
| H2 | Hardcoded "OpenCode" label in UI | `chat-message.tsx:292` | Branding leak |
| H3 | Hardcoded model ID constant | `opencode-store.ts:33` | `opencode/deepseek-v4-flash-free` |
| H4 | `"Session not found"` string coupling | `opencode-store.ts:730` | Error message string comparison |
| H5 | Runtime status bar reads OpenCode store | `runtime-status-bar.tsx:49` | Direct store import |

## MEDIUM

| # | Finding | File | Issue |
|---|---------|------|-------|
| M1 | Dual model persistence | `opencode.jsonc` + localStorage | Possible drift |
| M2 | Two credential systems | `providers.json` + `auth.json` | Unsynchronized |
| M3 | Hardcoded `opencode.json` in UI | `opencode-config-card.tsx:129` | Config file reference leak |
| M4 | Platform adapter raw CLI invocation | `opencode.ts:49` | `runOpenCode(['run', ...])` |

---

# 9. Gaps

| # | Gap | Impact | Priority |
|---|-----|--------|----------|
| G1 | No Alpha-native execution event types | Store must interpret OpenCode events directly | High |
| G2 | No formal Adapter interface | Business layer imports OpenCode client directly | High |
| G3 | No Alpha configuration schema | Config is scattered across 15+ sources | High |
| G4 | No provider abstraction boundary | Alpha Providers ≠ OpenCode providers | Medium |
| G5 | No permission abstraction | OpenCode permissions not exposed in Alpha UI | Low |
| G6 | No MCP abstraction | MCP config is OpenCode-native only | Low |

---

# 10. Recommended Small Corrective Actions

| # | Action | Scope | Effort |
|---|--------|-------|--------|
| R1 | Define `AlphaExecutionEvent` types (text, tool_start, tool_complete, step_complete, error) | types.ts | Small |
| R2 | Add adapter interface: `OpenCodeAdapter` with `send()`, `onEvent()`, `getState()` | New file | Small |
| R3 | Move OpenCode event interpretation from store to adapter | opencode-store.ts | Medium |
| R4 | Rename `OpenCode*` types to `Alpha*` where they represent Alpha concepts | types.ts | Small |
| R5 | Extract hardcoded "OpenCode" strings to constants | chat-message.tsx, runtime-status-bar.tsx | Small |
| R6 | Unify credential store (Alpha or OpenCode, not both) | providers-config.ts | Medium |

---

# 11. Explicitly NOT Required

- Redesigning Alpha Workspace UX
- Redesigning OpenCode
- Implementing SDK
- Implementing a new configuration system
- Changing model/provider behavior
- Changing Google integration
- Changing MCP architecture
- Changing execution lifecycle behavior
- Modifying production behavior

---

# 12. SDK Readiness Impact

## Gate Status: NOT READY

SDK architecture requires:

```
Alpha Product Contract          ← DEFINED in this audit
Alpha Configuration Contract    ← DEFINED in this audit (Section 5)
Runtime Adapter Boundary        ← DEFINED in this audit (Section 6)
Provider Boundary               ← GAP (G4) — needs clarification
Reference Boundary              ← OK (Alpha Resources exist)
Extension Boundary              ← OK (Alpha Skills exist)
SDK Architecture                ← BLOCKED by G1, G2, G3
```

## What Must Happen Before SDK

1. **R1**: Define Alpha-native execution event types (removes C1, C2)
2. **R2**: Define formal adapter interface (removes C3, H1)
3. **R3**: Move OpenCode interpretation to adapter (removes C2, C4)

## What Can Proceed Now

- Alpha Configuration Contract (Section 5) is ready
- Adapter Boundary (Section 6) is ready for design
- Execution Lifecycle Boundary (Section 7) is documented

---

# 13. Final Verdict

**PASS WITH FINDINGS**

The configuration boundary is sufficiently understood. The Alpha Configuration Contract (5 areas) and Adapter Boundary (translation tables) are defined.

**Findings requiring corrective action before SDK:**

1. No Alpha-native execution event types — store interprets OpenCode events directly (C1, C2)
2. No formal adapter interface — business layer imports OpenCode client (C3)
3. Configuration scattered across 15+ sources with dual-write tensions (G3)

**The audit provides sufficient evidence to proceed with corrective actions R1-R3 before SDK architecture begins.**

---

# Git Evidence

- **Branch**: `task/gworkspace-002-r1-drive-access-rework`
- **Files inspected**: 30+
- **Commit**: This is an audit-only task. No production code changes.
