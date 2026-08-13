# TASK-AIASSISTANT-006 — Workspace UI Refinement & OpenCode Settings Restoration

## Objective

Refine the Alpha Workspace AI Assistant UI and restore OpenCode settings to be driven by OpenCode's own mechanism:

- **A. Local File Picker** — the dialog content overflowed/clipped its rows; widen the modal so file rows (name + size) never overlap.
- **B. Session list project context** — show the project a chat belongs to instead of the message count.
- **C. Model/Provider picker width** — the popover was too narrow for model names + provider + tier badge; widen it.
- **D. Connect Provider** — add a "Connect Provider" entry following OpenCode's own auth mechanism (no parallel credential store, no hard-coded provider list as source of truth, no fake "connected" states).
- **E. OpenCode Settings restoration** — settings must read from and write the actual OpenCode configuration source (OpenCode has no `opencode config` command in v1.18.18; config is file-based).

---

## Execution Summary

### Final Verdict: PASS

### Audit Findings (driving decisions)

| Area | Finding |
|------|---------|
| Settings reachability | `OpenCodeSettingsPage` exists (`src/features/ai/opencode/components/settings-page.tsx`), route `/ai/opencode/settings` is registered, AI layout nav + toolbar gear both link to it. It was reachable in code but not surfaced as a labeled control. |
| OpenCode config surface (v1.18.18) | No native `opencode config` command. Config is file-based: `<workspace>/opencode.json`, `<workspace>/.opencode/opencode.json`, `~/.config/opencode/opencode.json`, `~/.local/share/opencode/opencode.json`. No `opencode.json` existed anywhere → effective config = defaults. |
| OpenCode auth surface | `opencode auth login --provider <id>` is an interactive TUI/OAuth flow (cannot complete in a headless runtime — verified: it launched the "Enter your API key" prompt and timed out). `opencode auth logout <id>` is non-interactive (verified with a bogus provider → clean CLI error). Credentials live in `~/.local/share/opencode/auth.json`. |
| Provider source of truth | Providers must come from the OpenCode runtime (`/api/opencode/providers` via `openCodeRuntimeProvider.discoverModels()`), not the hard-coded `PROVIDER_DEFINITIONS` in `src/services/opencode/providers-config.ts`. |

### Implementation

**A — Local File Picker width** (`local-file-picker.tsx`)
- `DialogContent` widened `sm:max-w-md` → `sm:max-w-xl`. File rows already use `flex-1 truncate` + `shrink-0` size, so wider modal eliminates overlap.

**B — Session list project context** (`types.ts`, `opencode-store.ts`, `chat-sidebar.tsx`)
- Added `ChatProjectContext { id?, name?, path? }` to the `Chat` type.
- Store stamps the active project at chat creation (`makeChat`) and at send time for legacy chats missing a project (`project: c.project ?? activeProjectContext()`). `activeProjectContext()` reads `useProjectStore.getState().activeProject` (one-way dependency; no import cycle — `project-store` imports nothing from the AI feature). For Google Drive projects the path line shows the breadcrumb label.
- Sidebar secondary line shows `project.name ?? 'No project'`; a tertiary line shows the project path when present. Message count removed.

**C — Model/Provider picker width** (`model-selector.tsx`)
- Trigger `w-[220px]` → `w-[260px]`; `PopoverContent` `w-80` → `w-[440px] max-w-[calc(100vw-2rem)]`.

**D — Connect Provider (OpenCode mechanism)**
- New `src/services/opencode/auth.ts`: runs OpenCode's own `auth login|logout` via `spawn` with `OPENCODE_NO_TUI=1`, `CI=1`, `NO_COLOR=1`; returns `{ ok, command, output, timedOut }`. Login has a 15s timeout because the flow is interactive; the response surfaces the exact command (`opencode auth login --provider <id>`) and CLI output — never fabricates success. Logout is genuinely executed.
- Server endpoints in `server.ts`: `POST /api/opencode/auth/login`, `POST /api/opencode/auth/logout`.
- Transport (`http-transport.ts`) + service (`opencode-service.ts`) methods `connectProvider` / `disconnectProvider`.
- New `ConnectProviderDialog`: catalog fetched from `/api/opencode/providers` (OpenCode-discovered), rows show connection badge + model counts, Connect/Disconnect actions, and an honest "Login requires a terminal" result panel when the headless attempt times out.
- Model Picker footer gains a **Connect Provider** button opening the dialog.

**E — OpenCode Settings restoration**
- New `src/services/opencode/opencode-config.ts`:
  - `candidateConfigPaths`/`resolveOpenCodeConfigPath` — locate the active config file (project-first, then user scope); no file → the preferred project `opencode.json` is reported as `exists: false`.
  - `readOpenCodeConfig` — JSONC-safe parse (comment stripping) with secret redaction (keys matching `api[_-]?key|secret|token|credential|password|bearer` → `[redacted]`).
  - `patchOpenCodeConfig` — targeted merge of a whitelisted safe-key set (`model` only) into the resolved file, preserving all other existing keys; creates the file if none exists.
- Server endpoints: `GET /api/opencode/config`, `PATCH /api/opencode/config` (validates whitelist; 400 on unsupported keys).
- New `OpenCodeConfigCard` on the settings page: shows the resolved config path + Found/Not-created badge, a Default Model select bound to the real `model` key, Save → PATCH, and a note that secrets are redacted.
- Settings discoverability: toolbar gear replaced with a labeled **Settings** button (`opencode-toolbar.tsx`).

### Runtime Evidence

| Test | Result |
|------|--------|
| `GET /api/opencode/config` (no config exists) | `{"resolvedPath":"C:\dev\alpha-workspace\opencode.json","exists":false,"config":{},"cwd":"..."}` |
| `PATCH /api/opencode/config {patch:{model}}` | Creates `opencode.json`, then GET returns `{"model":"opencode/big-pickle"}`; file contents verified |
| Config artifact cleanup | Test `opencode.json` removed; GET reverts to `exists:false` |
| `POST /api/opencode/auth/login` (openrouter) | Honest blocker: `{"ok":false,"command":"opencode auth login --provider openrouter","output":"…Enter your API key…","timedOut":true}` |
| `POST /api/opencode/auth/logout` (bogus provider) | `{"ok":false,"output":"Error: Unknown configured provider \"not-a-provider\""}` — non-interactive, real CLI error |
| API server | Restarted with new backend; runtime ready, 52 models / 3 providers, OpenCode v1.18.18 |
| Frontend | Vite :5173 `200`; API :3001 `/api/opencode/health` → `state: healthy` |
| TypeScript / Build / Lint | PASS / PASS / PASS (1 pre-existing warning: `src/routes/_authenticated/ai/opencode.tsx` react-refresh) |

### Security

| Check | Result |
|-------|--------|
| Credentials stay in OpenCode's store (`~/.local/share/opencode/auth.json`); workspace never persists them | PASS |
| Config response redacts secret-shaped keys | PASS |
| Config PATCH restricted to a whitelist (`model`); unsupported keys rejected | PASS |
| Provider catalog from OpenCode runtime, not hard-coded defs | PASS |
| No fake "connected" states; headless login reports the real blocker + exact CLI command | PASS |

### Known Limitations

1. `opencode auth login` is an interactive TUI/OAuth flow — the runtime cannot complete it; the UI documents the terminal command the user must run.
2. Editing `opencode.json` via the UI writes plain JSON (JSONC comments in an existing file are not preserved).
3. Only the `model` key is writable from the settings UI today; other safe keys can be added to the whitelist later.
4. The workspace runtime (`--model`/`--temperature` flags) still takes precedence over the config file when the user sets Alpha-side defaults.

### Git

- One commit covering the uncommitted AI workspace + OpenCode + Google Drive picker feature work (Tasks 001-006), which this task builds on; the working tree previously had no commit after `TASK-AIASSISTANT-004`.
- branch: `task/gworkspace-002-r1-drive-access-rework`