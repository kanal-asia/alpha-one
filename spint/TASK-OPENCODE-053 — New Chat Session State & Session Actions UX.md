# TASK-OPENCODE-053 — New Chat Session State & Session Actions UX

## Type

UX / Session-State Corrective Rework

## Status

COMPLETED — PASS (2026-08-19)

---

# 23. EXECUTION SUMMARY

## A. Initial State Audit

- Traced `New Chat` click → `newChat()` in `src/features/ai/opencode/store/opencode-store.ts` → `makeChat()` → `set({ chats, activeChatId })`. State initialization comes from zustand + localStorage (`alpha-one:opencode-chats`, `alpha-one:opencode-settings`, `alpha-one:projects`, `alpha-one:active-project`).
- Traced session selection → `selectChat(id)` → `set({ activeChatId })` (no restoration of per-session model/project — they live on the `Chat` object).
- Traced execution request → `sendMessage()` → `resolveRuntimeModel(models, settings.defaultModel)`; mode from `settings.defaultMode` (global); context is derived per-message; `sessionId` per-chat.
- Found **two model selectors** writing the global setting: the OpenCode toolbar `ModelSelector` and the Settings page default-model select (`settings-page.tsx:316`). The Settings page select is the legitimate "configured default"; the toolbar select was the leak source.
- UI geometry audit found the session-list rows were laid out at their **max-content width (~1274px)** inside the Radix `ScrollArea` viewport (271px), clipped by the `w-72 overflow-hidden` aside — the action buttons rendered at x≈1506, outside the visible sidebar.

## B. Session State Ownership

- `messages`, `project`, `model` (new), `sessionId`, `usage` → **session-scoped** (on `Chat`, persisted in localStorage).
- `settings.defaultModel`, `settings.defaultMode`, `settings.defaultVariant`, `workspacePath` → **workspace/global** (`OpenCodeSettings`, persisted). Mode is global by established architecture (task explicitly leaves it).
- `useProjectStore.activeProject` + `projects` → **workspace/global** (persisted, shared with the Assistant feature).
- `INTENDED_DEFAULT_MODEL` (`opencode/deepseek-v4-flash-free`) → application default when the configured default is empty/invalid (`loadModels`).
- Per task §2: global state (mode, configured default model, global project list) remains global — NOT redesigned.

## C. Root Cause — Project

`PROVEN` (source): `makeChat()` stamped `project: activeProjectContext()` — a snapshot of the **workspace-global** `useProjectStore.activeProject` onto every new chat. Additionally `sendMessage` did `project: c.project ?? activeProjectContext()`, re-attaching the global active project on the first message of a project-less chat. So a New Chat visibly inherited the same project as the previous session. Fix: `makeChat()` creates project-empty; `sendMessage` preserves the chat's own project only (no auto-attach). `chat.project` is display-only (not sent to the runtime), so the correction is pure UI/state isolation.

## D. Root Cause — Model

`PROVEN` (source): the toolbar `ModelSelector.onSelect` wrote `settings.defaultModel` (the GLOBAL configured default). Selecting a model in any session mutated the global setting, so `New Chat → makeChat → sendMessage` used the last-selected model instead of the configured default. Fix: added a per-session `Chat.model`; the toolbar selector now binds to `activeChat.model ?? settings.defaultModel` and writes ONLY the active chat (`setActiveChatModel`). `sendMessage` resolves `chat.model ?? settings.defaultModel`. The Settings-page select remains the source of the configured default. No provider/model config, no new selection system.

## E. Root Cause — Session Actions

`PROVEN` (source + runtime): actions were NOT structurally clipped by flexbox (the trigger Button already carries `shrink-0`, title is `min-w-0 flex-1`). The real defect: the Radix `ScrollArea` viewport did not constrain its block children to the viewport width — the `ul`/rows laid out at **max-content** (~1274px; `width:100%` resolved to the max-content containing block, verified by probing inline `width`/`max-width`), pushing the pinned action buttons out of the `overflow-hidden w-72` aside (button at x≈1506, aside right edge 544) → actions visually disappeared/clipped. Second factor: the trigger was `opacity-0 group-hover:opacity-100` (hover-only). Fix: replaced the ChatSidebar Radix `ScrollArea` with a plain `overflow-y-auto` container (constrains children correctly), added `w-full min-w-0` to the list, made the trigger always-visible and `shrink-0`. `DERIVED`: title truncation now works because the row is finally width-constrained.

## F. Implementation

Files changed (5 source + task file):

1. `src/features/ai/opencode/types.ts` — added `model?: string` to `Chat` (per-session model override; `undefined` = configured default).
2. `src/features/ai/opencode/store/opencode-store.ts` — `makeChat()` project-empty; removed `activeProjectContext`; `sendMessage` no auto-attach + uses `chat.model ?? settings.defaultModel`; new actions `setActiveChatModel` / `setActiveChatProject` (active chat only, persisted); `newChat()` now persists the created chat (was never saved — a fresh New Chat disappeared on reload).
3. `src/features/ai/opencode/components/opencode-toolbar.tsx` — ModelSelector bound to the active session's effective model; selecting writes the chat's model (variant reset stays global). `markModelUsed` already called inside `ModelSelector.handleSelect`.
4. `src/features/ai/opencode/components/opencode-page.tsx` — StatusIndicator uses the session's effective model; `Recent Projects` fast track added to the empty state (existing `useProjectStore().projects`, most-recent 5, "Use project"); sidebar widened `w-64 → w-72`.
5. `src/features/ai/opencode/components/chat-sidebar.tsx` — plain scroll container instead of Radix `ScrollArea`; `w-full min-w-0` list; actions always visible + `shrink-0` (hover-only removed).

No MCP / provider / model routing / OAuth / project-management changes. No new mode.

## G. New Chat Runtime Test

Playwright, real `http://localhost:3000/ai/opencode`, Developer Mode OFF. Seeded: global active project P1, configured default `opencode/deepseek-v4-flash-free`, an existing session (project P2, model `opencode-go/deepseek-v4-flash`, 1 message), and a very long-title session.

- New Chat → messages empty (empty state rendered) — `PASS`.
- Project empty ("No project" row) — `PASS`; persisted `hasProject:false`.
- `Recent Projects` section visible with both projects — `PASS`.
- Model trigger = configured default (`DeepSeek V4 Flash Free`), NOT the previous session's (`DeepSeek V4 Flash`/Paid) — `PASS`; persisted `hasModel:false`.
- No session-specific state inherited; global active project NOT stamped — `PASS`.

## H. Recent Projects Runtime Test

From New Chat, selected recent project P1 "Alpha One Workspace":
- New session row updated to P1 — `PASS`; persisted `project.id === 'proj-1'`.
- Previous session untouched (still P2 / `proj-2` in localStorage) — `PASS`.
- Model stayed at configured default after project pick — `PASS`.

## I. Session Action Runtime Test

- Rename (prompt dialog → accepted "Judul Setelah Rename 053") updated the row — `PASS`.
- Archive moved the row to Archived (1) — `PASS`.
- Delete removed the target chat via the confirmation dialog — `PASS`.
- Long-title row: title span `scrollWidth=1240 client=223` → **truncates** — `PASS`.
- Action trigger present on every row, computed `opacity=1` (always visible, not hover-gated) — `PASS`.
- Action bounding box fully inside the row/aside (`optRight=527 ≤ asideRight=544`) — `PASS` (no clipping).

## J. Responsive/Width Test

- Sidebar is fixed-width (not user-resizable); tested at the minimum supported md viewport (820px): sidebar visible, actions visible and inside the aside — `PASS`.
- Wider (1600px): row width 271px (sidebar still w-72, title gets its full budget), actions pinned + visible — `PASS`. Widening to `w-72` (288px, from 288 not incl. main nav offset) gave titles more room while the action area stayed structurally protected (`shrink-0`, always visible).

## K. Regression Check

- Existing session (project + model + messages) fully intact after New Chat and after recent-project selection (localStorage unchanged for that chat) — `PASS`.
- Model isolation: picking "Big Pickle" in a session changed ONLY that chat's `model` (`opencode/big-pickle`); `settings.defaultModel` stayed `opencode/deepseek-v4-flash-free`; a subsequent New Chat showed the configured default — `PASS`.
- `tsc --noEmit` clean; `eslint src/features/ai/opencode` clean. No MCP/Sheets suites rerun (out of scope per §17).

## L. Evidence Classification

- `PROVEN`: project inheritance (makeChat snapshot + sendMessage auto-attach); model inheritance (toolbar mutating global defaultModel); action clipping (max-content layout escaping the Radix viewport, verified via runtime geometry probes); all runtime behaviors (Tests A–F, 28/28 UI assertions + model-isolation probe).
- `DERIVED`: title truncation now functions because the row is width-constrained; always-visible actions remain discoverable for keyboard/touch users.
- `UNPROVEN`: none required for this task's conclusions.
- `UNKNOWN`/`INSUFFICIENT_EVIDENCE`: none blocking.

## M. Files Changed

- `src/features/ai/opencode/types.ts`
- `src/features/ai/opencode/store/opencode-store.ts`
- `src/features/ai/opencode/components/opencode-toolbar.tsx`
- `src/features/ai/opencode/components/opencode-page.tsx`
- `src/features/ai/opencode/components/chat-sidebar.tsx`
- `spint/TASK-OPENCODE-053 — New Chat Session State & Session Actions UX.md`

## N. Out-of-Scope Findings

- The `/ai/assistant` page (`assistant-chat-page.tsx`) still binds its `ModelSelector` to the global `settings.defaultModel` and uses `ProjectSelector`. This is a separate feature sharing the same store; it was NOT changed (documented only). Its model select acts as a configuration action (equivalent to the Settings page), which the task permits.
- The app's main left navigation and the assistant page's sidebar remain `w-64`; only the OpenCode page sidebar was widened to `w-72` (scope-limited).
- `newChat()` previously never persisted the created chat (a fresh New Chat was lost on reload). Fixed within the New Chat handler (in-scope); noted here for completeness.

## O. Final Verdict

`PASS`

All 24 acceptance criteria met: New Chat is a genuinely fresh session (empty messages, empty project, configured/default model, no previous-session leakage); Recent Projects fast track works and mutates only the new session; Rename/Archive/Delete remain accessible, always visible, pinned, and unaffected by title length or sidebar width (the underlying containment defect — Radix ScrollArea letting rows escape to max-content and clipping actions — was proven and fixed); long titles truncate; sidebar widened modestly for usability. No new mode, no MCP/provider/model-system/project-management redesign, no unrelated changes; actual UI behavior verified (28/28 + model-isolation probes); execution summary recorded.

## Scope

New Chat session initialization + session-list action visibility.

---

# 1. OBJECTIVE

Correct two concrete UX/state problems in Alpha Workspace OpenCode:

1. `New Chat` currently appears to retain session-specific state from the previous conversation, especially Project and Model.
2. Session actions such as Rename / Archive / Delete can disappear or become clipped because the sidebar/session-item layout gives insufficient protected space to the action area.

The intended behavior is:

### New Chat

When the user selects `New Chat`:

- conversation messages start empty;
- Project starts empty;
- the UI presents `Recent Projects` as a fast-track selection;
- Model starts from the configured/default model;
- session-specific state from the previous chat must not be accidentally inherited;
- existing global/workspace state may remain only where the existing architecture explicitly defines it as global.

### Session List

For each session item:

- Rename remains accessible;
- Archive remains accessible;
- Delete remains accessible;
- action controls remain pinned to the right side;
- long session titles truncate rather than pushing/clipping action controls;
- sidebar width may be increased to provide better usability;
- changing sidebar width must not be the mechanism that determines whether actions are visible.

---

# 2. USER-DESIGN DECISION

The following decisions are authoritative for this task.

## New Chat Project

Do NOT automatically inherit the previous session's Project.

Initial New Chat state:

`Project = empty`

Provide:

`Recent Projects`

as a fast-track selection mechanism.

This allows:

`New Chat → choose recent project → continue`

without forcing the user to manually browse for a project every time.

If the user does not select a project, the chat remains project-empty.

---

## New Chat Model

Do NOT inherit the previous session's selected model.

Initial state:

`Model = configured/default model`

Use the existing application default.

Do not create a new model-selection system.

Do not hard-code a new model.

Do not change provider/model configuration.

---

## New Chat Mode / Other State

Do not blindly reset or inherit every field.

First determine from the existing implementation which state is:

- session-scoped;
- workspace/global-scoped;
- application-default.

Session-specific state must not leak from the previous session.

Global/workspace state should remain global if that is already the established architecture.

Do not redesign this architecture.

---

# 3. SESSION-STATE AUDIT BEFORE CHANGE

Before implementation, inspect the current state flow.

Determine where the following values originate and how they are persisted/restored:

- session ID;
- messages;
- project;
- model;
- mode;
- context;
- provider;
- execution state;
- any other state directly used to initialize OpenCode execution.

Trace:

`New Chat click → session creation/reset → state initialization → UI rendering → execution request`

Also trace:

`existing session selection → state restoration`

The purpose is to prove the actual source of the leakage before modifying code.

Do not assume that all visible controls are session-scoped.

---

# 4. REQUIRED ROOT-CAUSE CLASSIFICATION

Classify each finding as:

- PROVEN
- DERIVED
- UNPROVEN
- UNKNOWN
- INSUFFICIENT_EVIDENCE

At minimum establish:

### A. Project inheritance

Is the previous project's value being reused because it is:

- persisted on the new session;
- copied from active session;
- inherited from workspace state;
- merely displayed incorrectly?

### B. Model inheritance

Determine whether the model is:

- copied from previous session;
- stored as a global UI preference;
- loaded from application default;
- restored through another mechanism.

### C. Session action clipping

Determine whether action controls are:

- conditionally hidden;
- clipped by overflow;
- pushed outside the visible item;
- rendered only on hover;
- hidden because the sidebar is too narrow;
- otherwise unavailable.

Do not fix a layout problem by guessing.

---

# 5. NEW CHAT UX

Implement the smallest correction required to produce this behavior:

```text
User clicks New Chat
        ↓
Create/reset a genuinely new session
        ↓
Messages = empty
Project = empty
Model = configured/default model
Session-specific execution state = fresh
        ↓
Show Recent Projects
        ↓
User may select a recent project
        ↓
Continue with the newly selected project
```

The Recent Projects UI should use existing project data/state if already available.

Do not create a separate project-management system.

Do not add a new database entity unless existing architecture requires it.

---

# 6. RECENT PROJECTS

The fast-track project selection should:

* show recent/relevant existing projects;
* allow the user to select one;
* update the new session's project selection;
* not mutate the previous session;
* not automatically select the previous session's project.

If the existing application already has a recent-project source, reuse it.

If no recent-project source exists, inspect existing project data before deciding on a minimal implementation.

Do NOT redesign project management in this task.

---

# 7. DEFAULT MODEL

New Chat must initialize from the existing configured/default model.

Required behavior:

```text
Previous session:
Model = X

New Chat:
Model = application default
```

If X happens to equal the default, this is still correct.

Do not use the previous session as the source of truth for the new chat's model.

Do not modify provider configuration.

---

# 8. SESSION ACTION VISIBILITY

Inspect the current session-item component and sidebar layout.

The action area must be structurally protected from title overflow.

Desired layout:

```text
┌──────────────────────────────────────────────┐
│ Session title that may truncate          ⋯   │
│ Project / metadata                            │
└──────────────────────────────────────────────┘
```

The title/content area may shrink.

The action area must not shrink away.

Conceptually:

```text
[ flexible session content ............ ][ actions ]
```

not:

```text
[ session content + actions all inside one
  shrinking text region ]
```

---

# 9. ACTION CONTROLS

Existing actions must remain functional:

* Rename
* Archive
* Delete

Do not redesign their underlying behavior.

Do not add new session actions.

Do not change confirmation semantics unless the current implementation is demonstrably broken as part of this task.

The correction is primarily:

`visibility + layout + interaction availability`

---

# 10. SIDEBAR WIDTH

Improve sidebar usability so session titles have reasonable space.

The sidebar may be widened if the current width is objectively too constrained.

However:

> Sidebar width is a usability improvement, NOT the primary mechanism for preserving actions.

Even at the minimum supported sidebar width:

* action controls must remain available;
* title may truncate;
* action area remains pinned.

Do not make the sidebar excessively wide.

Do not redesign the entire application navigation.

---

# 11. NO NEW "MARKETING MODE"

Do NOT introduce:

* Marketing Mode;
* User Mode;
* non-developer mode;
* new persona modes;
* additional mode selectors.

The application already has its existing Developer Mode concept.

This task must not introduce another mode.

---

# 12. EXISTING UI LANGUAGE

Preserve the existing Alpha Workspace terminology.

Do not introduce unnecessary terminology such as:

* "workspace mode";
* "marketing mode";
* "operator mode";
* "business mode";

unless those concepts already exist in the codebase.

The only new UX concept explicitly required by this task is:

`Recent Projects`

---

# 13. IMPLEMENTATION BOUNDARY

Expected areas to inspect:

* OpenCode session state management;
* New Chat handler/component;
* session creation/reset logic;
* model initialization logic;
* project selection state;
* session-list item component;
* sidebar layout/container;
* session action controls.

Do not modify unrelated OpenCode execution logic.

Do not modify:

* Google Sheets MCP;
* Google Drive MCP;
* provider implementation;
* model routing;
* Google OAuth;
* unrelated workspace navigation.

---

# 14. REAL UI VALIDATION

Use:

`http://localhost:3000/ai/opencode`

Validate from the actual UI.

## Test A — Existing session

Start with an existing session containing:

* selected project;
* selected model;
* existing messages.

Confirm the existing session remains unchanged.

## Test B — New Chat

Click:

`New Chat`

Verify:

* no old messages;
* Project is empty;
* Recent Projects is available;
* Model is the configured/default model;
* no accidental previous-session project/model inheritance.

## Test B — New Chat

Click:

`New Chat`

Verify:

* no old messages;
* Project is empty;
* Recent Projects is available;
* Model is the configured/default model;
* no accidental previous-session project/model inheritance.

## Test C — Recent Project fast track

From New Chat:

1. select a Recent Project;
2. verify the new session now uses that project;
3. verify the previous session is unchanged.

## Test D — Session actions

With long session titles:

* Rename visible;
* Archive visible;
* Delete visible.

Test at the current/default sidebar width.

## Test E — Narrow sidebar

If the UI supports resizing:

* reduce sidebar width;
* verify action controls remain visible;
* verify title truncates instead.

## Test F — Wider sidebar

Increase sidebar width.

Verify:

* title gets more available space;
* action controls remain pinned;
* layout remains stable.

---

# 15. STATE-ISOLATION VALIDATION

Explicitly verify:

```text
Old Session
Project = A
Model = X

New Chat
Project = empty
Model = DEFAULT
```

Then:

```text
New Chat
select Recent Project B

Old Session
Project = A

New Session
Project = B
```

The old session must not be mutated.

If model default happens to equal X, record that fact rather than incorrectly claiming the model was inherited.

---

# 16. SESSION ACTION VALIDATION

Use at least one deliberately long session title.

Verify that:

* text truncates;
* actions remain visible;
* actions remain clickable;
* no horizontal clipping occurs;
* no action depends on title length.

If the actions are intentionally hover-only in the existing design, preserve that interaction pattern provided they remain reliably discoverable and accessible.

Do not invent a different interaction model unless required to fix the proven defect.

---

# 17. REGRESSION BOUNDARY

Verify only the affected behavior:

* New Chat;
* project selection;
* default model initialization;
* session selection;
* Rename;
* Archive;
* Delete;
* sidebar layout.

Do not rerun unrelated historical MCP or Google Sheets test suites.

---

# 18. ACCEPTANCE CRITERIA

PASS requires:

### New Chat

1. New Chat creates/resets a genuinely new session.
2. Previous messages are not carried into the new session.
3. Project starts empty.
4. Recent Projects are available as a fast-track selection.
5. Selecting a recent project applies it only to the new session.
6. Previous session project remains unchanged.
7. Model initializes from the configured/default model.
8. Previous session model is not used as the initialization source.
9. No session-specific state leaks unintentionally.
10. Existing global/workspace state remains intact where architecturally appropriate.

### Session Actions

11. Rename remains accessible.
12. Archive remains accessible.
13. Delete remains accessible.
14. Long titles truncate rather than hide actions.
15. Action controls remain pinned/protected.
16. Actions remain visible at the supported sidebar width.
17. Wider sidebar provides additional title space without changing action behavior.

### Scope

18. No new mode was introduced.
19. No MCP changes.
20. No provider/model system redesign.
21. No project-management redesign.
22. No unrelated source changes.
23. Actual UI behavior was tested.
24. Execution summary is recorded in this task file.

---

# 19. EVIDENCE REQUIREMENTS

For every major finding report:

### PROVEN

Observed directly from source/runtime/UI evidence.

### DERIVED

Reasoned from proven architecture.

### UNPROVEN

Not tested sufficiently.

### UNKNOWN

Architecture/source does not establish it.

### INSUFFICIENT_EVIDENCE

Evidence exists but is insufficient for a conclusion.

Do not convert a visual symptom into a code root cause without tracing it.

---

# 20. EXECUTION SUMMARY

Write the execution summary into this same task file.

Use:

## A. Initial State Audit

## B. Session State Ownership

## C. Root Cause — Project

## D. Root Cause — Model

## E. Root Cause — Session Actions

## F. Implementation

## G. New Chat Runtime Test

## H. Recent Projects Runtime Test

## I. Session Action Runtime Test

## J. Responsive/Width Test

## K. Regression Check

## L. Evidence Classification

## M. Files Changed

## N. Out-of-Scope Findings

## O. Final Verdict

Use exactly one:

`PASS`

`PASS WITH LIMITATION`

`FAIL`

---

# 21. SCOPE DISCIPLINE

This task has TWO concrete objectives only:

1. New Chat session state isolation + Recent Projects fast track.
2. Session action visibility + sidebar width/layout correction.

Do not use this task to:

* redesign OpenCode;
* redesign the workspace;
* redesign project management;
* redesign model selection;
* redesign session persistence;
* add new agent capabilities;
* refactor unrelated components;
* clean up unrelated technical debt.

If an unrelated issue is discovered:

`document it under Out-of-Scope Findings`

and do not implement it.

---

# 22. FINAL PRINCIPLE

The intended UX model is:

```text
NEW CHAT
    ↓
Fresh session
    ├── Project: empty
    ├── Recent Projects: available
    ├── Model: configured/default
    └── Session-specific state: fresh

SESSION LIST
    ↓
Flexible content + protected actions
    ├── Title: may truncate
    ├── Rename: always accessible
    ├── Archive: always accessible
    └── Delete: always accessible
```

The key principle is:

> **New Chat starts fresh, while still providing fast access to Recent Projects.**

And:

> **Content may shrink; session actions must not disappear.**

Input your execution summary on the same task file