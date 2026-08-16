# TASK-038 — Alpha One Browser Automation Capability Audit

## Type

Capability Audit / Architecture Boundary

## Priority

P1 — Core Capability / Pre-SDK

## Status

COMPLETE — PASS WITH FINDINGS

---

# Executive Conclusion

Playwright exists in Alpha One as a **test-only dependency** and a **disabled UI tool abstraction**. It is NOT currently usable by the AI agent. The `PlaywrightTool` class is registered in the internal ToolRegistry but executes through a `MockHostBridge` that returns canned strings. The OpenCode CLI (the actual agent) has no Playwright MCP configuration and no way to invoke browser automation.

The correct architecture is:

```
Alpha One (product contract)
    ↓
Alpha Browser Capability (navigate, inspect, click, type, screenshot, extract)
    ↓
Browser Adapter (Alpha-owned abstraction)
    ↓
Playwright MCP Server (implementation)
    ↓
OpenCode CLI (runtime)
    ↓
Browser (Chromium)
```

The immediate next step is to configure `@playwright/mcp` in OpenCode's MCP configuration, which would make browser tools available to the agent with zero Alpha Core changes.

**Verdict: PASS WITH FINDINGS** — The boundary is clear. A CWD mismatch in the MCP config must be fixed. The `PlaywrightTool` MockHostBridge is dead code.

---

# 1. Sources Inspected

| Source | Location | Key Findings |
|--------|----------|--------------|
| package.json | `C:\dev\alpha-one\package.json` | `playwright@1.59.1` devDependency |
| vite.config.ts | `C:\dev\alpha-one\vite.config.ts` | `@vitest/browser-playwright` provider |
| pw-probe.mjs | `C:\dev\alpha-one\pw-probe.mjs` | Standalone Chromium probe script |
| playwright-tool.ts | `src/features/tools/providers/playwright-tool.ts` | Disabled tool definition, no real Playwright import |
| tool-registry.ts | `src/features/tools/registry/tool-registry.ts` | Registers PlaywrightTool with MockHostBridge |
| host-bridge.ts | `src/features/tools/providers/host-bridge.ts` | Mock returns canned strings |
| opencode.jsonc | `~/.config/opencode/opencode.jsonc` | google-sheets MCP only, CWD mismatch |
| mcp-servers/google-sheets/server.ts | `C:\dev\alpha-one\mcp-servers\google-sheets\server.ts` | Custom JSON-RPC 2.0 MCP server |
| http-transport.ts | `src/features/ai/opencode/services/http-transport.ts` | TOOL_LABELS for MCP tools |
| opencode-config.ts | `src/services/opencode/opencode-config.ts` | `mcp` not in SAFE_CONFIG_PATCH_KEYS |

---

# 2. Existing Playwright State

## Dependency Status

| Aspect | Status | Evidence |
|--------|--------|----------|
| Installed | YES | `playwright@1.59.1` in devDependencies |
| Version | 1.59.1 | `package.json` line 87 |
| Direct dependency | NO | devDependency only |
| Runtime dependency | NO | Not in `dependencies` |
| Standalone config | NO | No `playwright.config.ts` |
| Vitest integration | YES | `@vitest/browser-playwright` in vite.config.ts |
| @playwright/mcp | NOT INSTALLED | Not in package.json or node_modules |
| Production code import | NO | Only string references in src/ |
| Probe script | YES | `pw-probe.mjs` imports `chromium` from `playwright` |

## Browser Automation in src/

The `PlaywrightTool` class (`src/features/tools/providers/playwright-tool.ts`) is a **24-line configuration wrapper**:
- Tool ID: `browser`
- Category: `browser`
- Capabilities: `navigate`, `click`, `screenshot`
- Default config: `{ enabled: false }` — **disabled by default**
- No `import playwright` — purely a string-based definition
- Execution goes through `MockHostBridge` → returns `'Browser automation step executed successfully.'`

**Classification: DEAD CODE** — The tool is registered but never actually invoked.

---

# 3. Alpha Tool Architecture

## Two Disconnected Tool Systems

### System A: Internal Tool Manager (UI)

```
ToolManagerPage → useToolsStore → ToolRuntime → ToolRegistry → HostBridge (Mock)
```

- 7 tools registered: opencode, kilo-code, filesystem, terminal, git, browser, document
- Used for UI configuration and health checks
- **Does NOT expose tools to the AI agent**
- `PlaywrightTool` is in this system → disabled, mock execution

### System B: OpenCode Agent Tools (Real)

```
Chat Input → HTTPTransport → server.ts → OpenCode CLI (child_process)
```

- OpenCode CLI has its own built-in tools: read, write, edit, bash, glob, grep, todowrite, webfetch, websearch, task
- MCP tools: google_sheets.* (via MCP server)
- Alpha One **observes** tool usage via SSE events, creates `ToolEvent` for UI display
- **Alpha One never registers tools with OpenCode** — the CLI owns tool discovery

### Key Insight

The internal ToolRegistry and the OpenCode agent tool system are **completely disconnected**. There is no code that bridges them. The `PlaywrightTool` in the internal system has no path to reach the OpenCode agent.

---

# 4. MCP Architecture

## Current MCP Configuration

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "mcp": {
    "google-sheets": {
      "type": "local",
      "command": ["npx", "tsx", "mcp-servers/google-sheets/server.ts"],
      "cwd": "C:\\dev\\alpha-workspace",  // ← CWD MISMATCH
      "enabled": true,
      "timeout": 15000
    }
  }
}
```

## MCP Server Implementation

- Custom JSON-RPC 2.0 over stdio (no SDK)
- 4 tools: list_sheets, read_range, write_range, append_rows
- Protocol version: `2024-11-05`
- Auth: reads from `.alpha/google/connections.json`

## Alpha MCP Control

- `mcp` is **NOT** in `SAFE_CONFIG_PATCH_KEYS` — Alpha cannot modify MCP config
- Alpha does not spawn or manage MCP server processes
- Alpha observes MCP tool events via SSE and labels them for UI display

## CWD Mismatch (Finding)

The MCP config sets `cwd` to `C:\dev\alpha-workspace` but the server file is at `C:\dev\alpha-one\mcp-servers\google-sheets\server.ts`. This must be fixed to `C:\dev\alpha-one`.

---

# 5. OpenCode Playwright State

| Aspect | Status | Evidence |
|--------|--------|----------|
| Playwright MCP configured | NO | Not in opencode.jsonc |
| @playwright/mcp installed | NO | Not in package.json |
| Browser tools available to agent | NO | No MCP server provides them |
| Playwright in TOOL_LABELS | NO | Only google_sheets.* tools mapped |
| Agent can invoke Playwright | NO | No path from agent to Playwright |

**Classification: NOT CONFIGURED** — Playwright is not available to the AI agent.

---

# 6. Browser Runtime Proof

The `pw-probe.mjs` script demonstrates that Playwright can launch Chromium:

```javascript
import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage()
await page.setContent('<h1>Hello</h1>')
const title = await page.title()
await browser.close()
```

**Classification: PROVEN** — Playwright can launch a browser and interact with pages. The technical path works.

---

# 7. Browser Capability Boundary

## What Alpha One Should Own

Based on evidence, Alpha should define a **product-level browser capability**:

```
Alpha Browser Capability
├── navigate (URL → page)
├── inspect (read DOM/text)
├── click (element interaction)
├── type (text input)
├── screenshot (visual capture)
├── extract (structured data extraction)
```

## What Should NOT Be in Alpha Core

- Playwright-specific APIs (Browser, BrowserContext, Page, Locator)
- Chromium configuration
- Playwright MCP protocol details
- Browser session/cookie management
- Authentication flows

---

# 8. Playwright Adapter Boundary

The adapter should translate between Alpha capabilities and Playwright implementation:

```
Alpha Browser Capability
        ↓
Browser Adapter (Alpha-owned)
        ↓
Playwright MCP Server (implementation)
        ↓
Playwright API
        ↓
Browser (Chromium)
```

Playwright-specific concepts that remain behind the adapter:
- `Browser`, `BrowserContext`, `Page`, `Locator`
- Chromium launch configuration
- Playwright selectors
- Playwright MCP protocol

---

# 9. OpenCode Adapter Boundary

If OpenCode remains the current runtime, browser tool execution flows:

```
Alpha Workspace (UI)
    ↓
Alpha execution
    ↓
OpenCodeAdapter (sendPrompt)
    ↓
OpenCode CLI (runtime)
    ↓
MCP Server (Playwright)
    ↓
Playwright API
    ↓
Browser
```

Alpha receives:
- `tool_start` (from `tool_use` SSE event with `browser.*` tools)
- `tool_complete` (from `tool_use` completion)
- `tool_error` (from error events)

These map to `AlphaExecutionEvent` types defined in TASK-OPENCODE-035.

---

# 10. Security Findings

| Concern | Current State | Risk |
|---------|---------------|------|
| Navigation restrictions | None defined | MEDIUM — agent could navigate to any URL |
| Credential exposure | No browser auth configured | LOW — no auth flows |
| Cookie/session access | Not configured | LOW — no session persistence |
| Filesystem access | Playwright has full access | HIGH — browser can read local files |
| Downloads | Not configured | LOW — no download paths |
| External website access | Unrestricted if enabled | MEDIUM — no domain allowlist |
| localhost access | Unrestricted | HIGH — could access local services |
| Destructive actions | No guardrails | MEDIUM — could modify web apps |

**Classification: NEEDS SECURITY CONTRACT** — Browser automation requires a permission model before production use.

---

# 11. User Data Boundary

| Data Type | Current Protection | Status |
|-----------|-------------------|--------|
| Authenticated sessions | Not configured | SAFE (not accessed) |
| Cookies | Not configured | SAFE (not accessed) |
| Passwords | Not configured | SAFE (not accessed) |
| Personal websites | Not configured | SAFE (not accessed) |
| Local files | Playwright has access | RISK (if browser navigates to file://) |
| Downloads | Not configured | SAFE (not accessed) |

**Classification: SAFE FOR NOW** — No browser automation is currently active. The risk exists only if the capability is enabled without proper guardrails.

---

# 12. Mapping Matrix

| Layer | Concept | Current Implementation | Owner | Classification | Decision |
|-------|---------|------------------------|-------|----------------|----------|
| Alpha | Browser capability | NOT IMPLEMENTED | Alpha Core | D — NEEDS DESIGN | Define product-level capabilities |
| Alpha | Tool registry | ToolRegistry (7 tools) | Alpha Core | C — EXISTING | Keep, but note disconnection from agent |
| Alpha | Permission | NOT IMPLEMENTED | Alpha Core | D — NEEDS DESIGN | Required before production |
| Adapter | Browser mapping | NOT IMPLEMENTED | Alpha Adapter | D — NEEDS DESIGN | Translate capabilities to Playwright |
| OpenCode | MCP | google-sheets only | OpenCode | C — EXISTING | Add playwright MCP |
| OpenCode | Playwright | NOT CONFIGURED | OpenCode | A — MUST CONFIGURE | Add @playwright/mcp to opencode.jsonc |
| Runtime | Browser | playwright@1.59.1 installed | Playwright | C — EXISTING | Available for use |

---

# 13. SDK Impact

## Browser Capability in SDK

```text
Alpha SDK
└── Browser Capability?
    ├── READY: Alpha-level abstraction can be defined
    ├── NOT READY: No security contract exists
    └── NEEDS: @playwright/mcp configuration + permission model
```

**Classification: NOT READY** — SDK browser capability requires:
1. Security contract (permission model, domain allowlist)
2. Alpha-level abstraction (navigate, inspect, click, etc.)
3. Adapter boundary definition
4. @playwright/mcp configuration

---

# 14. Recommended Next Step

**Immediate (smallest safe proof):**

1. Fix CWD mismatch in opencode.jsonc: `C:\dev\alpha-workspace` → `C:\dev\alpha-one`
2. Install `@playwright/mcp` as devDependency
3. Add Playwright MCP server configuration to opencode.jsonc
4. Verify agent can invoke browser tools via MCP
5. Add `playwright.*` tools to TOOL_LABELS in http-transport.ts

**No Alpha Core changes required** — OpenCode + MCP handles everything.

**Future (after security contract):**
- Define Alpha Browser Capability abstraction
- Implement Browser Adapter
- Add permission model
- Integrate into SDK

---

# 15. Final Verdict

**PASS WITH FINDINGS**

The browser automation boundary is sufficiently understood. The architecture is clear:

- Playwright exists as a test dependency and dead code tool abstraction
- The OpenCode CLI owns tool execution via MCP
- Adding `@playwright/mcp` to opencode.jsonc would make browser tools available to the agent
- No Alpha Core changes are required for the immediate next step
- Security contract is required before production use

**Findings requiring corrective action:**
1. CWD mismatch in opencode.jsonc must be fixed (`alpha-workspace` → `alpha-one`)
2. `PlaywrightTool` MockHostBridge is dead code — consider removal
3. Security contract needed before browser automation is enabled

---

# 16. Go-Live / SDK Impact

```text
Alpha One Core:
READY

Browser Capability:
NOT READY (no MCP config, no security contract)

SDK Browser Capability:
NOT READY (needs security contract + abstraction design)
```

Alpha One Core Go-Live is NOT blocked by browser automation absence. The capability is P1 (important but not critical path).

---

# Git Evidence

- **Branch**: `task/gworkspace-002-r1-drive-access-rework`
- **Files inspected**: 15+ source files, config files, MCP server
- **Commit**: This is an audit-only task. No production code changes.
