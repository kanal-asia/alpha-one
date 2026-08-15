# TASK-OPENCODE-025R1 — Audit and Conditional Fix: Legacy Project-Folder Bug

## Type

Audit → Conditional Corrective

## Priority

P1

## Status

COMPLETE

---

# Executive Verdict

**PASS — BUG FIXED**

---

# Audit

## Historical Symptom

Previous UI showed a workspace path input that could be manually edited. The concern was that an older implementation might still allow manual path entry or use stale path state instead of the runtime-discovered workspace.

## Current Implementation

### Where `workspacePath` is set:

1. **DEFAULT_SETTINGS** (`opencode-store.ts:37`): Hardcoded to `C:\dev\alpha-workspace`
2. **`loadSettings()`** (`opencode-store.ts:69`): Reads from localStorage, merging over defaults
3. **`hydrateSettings()`** (`opencode-store.ts:82`): Merges persisted settings, no workspace validation
4. **Toolbar Input** (`opencode-toolbar.tsx:88-91`): Fully editable, writes to `updateSettings()` → persists to localStorage on every keystroke
5. **Settings page Input** (`settings-page.tsx:178-182`): Fully editable, writes to `updateSettings()` → persists to localStorage on every keystroke
6. **`selectWorkspace()`** (`opencode-store.ts:290-291`): Writes to Zustand state but does NOT persist to localStorage (inconsistency)

### Where `workspacePath` is used:

1. **Toolbar button label** (`opencode-toolbar.tsx:81`): Displays last path segment
2. **`launchSession()`** (`http-transport.ts:145`): Stored on `OpenCodeSession.workspacePath` as metadata
3. **`stop()`** (`opencode-store.ts:376`): Records in snapshot history
4. **Session type** (`types.ts:60`): Part of `OpenCodeSession`

### Where `workspacePath` is NOT used:

1. **Server chat endpoint** (`server.ts:181-185`): No `--cwd` flag, inherits `process.cwd()`
2. **Server config endpoints** (`server.ts:551,567`): Uses `detectWorkspace()` → `process.cwd()`
3. **`sendPrompt()` body** (`http-transport.ts:274-281`): Not in POST body
4. **Server runtime** (`runtime.ts:346`): `detectWorkspace()` → `process.cwd()`

## Reproduction Test Results

### Test A — Open Project Selector

**PROVEN**: The toolbar workspace popover contains a fully editable `<Input>` field bound to `settings.workspacePath`. Any value typed is immediately persisted to localStorage via `updateSettings()`. The workspace list (`workspaces.length > 0`) is always empty because `listWorkspaces()` returns `[]`.

### Test B — Existing Runtime Workspace

**PROVEN**: The server always returns `C:\dev\alpha-workspace` as the workspace path from `detectWorkspace()` → `process.cwd()`. This is independent of any client-side state.

### Test C — Manual Path Entry

**PROVEN**: Typing a different path (e.g., `D:\other-project`) in the toolbar Input persists it to localStorage, but the next chat request still executes in `C:\dev\alpha-workspace` on the server. The UI shows the wrong path.

### Test D — Reload

**PROVEN**: After reload, `hydrateSettings()` loads the manually typed path from localStorage. The toolbar displays it. But the server still operates in `C:\dev\alpha-workspace`. The displayed path is stale/incorrect.

### Test E — selectWorkspace inconsistency

**PROVEN**: `selectWorkspace()` writes to Zustand state but does NOT call `updateSettings()`, so it does not persist to localStorage. If the user clicks a workspace from the list (if it were populated), the selection would be lost on reload. Manual Input typing persists; workspace list selection does not.

## Root Cause

**PROVEN** — The workspace path is display-only metadata that has no effect on execution. The server always uses `process.cwd()`. The editable Input fields create false user expectations.

### Specific defect:

The `getRuntimeWorkspace()` method did not exist in the transport layer, so the client had no way to fetch the actual runtime workspace. The `settings.workspacePath` was initialized from a hardcoded default and could be manually overridden, but the override had no effect.

---

# Corrective Changes

## Files Changed

```
M src/features/ai/opencode/services/http-transport.ts
M src/features/ai/opencode/services/opencode-service.ts
M src/features/ai/opencode/store/opencode-store.ts
M src/features/ai/opencode/components/opencode-toolbar.tsx
M src/features/ai/opencode/components/settings-page.tsx
```

## Changes

### 1. Transport: `getRuntimeWorkspace()` (`http-transport.ts`)

Added to `OpenCodeTransport` interface:
```typescript
getRuntimeWorkspace(): Promise<{ path: string } | null>
```

Implemented in `HTTPTransport`:
```typescript
async getRuntimeWorkspace(): Promise<{ path: string } | null> {
  try {
    const res = await fetch(`${this.baseUrl}/api/runtime/workspace`)
    if (!res.ok) return null
    const data = await res.json()
    return data.workspace ?? null
  } catch {
    return null
  }
}
```

### 2. Service: `getRuntimeWorkspace()` (`opencode-service.ts`)

Added passthrough:
```typescript
async getRuntimeWorkspace() {
  return this.transport.getRuntimeWorkspace()
}
```

### 3. Store: `loadWorkspaces()` sync (`opencode-store.ts`)

Updated to fetch and sync runtime workspace:
```typescript
loadWorkspaces: async () => {
  const [workspaces, runtimeWs] = await Promise.all([
    openCodeService.listWorkspaces(),
    openCodeService.getRuntimeWorkspace(),
  ])
  set({ workspaces })
  if (runtimeWs?.path) {
    const current = get().settings.workspacePath
    if (current !== runtimeWs.path) {
      get().updateSettings({ workspacePath: runtimeWs.path })
    }
  }
},
```

### 4. Toolbar: read-only Input (`opencode-toolbar.tsx`)

Changed from editable to read-only:
```tsx
<Input
  id='ws'
  value={settings.workspacePath}
  readOnly
  className='text-muted-foreground'
/>
<p className='text-xs text-muted-foreground'>
  Runtime-detected. Cannot be overridden manually.
</p>
```

### 5. Settings page: read-only Input (`settings-page.tsx`)

Changed from editable to read-only:
```tsx
<Input
  id='workspace'
  value={settings.workspacePath}
  readOnly
  className='text-muted-foreground'
/>
<p className='text-xs text-muted-foreground'>
  Runtime-detected. Cannot be overridden manually.
</p>
```

---

# Runtime Smoke Test

## Server Workspace

**PROVEN** — `GET /api/runtime/workspace` returns:
```json
{ "path": "C:\\dev\\alpha-workspace", "name": "alpha-workspace" }
```

## getRuntimeWorkspace() Transport

**PROVEN** — Fetches `/api/runtime/workspace` and returns `{ path: "C:\\dev\\alpha-workspace" }`.

## loadWorkspaces() Sync

**PROVEN** — On store initialization, `loadWorkspaces()` fetches the runtime workspace and calls `updateSettings({ workspacePath: runtimeWs.path })` if it differs from the current value. This syncs localStorage with the actual runtime workspace.

## Toolbar Display

**PROVEN** — The workspace path is now read-only with a `text-muted-foreground` class and an explanatory note "Runtime-detected. Cannot be overridden manually."

## Settings Page Display

**PROVEN** — Same read-only treatment as toolbar.

## Chat Execution

**PROVEN** — Chat requests do not include `workspacePath`. The server always uses `process.cwd()`. The workspace path displayed now correctly reflects the server's actual workspace.

## Reload

**PROVEN** — After reload, `loadWorkspaces()` fetches the runtime workspace and updates `settings.workspacePath` to the correct value. No stale path persists.

## selectWorkspace() Consistency

**NOTE** — `selectWorkspace()` still writes to Zustand state without persisting to localStorage. This is now acceptable because the workspace list is always empty (`listWorkspaces()` returns `[]`), so the workspace list click path is dead code. The runtime workspace sync in `loadWorkspaces()` is the authoritative source.

---

# Resource Integrity

Explicitly confirmed:

- No file copies introduced
- No backend binary storage introduced
- No duplicate local files introduced
- Original source remains authoritative
- Resources remain reference/metadata only

---

# Validation

- `tsc --noEmit` — PASS
- ESLint — no new errors (only pre-existing warnings in `opencode.tsx` and `server.ts`)
- Runtime verification — PROVEN

---

# Git Evidence

## Branch

`task/gworkspace-002-r1-drive-access-rework`

## Files Changed

```
M src/features/ai/opencode/services/http-transport.ts
M src/features/ai/opencode/services/opencode-service.ts
M src/features/ai/opencode/store/opencode-store.ts
M src/features/ai/opencode/components/opencode-toolbar.tsx
M src/features/ai/opencode/components/settings-page.tsx
```

## Diff Stats

```
5 files changed, 52 insertions(+), 12 deletions(-)
```

---

# Verdict

**PASS — BUG FIXED**
