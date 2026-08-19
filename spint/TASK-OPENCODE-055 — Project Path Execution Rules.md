# TASK-OPENCODE-055 — Project Path Execution Rules

## Type

Execution-Context Corrective Rework

## Status

COMPLETED — PASS (2026-08-19)

---

# 23. EXECUTION SUMMARY

## A. Initial State Audit

- `settings.workspacePath` is **global settings state** (localStorage `alpha-one:opencode-settings`), synchronized from the server cwd via `/api/runtime/workspace` (`detectWorkspace(process.cwd())`). The OpenCode CLI was **always spawned with the server's `process.cwd()`** — no `cwd` option existed in either spawn call (`server.ts`).
- `Chat` had **no project/workspace field** that the runtime consumed; `sendMessage()` never transmitted any project reference to the server. The CLI therefore always executed in `C:\dev\alpha-one` regardless of any Project Path shown in the UI.
- `Runtime-detected. Cannot be overridden manually.` is **intended** (added in TASK-025R1, commit `b2758e4`) — the workspace path setting is a runtime-detected display value, not an execution override.
- `selectWorkspace()` in the store is in-memory-only; the transport `listWorkspaces()` hardcodes `return []` (dead code) — the pre-existing architecture had **no channel** for a per-chat execution root.
- Local Folder and Google Drive pickers existed **only** in the Assistant feature (`ProjectSelector`, `LocalFolderPicker`, `openDriveFolderPicker` + `/api/fs/dirs`, `/google/drive-picker`). The pre-053 OpenCode page rendered no `ProjectSelector` at all.
- Full audit evidence recorded in `spint/TASK-OPENCODE-054-AUDIT-WORKSPACE-PATH-STATE.md` (commit `df7b1d8`, verdict PASS).

## B. Design Decisions

1. **Selected Project Path is the authoritative execution context**, scoped per session (`Chat.project`), not app-global state.
2. **Local Folder → CLI execution root**: the absolute folder path becomes the spawned CLI `cwd` and joins the reference `allowedRoots`.
3. **Google Drive folder → Drive execution boundary**: the folder ID is injected as a prompt boundary block; it is **never** used as a local `cwd`.
4. **Reuse the existing `ProjectSelector`** (Local Folder / Drive pickers) via optional controlled props (`project` / `onProjectChange`); no duplicate picker, no redesign. Assistant page usage is unchanged (uncontrolled).
5. **No `settings.workspacePath` fallback** — project-empty chat runs with server cwd (existing behavior).
6. **Invalid/missing Local path fails the request explicitly** (`400 PROJECT_PATH_UNAVAILABLE`), no silent fallback.
7. `ChatProjectContext` extended with `type: 'local' | 'google-drive'`; `Project.contextPath` is the execution reference (local absolute path OR Drive folder ID).

## C. Transport & Store Wiring

- `types.ts`: `ChatProjectContext` gains `label?: string` and `type?: 'local' | 'google-drive'` (`path` documented as local path OR Drive folder ID).
- `http-transport.ts`: `OpenCodeTransport.sendPrompt` and `HTTPTransport.sendPrompt` gained a trailing `project?: ChatProjectContext` parameter; the request body now includes `{ type, path, name, label }` when present.
- `opencode-service.ts`: `sendPrompt` passthrough forwards `project`.
- `opencode-store.ts`: `sendMessage()` passes `activeChat?.project` as the trailing argument. New Chat is project-empty (`undefined` → server uses its runtime cwd; no `settings.workspacePath` fallback).

## D. Server Execution Context

- `server.ts` now defines `ProjectExecutionContext` (`type`/`path`/`name`/`label`) and reads `body.project`.
- Valid Local project → `projectCwd` (realpath) used as `cwd` on **both** the initial spawn and the continuation spawn; `PROCESS SPAWNED` log now includes the `cwd`.
- No project or Drive project → `cwd: undefined` (server `process.cwd()`, unchanged behavior).

## E. Local Path Validation

`resolveValidLocalProjectPath()`: rejects non-string/empty, NUL bytes, `..` traversal segments, and relative paths (`isAbsolute`); requires `realpathSync` + `existsSync` + `statSync().isDirectory()`; returns the canonical `resolve(realpath)`. The CLI and reference resolver always run against the canonical path, never the raw client string.

## F. Google Drive Boundary

`buildProjectContextBlock()` emits `[Project Execution Context — Google Drive]` with the folder ID and explicit "stay inside this folder" instructions (incl. Sheets `fileId` mapping); `[Project Execution Context — Local Folder]` emits the resolved project root. The block is prepended to the message for both types. Drive folder ID is only ever text — never a `cwd`.

## G. Reference Allowed-Roots

`resolveRequestReferences(req, res, allowedRoots)` — `allowedRoots = projectCwd ? [projectCwd, process.cwd()] : [process.cwd()]`. `src/services/references/local-resolver.ts` already enforces containment (normalize + realpath + traversal rejection), so references cannot escape the project boundary.

## H. UI Integration

- `project-selector.tsx`: optional `project?: Project | null` + `onProjectChange?: (p: Project | null) => void`. In controlled mode (`project !== undefined`) select/create/clear/delete route through `onProjectChange` and the trigger/`isActive`/row-highlight use `displayProject`; delete also clears the session context when it removed the active project. Assistant usage remains uncontrolled.
- `opencode-toolbar.tsx`: renders `<ProjectSelector project={activeChat?.project ? toProject(...) : null} onProjectChange={(p) => setActiveChatProject(p ? toContext(p) : undefined)} />`. `toProject`/`toContext` preserve the Drive folder ID as `contextPath` and map `type`/`label` both ways.
- `opencode-page.tsx`: Recent Projects fast track now sets `{ id, name, path: p.contextPath, label: (local ? contextPath : contextLabel), type: p.contextType }` — fixes the previous Drive-folder-ID loss (`path` was `contextLabel`, a display string, not the folder ID).

## I. Recent Projects Context

Local project → `path` = absolute local path, `label` = path. Google Drive project → `path` = **Drive folder ID**, `label` = human-readable Drive breadcrumb/name. Verified via seeded-session probe: session B selector shows `Wonderland Store`, its persisted `chat.project` carries the folder ID in `path`.

## J. Regression Preservation (TASK-053)

- New Chat → messages `0`, project `null` (`hasProject:false`), model `null` (`hasModel:false`) → selector shows `No project`, chat persists project-empty — `PASS`.
- Recent Projects fast track visible in empty state — `PASS`.
- Session restore: selector shows the correct per-session project (`SMS.ID` local, `Wonderland Store` drive, `No project` for an empty session) — `PASS`.
- Model stays the configured default (`opencode/deepseek-v4-flash-free`) on New Chat; per-session model untouched — `PASS`.
- Session action trigger present on every row (`Chat options` aria-label), pinned, not clipped — `PASS`.

## K. Local Execution Runtime Test (E2E, real stack)

Playwright against `http://localhost:3000/ai/opencode` (Developer Mode OFF). Seeded a disposable project `C:\Users\ASUS\AppData\Local\Temp\opencode\sms-id-project` (containing `README.txt`) in `alpha-one:projects`.

- New Chat → project-empty (`chatProject: null`, selector `No project`) — `PASS`.
- Recent Projects pick → `chat.project = { id, name:'SMS.ID', path:'…\sms-id-project', label: same, type:'local' }` persisted — `PASS`.
- Prompt: "List the files in this project, then create a file named agent-test.txt containing the text 'TASK-055 OK'."
- Completed in ~14s; final status `done`, execution `completed`, model `opencode/deepseek-v4-flash-free` — `PASS`.
- Server log: `PROCESS SPAWNED { pid: 13048, cwd: 'C:\\Users\\ASUS\\AppData\\Local\\Temp\\opencode\\sms-id-project' }` — the CLI ran **in the project root** — `PASS`.
- `tool_use` write event: `filePath: 'C:\\Users\\ASUS\\AppData\\Local\\Temp\\opencode\\sms-id-project\\agent-test.txt'` — the agent operated **inside** the boundary — `PASS`.
- `agent-test.txt` exists in the project dir with content `TASK-055 OK`; **`C:\dev\alpha-one\agent-test.txt` does NOT exist** — `PASS` (nothing leaked into the app root).

## L. Failure-Path Test (direct API)

- Missing path `C:\does-not-exist-055` → `HTTP 400`, body `{"error":"Project path is invalid, missing, or inaccessible: C:\\does-not-exist-055","projectError":"PROJECT_PATH_UNAVAILABLE"}` — explicit rejection, no silent fallback — `PASS`.
- Traversal path `..\..\Windows` → `HTTP 400` — `PASS`.
- Both requests logged with `project:{type:'local',hasPath:true}` and never reached the CLI — `PASS`.

## M. Google Drive-Type Server Test (direct API)

- `project { type:'google-drive', path:'1FAKE-DRIVE-FOLDER-ID-055', name:'Wonderland Store' }` → `HTTP 200` (not 400) — `PASS`.
- `PROCESS SPAWNED { cwd: 'C:\\dev\\alpha-one' }` — the folder ID was **not** used as `cwd` — `PASS`.
- CLI args trace shows the injected boundary block: `[Project Execution Context - Google Drive] … Google Drive folder ID: 1FAKE-DRIVE-FOLDER-ID-055 … All Google Drive operations must stay inside this folder.` — `PASS`.
- Live Drive folder operations remain **UNPROVEN / capability gap**: the agent has no folder-scoped Drive tool (only google-sheets MCP + file-level `google_drive` references), and no Drive folder was available for a live run. Enforcement is boundary-instruction-only by design (task did not add a Drive agent tool).

## N. Session / Restore / Selector Regression Probe (Playwright)

Seeded 3 sessions + 2 projects (1 local, 1 Drive). Results:
- Session A (local) → selector `SMS.ID`; Session B (Drive) → selector `Wonderland Store`; Session C (empty) → `No project` — `PASS`.
- New Chat → `No project`, `chat.project null`, Recent Projects present — `PASS`.
- ProjectSelector create form renders both `Local folder` and `Google Drive folder` type options (reused component, unchanged for Assistant) — `PASS`.

## O. Lint / Typecheck

- `npx tsc --noEmit` — clean.
- `npx eslint src/features/ai/opencode src/features/ai-assistant/components/project-selector.tsx src/services/opencode/server.ts` — clean for all changed code. The only errors are **pre-existing at HEAD** in the untouched resource-registration endpoint (`server.ts:56`, unused destructured vars `mimeType/url/path/size/lastModified/metadata`) — verified by stashing `server.ts` to HEAD and re-linting; left untouched per scope discipline (no unrelated changes).
- The toolbar React Compiler memoization error introduced by this change was resolved by computing `selectedModel` directly (the compiler memoizes it; the previous explicit `useMemo` can no longer be preserved once `activeChat` is also read in the JSX) — verified pre-existing files lint clean at HEAD before my changes.

## P. Evidence Classification

- `PROVEN`: server never had a `cwd` option before (spawn code audit); `settings.workspacePath` is global state synced from `process.cwd()`; invalid-path 400 with `PROJECT_PATH_UNAVAILABLE`; local execution root (spawn `cwd` log + `tool_use` write path + on-disk verification); `C:\dev\alpha-one` clean of `agent-test.txt`; Drive type never becomes `cwd` (spawn log) and boundary block injected (CLI args trace); per-session selector state (restore probe); New Chat project-empty; Recent Projects carries `type`/folder-ID.
- `DERIVED`: reference containment prevents escaping the project boundary (allowed-roots passed to `resolveReferences`; `local-resolver.ts` already enforces realpath containment); continuation spawn keeps the same root.
- `UNPROVEN`: live Drive folder *operations* constrained to the folder (capability gap — no folder-scoped agent Drive tool; no live Drive folder available this run). Documented; out of task scope (no Drive agent tool was to be added).
- `UNKNOWN`/`INSUFFICIENT_EVIDENCE`: none blocking.

## Q. Final Verdict

`PASS`

All task decisions are implemented and verified: the selected Project Path is the authoritative execution context — a Local Folder becomes the CLI execution root (`cwd` + reference `allowedRoots`; verified the agent created `agent-test.txt` inside `…\sms-id-project` and nothing in the app root), a Google Drive folder ID becomes a Drive boundary injected into the prompt and is never used as `cwd` (verified), invalid/missing local paths fail explicitly with `400 PROJECT_PATH_UNAVAILABLE` (verified), project-empty chats keep the runtime cwd with no `settings.workspacePath` fallback, the existing `ProjectSelector` is reused (Local/Drive pickers intact, Assistant unaffected), and all TASK-053 behaviors (New Chat empty project, Recent Projects fast track, per-session model, pinned session actions) are preserved. `tsc` clean; lint clean for changed code (only pre-existing, untouched `server.ts:56` errors remain). One documented limitation: live Google Drive folder-operation enforcement is UNPROVEN due to the pre-existing capability gap (no folder-scoped Drive agent tool) — out of scope for this task.

---

# 1. OBJECTIVE

Make the user-selected **Project Path** the authoritative execution context for the Alpha Workspace OpenCode agent:

1. **Local Folder project** → the agent executes **within that folder**: the folder becomes the CLI working directory and the reference allowed-filesystem root. Any read/create/edit/command must stay inside it.
2. **Google Drive project** → the folder becomes a **Drive execution boundary**: the agent is instructed to operate only inside that folder; the folder ID is **never** used as a fake local working directory.
3. Project context is **per session** (each chat has its own project), selected through the existing Project Path picker reused from the Assistant feature.
4. Project-empty chat → the server's runtime workspace is used (existing behavior). `settings.workspacePath` is **never** used as an execution override.

# 2. USER-DESIGN DECISION

## Project Path = Execution Context

- The Project Path selector on the OpenCode page is the single source of truth for what the agent may access.
- **Local folder**: absolute path → CLI `cwd` + `allowedRoots` entry (alongside the server cwd).
- **Google Drive folder**: folder ID → Drive boundary context injected into the prompt; never a local `cwd`.
- New Chat is project-empty; `Recent Projects` fast track may select a project for the new chat.
- Reuse the existing `ProjectSelector` (Local Folder + Google Drive pickers). No new picker, no redesign.
- Do not create a new workspace-path setting; do not fall back to `settings.workspacePath`.

# 3. IMPLEMENTATION BOUNDARY

- Reuse: `ProjectSelector`, `LocalFolderPicker`, `openDriveFolderPicker`, `/api/fs/dirs`, `/api/google/drive`, reference `allowedRoots` machinery.
- Extend: `ChatProjectContext` (`type`/`label`/`path` semantics), HTTP transport request body, `server.ts` spawn `cwd` + allowed-roots + boundary block.
- Do NOT change: `settings.workspacePath` semantics, model/mode/variant handling, MCP providers, OAuth, project-management CRUD, the Assistant page (default/uncontrolled usage).

# 4. ACCEPTANCE CRITERIA

1. Local Project Path → CLI spawn `cwd` = canonical project root (realpath), verified by server log.
2. Reference resolution allowed-roots include the project root alongside `process.cwd()`.
3. Agent file operations land inside the project root, not the app root (disposable test project; read + create `agent-test.txt`; never `C:\dev\alpha-one\agent-test.txt`).
4. Invalid/missing local path → `400` with `projectError: PROJECT_PATH_UNAVAILABLE`; no silent fallback; traversal (`..`) rejected.
5. Google Drive project → never passed as `cwd`; folder ID injected as Drive boundary context; request succeeds.
6. New Chat project-empty; Recent Projects fast track sets `type`/`path`/`label` correctly (Drive folder ID preserved).
7. TASK-053 behaviors preserved (per-session model, session actions, project isolation).
8. `tsc` + `eslint` clean for changed code (pre-existing `server.ts:56` errors documented).
9. Execution summary sections A–Q recorded in the task file with a final verdict.

# 5. FINAL PRINCIPLE

The selected Project Path decides what the agent can touch. Local folders get a real execution root; Drive folders get a scoped Drive boundary. A bad path fails loudly, never silently degrades, and never falls back to the global workspace-path setting.
