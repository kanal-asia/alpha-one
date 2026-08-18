# TASK-OPENCODE-050-SCR2 — Runtime Activity Timeline UX Correction

## Type

Small Corrective Rework

## Parent

TASK-OPENCODE-050

## Status

COMPLETED — PASS (2026-08-18)

---

# 1. OBJECTIVE

Correct the remaining Runtime UX issues discovered through real Alpha Workspace human testing.

TASK-050-SCR successfully corrected the semantic wording:

`Memproses permintaan...`

into:

`Sedang bekerja...`

However, real UI observation shows two remaining issues:

1. The persistent working indicator still contains a small visual activity/bar element that feels like a terminal artifact and visually distracts from the actual execution activity.
2. The visible changing list of actions is semantically closer to an execution timeline than a Todo/Plan list, but the current presentation makes it appear as though the agent is continuously generating or replacing a Todo list.

This task must correct both issues without redesigning the runtime architecture.

---

# 2. HUMAN TEST EVIDENCE

Real screenshots from Alpha Workspace show execution activity changing over time:

- Membaca data
- Memeriksa struktur spreadsheet
- Membuat sheet
- Menulis data
- Menambahkan rumus
- Memformat sel

The screenshots were captured at multiple points during the same execution.

The visible list changes as the agent progresses.

This is useful behavior.

The problem is the presentation and semantic model.

---

# 3. IMPORTANT PRODUCT DECISION

The visible runtime list must be treated as:

## EXECUTION ACTIVITY

It answers:

> "Apa yang sedang dilakukan agent dan apa yang baru saja selesai?"

It is NOT automatically:

## TODO / PLAN

A Todo/Plan represents intended work.

An Execution Activity represents actual runtime work.

Do not mix these concepts.

---

# 4. REQUIRED UX MODEL

During execution, the primary visible activity should communicate:

```text
✓ Membaca data Laporan Penjualan
✓ Membuat sheet "Ringkasan Penjualan Juli"
✓ Menulis data
● Menambahkan rumus
```

The currently active action should be visually distinguishable from completed actions.

The activity list should evolve naturally as execution progresses.

It must NOT appear as if the agent is repeatedly replacing its Todo list.

---

# 5. PERSISTENT WORKING INDICATOR

TASK-050-SCR already changed the semantic label to:

`Sedang bekerja...`

Keep this semantic meaning.

However, improve its visual representation.

The current small bar/cursor-like element below the status is visually distracting.

Do NOT merely change:

black → gray

or reduce opacity.

That does not solve the UX problem.

---

# 6. PREFERRED VISUAL DIRECTION

Replace the static/minimal working indicator with a subtle animated activity indicator.

The intended visual language is similar to:

```text
1 → 2 → 3 → 4 → 5 → 6 → 7 → ...
```

or a compact animated sequence/progress motion.

It should communicate:

> "The agent is actively working."

It should NOT communicate:

> "The terminal is waiting."

The implementation does NOT need to be an actual GIF asset.

Prefer native UI/CSS animation where possible.

Requirements:

* lightweight;
* smooth;
* subtle;
* no flashing;
* no excessive movement;
* no terminal-looking cursor/bar;
* accessible;
* does not dominate the activity timeline.

The animation must stop when execution stops.

---

# 7. RUNTIME STATE

The animation must be connected to actual runtime state.

### RUNNING

Show:

`[animated activity] Sedang bekerja...`

### COMPLETED

Stop animation.

Show the existing completion state.

### FAILED

Stop animation.

Show the existing failure state.

### INTERRUPTED

Stop animation.

Show the existing interrupted state.

Do not animate indefinitely after execution has ended.

---

# 8. EXECUTION ACTIVITY SEMANTICS

Audit the current implementation to determine where the visible action list originates.

Determine whether it currently comes from:

* Todo state;
* planning state;
* lifecycle events;
* tool events;
* streamed messages;
* another execution-state abstraction.

Do not assume.

Record the evidence.

If the current data source is already an execution/lifecycle event stream, preserve it and correct only its presentation.

If it is incorrectly using Todo/Plan state as a proxy for execution activity, make the smallest safe correction so the UI represents actual execution events.

---

# 9. CRITICAL DISTINCTION

Do NOT create a fake Todo system.

Do NOT force every tool call into a Todo.

Do NOT convert every execution event into a planning item.

The UI should be able to show:

```text
✓ Membaca metadata spreadsheet
✓ Membaca data Laporan Penjualan
● Membuat sheet "Ringkasan Penjualan Juli"
```

without implying:

```text
Todo #1
Todo #2
Todo #3
```

unless a genuine Todo/Plan exists.

---

# 10. ACTIVITY RETENTION

The activity timeline should remain useful while the agent is working.

Do not allow every new event to make the UI visually jump or completely replace the previous context.

Prefer:

```text
✓ Step completed
✓ Step completed
✓ Step completed
● Current step
```

with sensible limits if the event list becomes very long.

If the existing implementation already has a bounded activity list, preserve that behavior unless evidence shows it is causing the issue.

Do not introduce unnecessary virtualization or architectural changes.

---

# 11. ACTIVE STEP

The currently executing activity should be visually distinguishable from completed activities.

Example:

```text
✓ Membaca data
✓ Membuat sheet
✓ Menulis data
● Menambahkan rumus...
```

The active step may use a subtle animated indicator.

Completed steps should remain visually stable.

Avoid making all steps animate.

---

# 12. DEVELOPER MODE

There is only:

`Developer Mode ON / OFF`

Do NOT create:

`Marketing Mode`

Do not introduce any additional product mode.

### Developer Mode OFF

Prioritize concise human-readable activity:

`Membaca data`

`Membuat sheet`

`Menulis data`

`Memformat sel`

### Developer Mode ON

Existing developer-oriented details may remain available.

Do not redesign Developer Mode as part of this corrective.

---

# 13. NO PRIVATE REASONING

Do not expose chain-of-thought.

The activity timeline must represent observable execution events only.

Do not expose:

* hidden reasoning;
* private model thoughts;
* internal deliberation;
* chain-of-thought;
* hidden planning text.

---

# 14. AUDIT BEFORE IMPLEMENTATION

Before modifying code:

1. Locate the runtime activity component.
2. Locate the current `Sedang bekerja...` indicator.
3. Locate the small bar/cursor/activity element below it.
4. Identify the state/data source controlling the visible activity list.
5. Determine whether the list is sourced from Todo/Plan state or actual lifecycle/execution events.
6. Determine how active/completed states are currently represented.
7. Identify the smallest safe correction.

Do not redesign the execution architecture.

### AUDIT RESULTS (2026-08-18, `src/features/ai/opencode/components/chat-message.tsx`)

1. **Runtime activity component:** `LiveProgress` (streaming, once tool events exist) and `ProgressIndicator` (streaming fallback before tool events). Both are inside the `isStreaming &&` block in `ChatMessageView` (line 366).
2. **`Sedang bekerja...` indicator:** the last line of `LiveProgress` (lines 203-210) and `ProgressIndicator` (lines 226-233).
3. **Small bar/cursor/activity element:** the **three bouncing dots** (`<span class='...animate-bounce rounded-full bg-current'...>`, 3 spans with staggered `animation-delay`) — `LiveProgress` lines 204-208, `ProgressIndicator` lines 228-230. This is the terminal-like artifact.
4. **Data source controlling the visible activity list:** `message.toolEvents` (from `tool_use` events) + `message.lifecycle` (LifecycleStage). Both are pushed from the runtime event stream via `http-transport.ts` → `opencode-store.ts`. The `TodoPlan` sub-component renders `message.plan` (real `todowrite` input) **only when a genuine plan exists** — it is NOT the source of the visible activity list.
5. **Todo/Plan vs execution events:** the activity list is sourced from **actual execution/lifecycle events** (tool_use + lifecycle stages), NOT Todo/Plan state. PROVEN.
6. **Active vs completed representation:** completed tools = `✓` (green Check) + label (lines 186-195); failed = `⚠`; current action = `●` + `currentAction` line (197-200). Since the CLI emits `tool_use` already `completed`, the "active" event is rarely `running` — the current action is derived as the last tool label + `…`.
7. **Smallest safe correction:** replace the bouncing-dots indicator with a subtle native-CSS animated activity indicator; keep the ✓/●/⚠ activity list (already execution-event sourced); make the active step visually distinct; ensure animation only while streaming. No architecture change.

### §15 ROOT-CAUSE CLASSIFICATION

- `PROVEN` — the visible activity list is sourced from actual execution/lifecycle events (`toolEvents` + `lifecycle`), not Todo/Plan state (`TodoPlan` is separate and only renders when a real plan exists).
- `PROVEN` — the persistent working indicator contains a terminal-like visual element (three `animate-bounce` dots) that remains visible while streaming; it reads as a cursor/waiting artifact rather than an activity animation.
- `PROVEN` — the activity list evolves from real events; the issue is presentation (bouncing dots + the list reading like a plan checklist), not the data source.

---

# 15. ROOT-CAUSE CLASSIFICATION

Record actual evidence.

Possible findings may include:

### PROVEN

The current activity list is sourced from actual execution/lifecycle events.

or:

### PROVEN

The current activity list is incorrectly sourced from Todo/Plan state.

or:

### PROVEN

The persistent working indicator contains a terminal-like visual element that remains visible during streaming.

Do not assume any of these until source inspection confirms them.

---

# 16. IMPLEMENTATION BOUNDARY

This is a SMALL CORRECTIVE REWORK.

Do NOT modify:

* Google Sheets MCP;
* agent execution engine;
* model routing;
* provider routing;
* MCP tools;
* Todo engine;
* planning engine;
* OpenCode backend architecture;
* conversation persistence;
* authentication;
* unrelated UI.

Only modify what is required to correct:

1. Runtime activity semantics.
2. Runtime activity presentation.
3. Active-step visualization.
4. Persistent working indicator animation.

---

# 17. REAL HUMAN SMOKE TEST

Use:

`http://localhost:3000/ai/opencode`

Run a real Google Sheets workflow with enough execution steps to observe the UI over time.

Capture evidence at multiple execution stages.

Verify:

### Stage 1

Activity begins.

### Stage 2

Completed activities remain visible.

### Stage 3

Current activity changes.

### Stage 4

New execution activity appears without looking like a newly generated Todo list.

### Stage 5

Persistent activity animation remains active while the agent is genuinely working.

### Stage 6

Animation stops after completion/failure/interruption.

---

# 18. REQUIRED VISUAL RESULT

The intended visual hierarchy is:

```text
AI response / explanation

✓ Membaca data Laporan Penjualan
✓ Membuat sheet "Ringkasan Penjualan Juli"
✓ Menulis data
● Menambahkan rumus...

[animated activity] Sedang bekerja...
```

The activity timeline is the primary information.

The persistent working indicator is secondary.

Do not let the persistent indicator visually compete with the activity timeline.

---

# 19. SUCCESS CRITERIA

PASS requires:

1. `Sedang bekerja...` remains semantically correct.
2. The distracting terminal-like bar/cursor is removed or replaced with a purposeful activity animation.
3. The working animation is visible only while runtime is active.
4. The animation stops when runtime ends.
5. Completed execution activities remain visible.
6. Current activity is clearly distinguishable.
7. The visible activity list represents actual execution activity.
8. The UI does not falsely imply that the agent is continuously creating a Todo list.
9. Developer Mode ON/OFF remains intact.
10. No new product mode is introduced.
11. No chain-of-thought is exposed.
12. Real human smoke test confirms the behavior.

---

# 20. EVIDENCE CLASSIFICATION

Use:

* PROVEN
* DERIVED
* UNPROVEN
* UNKNOWN
* INSUFFICIENT_EVIDENCE

Do not claim PASS for states that were not actually tested.

---

# 21. EXECUTION SUMMARY

## A. Audit

Inspected `src/features/ai/opencode/components/chat-message.tsx`:
- `LiveProgress` (streaming, once tool events exist) and `ProgressIndicator` (streaming fallback) — both inside the `isStreaming &&` block in `ChatMessageView`.
- `Sedang bekerja...` line: last line of `LiveProgress` (prior 203-210) / `ProgressIndicator` (prior 226-233).
- The terminal-like element: **three `animate-bounce` dots** (staggered delays) — prior `LiveProgress` 204-208 / `ProgressIndicator` 228-230.
- Activity list data source: `message.toolEvents` (from `tool_use` events) + `message.lifecycle` (LifecycleStage). `TodoPlan` renders `message.plan` (real `todowrite` input) only when a genuine plan exists — NOT the source of the visible activity list.
- Active vs completed: completed = ✓ (green Check), failed = ⚠, current = ● + `currentAction` line. CLI emits `tool_use` already `completed`, so "active" is derived from the last tool label + `…`.

## B. Root Cause

- `PROVEN` — the visible activity list is sourced from actual execution/lifecycle events (`toolEvents` + `lifecycle`), NOT Todo/Plan state. `TodoPlan` is separate and only renders when a real plan exists.
- `PROVEN` — the persistent working indicator contained a terminal-like visual element (three `animate-bounce` dots) that remained visible while streaming and read as a cursor/waiting artifact rather than an activity animation.
- `PROVEN` — the activity list evolves from real events; the issue was presentation (bouncing dots + list reading like a plan checklist), not the data source.

## C. Semantic Correction

Execution Activity is distinguished from Todo/Plan:
- The visible changing list is labeled/presented as **execution activity** (WHAT the agent did/is doing) sourced from `tool_use` + lifecycle events — completed steps (`✓`), current step (`●`, bold, foreground color).
- `TodoPlan` remains a separate component that renders ONLY when `message.plan` (real `todowrite` input) exists — a genuine Todo/Plan. No fake Todo system, no conversion of tool calls into planning items.
- The persistent status line answers only "is the agent still working?" (`Sedang bekerja...`), never a specific stage.

## D. Visual Correction

- Replaced the three `animate-bounce` dots with a **subtle segmented activity animation** (`ActivityIndicator` component): 4 small rounded segments using a new CSS keyframe `activityPulse` (staggered delays, gentle opacity pulse — communicates forward progress, not a terminal cursor). Native CSS only (in `src/styles/index.css`), lightweight, `prefers-reduced-motion: reduce` disables it.
- The animation element only renders inside the `isStreaming` block, so it is **removed (stops) when execution ends** — verified segments=0 after completion and after interrupt.
- Active step is now visually distinct: `●` + `font-medium text-foreground/80` (vs muted completed lines).
- Completed steps remain stable (`✓`), only the indicator segments animate.
- `ProgressIndicator` now takes no props (neutral persistent status with the same animation).

## E. Runtime Evidence

Real Alpha Workspace at `http://localhost:3000/workspace/assistant`, Developer Mode OFF, `opencode-go/deepseek-v4-flash`. Disposable `1VuzExi7BuM1JOVq_v1N79dmE2IXr64wOpLNFxkzuzA8` (151×15). Timeline (700ms cadence):

```
[14.1s] ...... | no indicator
[18.9s] BA.... | segs=4 anims=activityPulse | Sedang bekerja... (animation active)
[36.0s] BA.T.. | segs=4 anims=activityPulse | Memeriksa struktur spreadsheet ;; ● ; currentAction
[114.4s] .....E | segs=0 anims= | Execution Summary (completion)
```

- 134 samples with (`Sedang bekerja` + animation active) — animation present continuously while working.
- **No bouncing dots (`D`) ever appeared**; **no `Memproses permintaan`** during execution.
- Activity list evolved naturally (`Memeriksa struktur spreadsheet` → ... → Execution Summary) — Stage 2-4 verified.
- After completion: `segments=0, animating=false` — Stage 6 verified (animation stops).
- Output: `FlashSale050SCR2` sheetId 1878075496, 43 candidates, source Sheet1 unchanged.

## F. State Transition Evidence

- **Running** → `activityPulse` segments + `Sedang bekerja...` (PROVEN).
- **Completed** → segments removed (0), `Sedang bekerja` gone, Execution Summary shown (PROVEN, main smoke).
- **Interrupted** → Stop at 18.8s: pre-stop `anim=true segs=4`; post-stop `anim=false segs=0, Eksekusi dihentikan: true, Completion: false` (PROVEN, dedicated interrupt test).
- **Failed** → not exercised this run (no runtime failure); failure terminal is distinct (TASK-050 proven). `UNPROVEN` for this SCR run.

## G. Regression Evidence

- `Sedang bekerja...` semantic meaning preserved (SCR1).
- `Memproses permintaan...` not shown as persistent running state.
- Activity list (execution events) still visible and evolving.
- Human-readable tool labels remain; no raw technical tool names (Dev OFF).
- Developer Mode ON/OFF unchanged (this corrective only changed the indicator + active-step styling).
- Continuation / failure / interrupt / completion semantics unchanged.
- No chain-of-thought exposed.

## H. Unproven

- Persistent **Failed** animation state (no runtime failure occurred in this SCR run). Failure rendering is distinct and proven in TASK-050; the animation is removed whenever `isStreaming` is false, so failure necessarily stops it — this is derived, not directly observed here.

## I. Final Verdict

`PASS`

All required behaviors verified: `Sedang bekerja...` correct; terminal-like bouncing dots removed and replaced with a purposeful native-CSS segmented activity animation; animation only while runtime active and stops on completion/interrupt; completed activities stay visible; current activity clearly distinguishable; activity list represents actual execution events (not a fake Todo list); no new product mode; no chain-of-thought; Developer Mode intact; real smoke + interrupt test confirm. The only unexercised state (failed) is derived-safe and does not fail the task.
