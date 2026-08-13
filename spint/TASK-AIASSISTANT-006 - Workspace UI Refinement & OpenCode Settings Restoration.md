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
- commit hash: `453233e`
- commit message: `feat(ai-assistant): AI workspace, OpenCode integration, reference-only attachments & UI refinements (TASK-AIASSISTANT-005/-006)`

---

# TASK-AIASSISTANT-006R1 — Provider Connection & OpenCode Settings UI Completion

## Objective

Corrective rework of Task 006, closing two end-user gaps without regressing Task-005/006 behavior:

- **Scope A — Connect Provider dialog**: the dialog listed only providers OpenCode had already authenticated (because the catalog was built from `opencode models --verbose`, which only reports providers with credentials). Unconnected providers were invisible, so there was no usable Add/Connect flow.
- **Scope B — OpenCode Settings discoverability**: "OpenCode Settings" only lived in the `AILayout` nav (OpenCode page / prompt library / settings pages). The AI Assistant the user actually uses (`/workspace/assistant`) renders `assistant-chat-page.tsx`, which never mounts `AILayout`, so the settings entry was unreachable from the assistant UI.

## Execution Summary

### Audit (before modifying) — root causes

| Finding | Classification |
| --- | --- |
| `fetchProviders()` catalog built ONLY from `opencode models --verbose` (lists models only for credential-backed providers) — unconnected providers never appear | PROVEN |
| OpenCode-supported provider source = models.dev registry cache `~/.cache/opencode/models.json` (184 providers with models); refreshed via `opencode models --refresh` | PROVEN |
| `opencode providers list` shows only configured credentials (openrouter, google, google-vertex) — it is not the registry | PROVEN |
| The active global OpenCode config is `~/.config/opencode/opencode.jsonc` (`{"$schema":…,"shell":"powershell"}`); the config resolver only probed `opencode.json` and missed it | PROVEN |
| `/workspace/assistant` uses `assistant-chat-page.tsx` (PageHeader + own toolbar); it never renders `AILayout`, whose nav holds the OpenCode Settings link | PROVEN |
| `auth.json` keys are lowercase provider ids (`openrouter`, `google`, `google-vertex`) matching runtime provider ids | PROVEN |

### Changes

1. `src/services/opencode/client.ts`:
   - `readModelsDevRegistry()` — reads `~/.cache/opencode/models.json`, optional `force` refresh, 60s in-process cache; `parseModelsDevRegistry()` → `{ id, name, modelCount, freeModelCount }`; `registryFreeCount()`.
   - `fetchProviders()` now merges runtime providers (from `opencode models --verbose`, connection `connected`/`configured`) with registry-only providers (connection `available` unless the provider id has credentials in `auth.json` → `configured`), sorted by connection rank then display name. Every summary carries `source: 'runtime' | 'registry'`.
2. `src/services/opencode/types.ts` — added `ConnectionState`, `ProviderSourceKind`, and `source` on `ProviderSummary`.
3. `src/services/opencode/opencode-config.ts` — `candidateConfigPaths()` now probes `.jsonc` variants at project, `.opencode/`, `~/.config/opencode/`, and `~/.local/share/opencode/` scope; preferred create path stays `<workspace>/opencode.json`.
4. `src/features/ai/opencode/types.ts` — mirrored `source` on the frontend `ProviderSummary`.
5. `src/features/ai/opencode/components/connect-provider-dialog.tsx` — rewritten: grouped **Connected** / **Available** sections with counts, live search filter, registry source tag, `Connect` on unconnected providers (invokes the real `opencode auth login --provider <id>`), `Disconnect` on connected/configured providers, honest "Authentication requires terminal interaction" panel with the exact copyable command and a **Refresh Providers** action that re-reads connection state, no fake connected states.
6. `src/features/ai-assistant/components/assistant-chat-page.tsx` — added a labeled **OpenCode Settings** toolbar button linking to `/ai/opencode/settings`.

### Validation

| Check | Result |
| --- | --- |
| `npx tsc -b` | PASS |
| `npx eslint .` | PASS (0 errors; 1 pre-existing react-refresh warning in `src/routes/_authenticated/ai/opencode.tsx`) |
| `npm run build` | PASS |
| Runtime restart rule (check health → stop exact listener → start once → verify) | PASS (API :3001 listener PID 1692 → restarted → 13972; Vite :5173 PID 19832 unchanged, HMR picked up frontend changes) |
| `GET /api/opencode/providers` returns 184 providers; connected=3 (google, opencode, google-vertex), configured=1 (openrouter — registry provider with existing credential, correctly not "available"), available=180 | PASS |
| `GET /api/opencode/config` now resolves to `~/.config/opencode/opencode.jsonc`, exists=true, returns `{"$schema":…,"shell":"powershell"}` | PASS |
| `PATCH /api/opencode/config {"model":…}` against the real global config preserves `$schema` + `shell`, adds `model`; original file restored afterwards (byte-for-byte verified via GET) | PASS |
| `POST /api/opencode/auth/login {provider:"openai"}` (an unconnected provider) runs the real `opencode auth login --provider openai`, captures the interactive "Login method" prompt, reports `timedOut:true` → UI shows copyable command + Refresh | PASS |
| `POST /api/opencode/auth/logout {provider:"not-a-provider"}` → "Unknown configured provider" CLI error, surfaced honestly | PASS |
| `/workspace/assistant` serves 200 through Vite | PASS |

### Constraints honored

- Provider source of truth = OpenCode runtime + models.dev registry cache (no hard-coded Anthropic/OpenAI/OpenRouter list, no parallel provider DB).
- Credentials remain owned by OpenCode (`~/.local/share/opencode/auth.json`); nothing new written to frontend/localStorage/DB/git.
- No fake "connected" states; headless interactive login reported honestly with a copyable command.
- Settings scope unchanged (existing `/api/opencode/config` GET/PATCH backend + whitelist `["model"]`); "OpenCode Settings" distinguished from "Alpha Workspace Settings".

### Known Limitations

1. `opencode auth login` is an interactive TUI/OAuth flow — the runtime cannot complete it; the UI documents the terminal command the user must run, then re-reads state on Refresh.
2. Registry catalog reflects the models.dev cache at read time; refresh via `opencode models --refresh` when new providers are expected.
3. Editing the global config via the UI writes plain JSON (existing JSONC comments in a file are not preserved).

### Git (006R1)

- branch: `task/gworkspace-002-r1-drive-access-rework`
- commit hash: `<hash>`
- commit message: `fix(ai-assistant): complete Connect Provider catalog & expose OpenCode Settings from AI Assistant (TASK-AIASSISTANT-006R1)`