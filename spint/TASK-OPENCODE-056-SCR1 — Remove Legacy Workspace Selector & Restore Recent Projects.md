# TASK-OPENCODE-056-SCR1 — Remove Legacy Workspace Selector & Restore Recent Projects

## Type

Small Corrective Action

## Scope

OpenCode UI only.

Correct the Project/Workspace presentation introduced after TASK-053/055.

Do NOT modify the Project execution runtime implemented by TASK-055.

---

# 1. CONFIRMED FINDING

Current OpenCode toolbar shows two separate path concepts:

- `No project` → the new per-session Project Path selector.
- `alpha-one` → the legacy global Workspace Path selector.

This is confusing and violates the intended UX established by TASK-053/055.

The selected Project is now the authoritative execution context.

The legacy Workspace Path selector must therefore no longer be presented as a second user-facing project/workspace selector on the OpenCode page.

Additionally, the Project selector currently does not expose the expected Recent Projects fast-track inside its dropdown.

---

# 2. REQUIRED CORRECTIVE ACTION

## A. Remove legacy Workspace selector from OpenCode toolbar

Remove/hide the user-facing legacy Workspace Path selector currently displaying values such as:

`alpha-one`

The OpenCode toolbar must no longer show two path selectors.

Expected:

`[ Project ] [ Model ] [ Mode ] [ Context ] ...`

Not:

`[ Project ] [ Workspace ] [ Model ] [ Mode ] ...`

Do NOT delete or redesign the underlying `settings.workspacePath` implementation unless strictly required to remove this UI rendering.

Do NOT change its existing semantics outside this UI correction.

---

## B. Keep Project selector as the single project context control

The existing Project selector remains the authoritative UI for the session's project.

It must continue to support:

- No project
- Local Folder
- Google Drive Folder
- Existing session project restoration
- Recent Project selection

Do NOT create a second project selector.

Do NOT redesign `ProjectSelector`.

---

## C. Restore Recent Projects visibility

The Project selector should expose the existing/relevant recent projects as a fast-track.

At minimum, when recent projects are available, the selector should show them as selectable existing projects.

Example:

Recent Projects

- SMS.ID
- Wonderland Store

The displayed label/path should remain human-readable.

For Google Drive projects, preserve the Drive folder identity already established by TASK-055; do not replace the stored folder ID with a display label.

Do NOT create a new Recent Projects persistence system.

Reuse the existing project/session data already implemented by TASK-053/055.

---

# 3. REQUIRED BEHAVIOR

## New Chat

New Chat must start with:

- Project = `No project`
- Model = configured default
- Mode = configured/default mode
- No inherited project from the previously active session
- No legacy Workspace selector displayed

Recent Projects should remain available as a fast-track.

## Existing Session

Opening an existing session must restore its own Project.

Examples:

- Session A → `SMS.ID`
- Session B → `Wonderland Store`
- Project-less session → `No project`

The project must not be replaced by the global workspace path.

## Project Selection

Selecting a project must continue to use the existing Project context and TASK-055 execution wiring.

Do NOT modify:

- Local project → CLI `cwd`
- Local project → `allowedRoots`
- Google Drive project boundary
- Project validation
- Session project persistence
- Project type/path semantics

---

# 4. UI ACCEPTANCE CRITERIA

### AC-01 — Single path selector

OpenCode toolbar contains only the Project selector.

There is no second `Workspace Path` / `alpha-one` selector.

### AC-02 — New Chat

New Chat shows:

`No project`

and does not inherit the previous session's project.

### AC-03 — Recent Projects

When recent projects exist, Project selector exposes them as selectable fast-track options.

### AC-04 — Existing session

Opening an existing session restores its own Project correctly.

### AC-05 — Local Project

Selecting a Local Project continues to display the existing project and does not break TASK-055 local execution behavior.

### AC-06 — Google Drive Project

Selecting a Google Drive Project continues to display the existing project and preserves its Drive folder identity.

### AC-07 — No legacy execution change

The corrective action must not change TASK-055's execution behavior.

---

# 5. SCOPE GUARDRAILS

This is a SMALL CORRECTIVE ACTION.

Do NOT:

- redesign the OpenCode toolbar;
- redesign ProjectSelector;
- redesign Recent Projects;
- modify the OpenCode runtime;
- modify CLI spawning;
- modify `cwd` behavior;
- modify `allowedRoots`;
- modify Google Drive execution;
- add new Drive tools;
- change model selection;
- change mode selection;
- change MCP configuration;
- change project CRUD;
- change session architecture;
- create a new workspace system;
- remove `settings.workspacePath` from the application;
- repeat TASK-054/055 architecture discovery;
- re-audit TASK-055;
- create another task.

Only correct the two confirmed UI issues:

1. remove the legacy Workspace selector from the OpenCode toolbar;
2. restore Recent Projects visibility in the existing Project selector.

---

# 6. VALIDATION

Verify the actual UI, not only source code.

Minimum scenarios:

1. Open New Chat.
2. Confirm only one path/project selector is visible.
3. Confirm it shows `No project`.
4. Open Project selector.
5. Confirm Recent Projects are visible when available.
6. Select a recent Local project.
7. Confirm the selected project is displayed.
8. Open a different existing session.
9. Confirm its own project is restored.
10. Open a Drive project session if available.
11. Confirm its project is restored.
12. Confirm no legacy `alpha-one` Workspace selector appears anywhere in the OpenCode toolbar.

Also verify that no TASK-055 execution behavior was modified.

---

# 7. EVIDENCE REQUIREMENTS

Record:

- exact files changed;
- before/after UI evidence;
- New Chat project state;
- Recent Projects visibility;
- existing-session project restoration;
- confirmation that the legacy Workspace selector is no longer rendered;
- validation that TASK-055 project execution wiring remains untouched.

Classify findings as:

- PROVEN
- DERIVED
- UNPROVEN
- UNKNOWN
- INSUFFICIENT_EVIDENCE

Do not claim PASS based only on source inspection if the UI can be directly verified.

---

# 8. VERDICT

Final verdict must be one of:

`PASS`

or

`FAIL`

`PASS` requires all acceptance criteria to be verified.

---

# 9. EXECUTION SUMMARY

Complete the execution summary on this same task file.

Include:

- files changed;
- corrective action performed;
- validation performed;
- evidence;
- final verdict.

Input your execution summary on the same task file.

---

# 10. GIT

Only after implementation and validation:

- show `git status`;
- show `git diff --stat`;
- show current branch;
- commit the corrective change to the current feature/worktree branch.

Do not create unrelated changes or commits.

---

# 11. EXECUTION SUMMARY

## A. Files Changed

1. `src/features/ai/opencode/components/opencode-toolbar.tsx` — removed the legacy Workspace Path popover (trigger button showing `alpha-one`, read-only path Input, `Runtime-detected. Cannot be overridden manually.` hint, optional workspace list); removed now-unused imports (`FolderOpen`, `Input`, `Label`, `Popover/*`) and store destructures (`workspaces`, `selectWorkspace`). `settings`, model/mode/variant selectors, UsageIndicator, New Chat, Settings, and the TASK-055 `ProjectSelector` binding are untouched.
2. `src/features/ai-assistant/components/project-selector.tsx` — added a **Recent Projects** fast-track section inside the dropdown (most-recent 5 by `createdAt`, same recency rule as the OpenCode page empty state), rendered above the remaining projects under an `All Projects` header. Same `ProjectRow`, same select/delete behavior. No new persistence, no new component, no redesign.
3. `spint/TASK-OPENCODE-056-SCR1 — Remove Legacy Workspace Selector & Restore Recent Projects.md` — this file.

No execution/runtime files changed: `server.ts`, `http-transport.ts`, `opencode-service.ts`, `opencode-store.ts` (execution paths), `types.ts`, `opencode-page.tsx` are untouched by this task (verified by `git diff` — only pre-existing unrelated `runtime.ts` working-tree edits exist).

## B. Corrective Action Performed

- **A (remove legacy selector)**: the user-facing Workspace Path popover is gone from the OpenCode toolbar. The underlying `settings.workspacePath` state, its runtime sync (`loadWorkspaces`/`detectWorkspace`), the store `selectWorkspace` action, and the Settings page display are all **unchanged** — only the toolbar rendering was removed.
- **B (single project control)**: the TASK-055 `ProjectSelector` remains the only path/project control in the toolbar, still supporting No project / Local Folder / Google Drive Folder / session restoration / Recent selection.
- **C (Recent Projects in selector)**: the selector dropdown now lists recent projects as selectable fast-track rows. Drive projects keep their stored folder ID as `contextPath` (identity preserved); the human-readable label is displayed.

## C. Validation — Toolbar / Selector (Playwright, real `http://localhost:3000/ai/opencode`, Dev Mode OFF)

Seeded 2 projects (SMS.ID local, Wonderland Store Drive) + 3 sessions (local, Drive, empty).

- Toolbar scan: exactly **1** path/project selector button; toolbar text contains NO `Workspace`, NO `alpha-one`, NO `Runtime-detected` — `PASS` (AC-01).
- New Chat: project `null`, selector label `No project` — `PASS` (AC-02).
- Open Project selector dropdown: `Recent Projects` header visible; `SMS.ID` and `Wonderland Store` both listed; Drive row shows `Google Drive / Wonderland Store` (label) while the stored identity remains the folder ID; no `All Projects` section (2 projects, all recent); no `Workspace`/`alpha-one` text — `PASS` (AC-03, AC-06).
- Selected recent Local project SMS.ID → selector displays `SMS.ID`; persisted `chat.project = { id, name:'SMS.ID', path:'…\sms-id-project', label: same, type:'local' }` — `PASS` (AC-05).
- Existing sessions restore their own project: Session A → `SMS.ID`, Session B → `Wonderland Store`, Session C → `No project` — `PASS` (AC-04).
- Settings page (`/ai/opencode/settings`) still shows `Workspace Path` + `Runtime-detected. Cannot be overridden manually.` — unchanged, out of scope, intact.

## D. Validation — TASK-055 Execution Wiring Untouched

- `git diff HEAD -- src/services/opencode/ src/features/ai/opencode/services/ src/features/ai/opencode/store/opencode-store.ts src/features/ai/opencode/types.ts src/features/ai/opencode/components/opencode-page.tsx` → only pre-existing unrelated `runtime.ts` edits; **no execution file changed** by this task — `PROVEN` by diff.
- Runtime spot check (real agent run): New Chat → picked recent SMS.ID → "List the files in this project, then create agent-test-056.txt containing 'TASK-056 SCR1 OK'". Result: chat.project set (local), agent created the file **inside** `…\sms-id-project` (`fileCreated: true`), **not** in the app root (`leakedToAppRoot: false`); server log `PROCESS SPAWNED { pid: 14244, cwd: 'C:\\Users\\ASUS\\AppData\\Local\\Temp\\opencode\\sms-id-project' }` — the TASK-055 local execution root (CLI `cwd`) is intact — `PASS` (AC-07).

## E. Static Checks

- `npx tsc --noEmit` — clean.
- `npx eslint src/features/ai/opencode/components/opencode-toolbar.tsx src/features/ai-assistant/components/project-selector.tsx` — clean.

## F. Evidence Classification

- `PROVEN`: only-one-selector rendering (DOM scan); absence of `Workspace`/`alpha-one`/`Runtime-detected` text in the toolbar and dropdown; Recent Projects section with both projects; selectable recent Local project persists `type`/`path`/`label`; per-session restore (local / Drive / none); Drive folder identity preserved (label shown, folder ID in `path`); TASK-055 spawn `cwd` + on-disk file location (runtime run); execution files unchanged (`git diff`).
- `DERIVED`: the legacy workspace selector's disappearance does not affect `settings.workspacePath` state or the Settings page (kept by design per §2A).
- `UNPROVEN`: none required.
- `UNKNOWN`/`INSUFFICIENT_EVIDENCE`: none blocking.

## G. Final Verdict

`PASS`

All acceptance criteria verified on the actual UI: the OpenCode toolbar now shows a single path/project selector (no legacy `alpha-one` / Workspace selector), New Chat starts `No project` with no inheritance, the Project selector exposes Recent Projects as a fast-track (Drive folder identity preserved), existing sessions restore their own project, Local and Drive project display is intact, and a real agent run confirmed the TASK-055 execution root (CLI `cwd` = project dir; file created in the project, none in the app root). `tsc` + `eslint` clean; no execution/runtime source modified; no unrelated changes.