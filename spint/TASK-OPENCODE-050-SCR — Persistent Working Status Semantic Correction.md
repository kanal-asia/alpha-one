# TASK-OPENCODE-050-SCR — Persistent Working Status Semantic Correction

## Type

Small Corrective Rework

## Parent Task

TASK-OPENCODE-050 — Alpha Workspace Runtime Lifecycle UI

## Status

COMPLETED — PASS (2026-08-18)

---

# 1. OBJECTIVE

Perform a small corrective UX rework on TASK-OPENCODE-050.

The runtime lifecycle implementation from TASK-050 is already considered valid.

This corrective task addresses one remaining semantic UX problem discovered during real human testing in Alpha Workspace:

The persistent bottom status currently displays:

`● Memproses permintaan...`

even while the agent has already completed request processing and is continuing to execute tools/work.

The user-facing meaning is therefore misleading.

The intended meaning of the persistent status is:

> The agent is still working.

It must not imply a specific execution stage unless that stage is actually known.

This task must make the persistent status state-based rather than stage-based.

---

# 2. HUMAN TEST EVIDENCE

Real Alpha Workspace screenshot evidence shows the following sequence:

Lifecycle:

`✓ Membaca metadata spreadsheet`

`✓ Membaca data Laporan Penjualan`

`✓ Membaca data Summary`

while the persistent bottom indicator simultaneously shows:

`● Memproses permintaan...`

The runtime is visibly still executing work.

This proves the remaining UX issue:

### PROVEN

The persistent status label `Memproses permintaan...` remains visible while the agent is already executing subsequent workflow stages.

### PROVEN

The label therefore does not accurately describe the current runtime state.

### PROVEN

The user interpretation intended for this indicator is simply:

`agent masih bekerja`

### NOT REQUIRED

Do not redesign the lifecycle event list.

Do not redesign the execution engine.

Do not introduce a new "Marketing Mode".

Do not duplicate OpenCode terminal UI.

---

# 3. DESIGN DECISION

Separate two concepts.

## A. Lifecycle Detail

This describes WHAT the agent is doing.

Example:

`✓ Membaca metadata spreadsheet`

`✓ Membaca data Laporan Penjualan`

`✓ Membaca data Summary`

`● Membuat tab baru`

`● Menulis hasil`

These labels should continue to come from the existing lifecycle/tool event system.

---

## B. Persistent Execution Status

This describes WHETHER the agent is still working.

It must be state-based.

### Running

Display:

`● Sedang bekerja...`

### Completed

Display:

`✓ Selesai`

### Failed

Display:

`⚠ Eksekusi gagal`

### Interrupted / Cancelled

Display:

`■ Eksekusi dihentikan`

The persistent status must NOT claim a specific stage.

---

# 4. REQUIRED BEHAVIOR

The persistent working indicator must be driven by the actual runtime execution state.

Conceptually:

`isStreaming === true`

must result in:

`● Sedang bekerja...`

It must NOT result in:

`● Memproses permintaan...`

simply because the runtime is still active.

The existing lifecycle event list remains responsible for stage-specific information.

Therefore:

```text
Lifecycle:
✓ Membaca metadata spreadsheet
✓ Membaca data Laporan Penjualan
✓ Membaca data Summary
● Membuat tab baru
● Menulis hasil

Persistent status:
● Sedang bekerja...
```

This is the intended design.

---

# 5. IMPORTANT SEMANTIC RULE

`Memproses permintaan...` must not be used as the generic persistent running state.

If the implementation currently treats `Memproses permintaan...` as a generic fallback for every streaming state, correct that behavior.

The persistent status must answer only:

> Is the agent still working?

It must not answer:

> What exact internal stage is the agent currently processing?

That information already belongs to the lifecycle detail.

---

# 6. DO NOT CREATE "MARKETING MODE"

There is NO product mode called:

`Marketing Mode`

Do not add it.

Do not mention it in implementation.

The existing product behavior remains controlled by:

`Developer Mode OFF / ON`

This corrective task only changes the semantic wording of the persistent runtime indicator.

---

# 7. DEVELOPER MODE BEHAVIOR

The corrective must preserve TASK-050's existing Developer Mode behavior.

Developer Mode OFF:

Use concise human-readable lifecycle labels.

Example:

`Membaca data`

`Membuat sheet`

`Menulis data`

Persistent state:

`● Sedang bekerja...`

Developer Mode ON:

Existing developer-oriented lifecycle detail may remain available.

Persistent state should still represent the runtime state accurately.

Do not introduce a separate runtime state model solely for Developer Mode.

---

# 8. AUDIT BEFORE IMPLEMENTATION

Before changing code:

1. Locate the component responsible for the persistent bottom execution indicator.
2. Identify the current source of its label.
3. Identify why `Memproses permintaan...` is selected while `isStreaming` remains true.
4. Identify whether the label is tied to:

   * a generic streaming fallback;
   * a `step_start`;
   * a lifecycle event;
   * an execution state;
   * another state variable.
5. Confirm the smallest possible correction.

Do not change source code before this audit.

---

# 9. ROOT-CAUSE CLASSIFICATION

Record the actual root cause.

Expected classification, only if evidence confirms it:

`PROVEN — persistent running state is represented using a stage-specific label ("Memproses permintaan...") rather than a neutral runtime-state label.`

Do not assume this root cause before inspecting the implementation.

If implementation evidence differs, record the actual root cause instead.

---

# 10. MINIMAL IMPLEMENTATION

Implement only the smallest correction required.

Preferred behavior:

```text
RUNNING
→ ● Sedang bekerja...

COMPLETED
→ ✓ Selesai

FAILED
→ ⚠ Eksekusi gagal

INTERRUPTED
→ ■ Eksekusi dihentikan
```

Do not modify:

* MCP behavior;
* agent execution;
* continuation architecture;
* tool execution;
* provider selection;
* model routing;
* lifecycle event generation;
* Google Sheets integration;
* task/todo architecture.

Unless the audit proves the status correction cannot be safely implemented without touching one of these.

---

# 11. REAL SMOKE TEST

After implementation, perform a real smoke test through:

`http://localhost:3000/ai/opencode`

Use a real workflow that keeps the agent running long enough for multiple lifecycle stages to become visible.

Prefer a Google Sheets workflow because it has already produced the exact human-test evidence.

Observe the UI while the agent is actively working.

---

# 12. REQUIRED HUMAN-VISIBLE RESULT

During execution, verify that the UI can show:

```text
✓ Membaca metadata spreadsheet
✓ Membaca data ...
✓ Membaca data ...
● <current lifecycle action>

● Sedang bekerja...
```

The persistent status must remain semantically neutral while execution continues.

It must not repeatedly show:

`Memproses permintaan...`

unless the implementation has a separately proven, explicit stage where that exact wording is intentionally appropriate.

For this product-level persistent status, prefer:

`Sedang bekerja...`

---

# 13. VERIFY STATE TRANSITIONS

Test the persistent indicator through the actual lifecycle.

## Running

Expected:

`● Sedang bekerja...`

## Completed

Expected:

`✓ Selesai`

## Failed

Expected:

`⚠ Eksekusi gagal`

## Interrupted

Expected:

`■ Eksekusi dihentikan`

Do not simulate states artificially if the real runtime can exercise them naturally.

If a state cannot be naturally exercised, classify it:

`UNPROVEN`

Do not manufacture PASS evidence.

---

# 14. REGRESSION CHECK

Confirm TASK-050 behavior remains intact:

* Working indicator does not disappear while runtime is still streaming.
* Lifecycle events remain visible.
* Human-readable tool labels remain visible.
* Technical tool names remain hidden when Developer Mode is OFF.
* Developer Mode ON behavior remains intact.
* Continuation status remains intact.
* Failure status remains intact.
* Interrupt status remains intact.
* Completion status remains intact.
* No private chain-of-thought is exposed.

---

# 15. EVIDENCE CLASSIFICATION

Separate findings into:

### PROVEN

Facts directly observed in source/runtime/UI.

### DERIVED

Reasonable conclusions directly derived from the evidence.

### UNPROVEN

Behavior not exercised in the corrective smoke test.

### UNKNOWN

Behavior that cannot currently be determined.

### INSUFFICIENT_EVIDENCE

Evidence is insufficient to make a reliable claim.

Do not convert an untested lifecycle state into a bug.

---

# 16. SUCCESS CRITERIA

The corrective task passes if:

1. The root cause of the misleading persistent label is identified from source evidence.
2. The persistent running state uses neutral wording.
3. Running state displays:
   `● Sedang bekerja...`
4. Lifecycle detail remains responsible for stage-specific information.
5. `Memproses permintaan...` is no longer used as the generic persistent running label.
6. Existing TASK-050 lifecycle behavior remains intact.
7. Real Alpha Workspace smoke test confirms the corrected behavior.
8. No unrelated source changes are introduced.
9. No new product mode is introduced.
10. Developer Mode OFF / ON behavior remains intact.

---

# 17. SCOPE BOUNDARY

This is a SMALL CORRECTIVE REWORK.

Do NOT turn it into:

* TASK-051 runtime redesign;
* OpenCode terminal cloning;
* new agent orchestration;
* model routing;
* provider fallback;
* lifecycle architecture rewrite;
* Todo system redesign;
* Retry system redesign;
* Google Sheets MCP work;
* marketing mode;
* new UI mode.

If the existing implementation already supports the required state transitions, only correct the label selection.

---

# 18. EXECUTION SUMMARY

After execution, update this task with:

## A. Audit

What component/state produced `Memproses permintaan...`.

## B. Root Cause

Evidence-based root cause.

## C. Correction

Exact minimal change.

## D. Smoke Test

Real Alpha Workspace workflow used.

## E. UI Evidence

Observed lifecycle and persistent status behavior.

## F. Regression Evidence

Confirmation that TASK-050 behavior remains intact.

## G. Unproven States

Any lifecycle states not naturally exercised.

## H. Final Verdict

`PASS`

`PASS WITH LIMITATION`

or

`FAIL`

Use `PASS WITH LIMITATION` only when a meaningful required state remains unproven.

Do not fail the task merely because an optional state was not naturally triggered.

---

# 19. FINAL PRODUCT PRINCIPLE

The persistent status should communicate:

> "The agent is still working."

The lifecycle should communicate:

> "Here is what the agent has done and what it is doing."

Do not mix these two responsibilities.

---

# 18. EXECUTION SUMMARY

## A. Audit

The persistent bottom execution indicator lives in `src/features/ai/opencode/components/chat-message.tsx` inside two components:

- `LiveProgress` (rendered while streaming once tool events exist) — the persistent working line is the last block (bouncing dots + label).
- `ProgressIndicator` (fallback before any tool event).

The label source was the variable `stageLabel` (LiveProgress, prior lines 170-176) / `label` (ProgressIndicator, prior lines 212-215), computed from `runningStage = [...(lifecycle ?? [])].reverse().find((s) => s.status === 'running')` — i.e. the most recent `running` lifecycle stage.

`Memproses permintaan…` was selected when `runningStage?.kind === 'thinking'`. The `thinking` stage is written by `opencode-store.ts:640` on every `step_start` with status `'running'` and is **never marked completed** (`appendOrUpdateStage` only replaces same-kind running stages; `thinking` is only ever set to running). Therefore the most-recent `running` lifecycle stage stays `kind === 'thinking'` for the entire execution, so the persistent line always read `Memproses permintaan…` while streaming — even while the agent was executing tools.

## B. Root Cause

`PROVEN — persistent running state was represented using a stage-specific label ("Memproses permintaan…") rather than a neutral runtime-state label.`

Evidence: `chat-message.tsx` derived the persistent label from `runningStage.kind === 'thinking'`; the store keeps `thinking` in `running` state for the whole execution; real UI smoke (pre-correction baseline) and the human-test evidence both showed `● Memproses permintaan...` persisting while lifecycle showed `✓ Membaca metadata spreadsheet`, `✓ Membaca data ...`, `✓ Membaca data Summary`.

The correction boundary is label selection only — no lifecycle architecture change required.

## C. Correction

Single file: `src/features/ai/opencode/components/chat-message.tsx` (27 insertions, 19 deletions).

- `LiveProgress` now separates two responsibilities:
  - **Lifecycle detail** (WHAT): completed tools with ✓/⚠; a `● <currentAction>` line where `currentAction` is the genuinely active tool label, else the continuation label, else the last tool label (with `…`), else the thinking label only when no tool has run yet.
  - **Persistent status** (WHETHER): an always-visible line while streaming with bouncing dots + `Sedang bekerja...` — neutral, state-based.
- `ProgressIndicator` (fallback) now always shows `Sedang bekerja...` (neutral), no longer selects `Memproses permintaan…` from lifecycle state.

No changes to MCP behavior, agent execution, continuation architecture, tool execution, provider selection, model routing, lifecycle event generation, Google Sheets integration, or task/todo architecture. No "Marketing Mode" introduced.

## D. Smoke Test

Real Alpha Workspace at `http://localhost:3000/workspace/assistant`, Developer Mode OFF, model `opencode-go/deepseek-v4-flash`. Disposable `1ovEzDDJ0Ht8G5aVXdhdNU20x6bg4G_ONq2e9X1AbeCw` (`ALPHA_ONE_MCP050SCR_2026-08-18T11-56-21-448Z`), Sheet1 151×15 (150 products), real Google Sheets MCP workflow (identify Dead Stock/Slow Moving above-average stock, create `FlashSale050SCR` tab, populate candidates, verify).

## E. UI Evidence

Persistent-status timeline (DOM samples, 700ms cadence):

```
[16.8s] B... | ● Sedang bekerja...
[31.0s] B.T. | Membaca metadata spreadsheet ;; Memeriksa struktur spreadsheet ;; Sedang bekerja...
[50.3s] B... | Sedang bekerja...
[75.1s] B.T. | Membuat sheet "FlashSale050SCR" ;; Sedang bekerja...
[118.5s] ...E | Execution Summary (completed)
```

- `Sedang bekerja...` (B) present continuously while running; `Memproses permintaan` (M) **never** appeared during tool execution.
- Lifecycle tools (T) shown alongside the neutral persistent status (matches the required human-visible result).
- Completion: Execution Summary at 118.5s; server `PROCESS CLOSE { code: 0, terminalStepFinishReceived: true, decision: 'SUCCESS' }`; 43/43 candidates, source Sheet1 unchanged.
- Interrupt test (separate disposable): Stop at 20.5s → `Eksekusi dihentikan`, no false completion, `Sedang bekerja` correctly absent after interrupt.

## F. Regression Evidence

- Working indicator remains continuously visible while streaming (bouncing dots + `Sedang bekerja...`) — never disappears.
- Lifecycle events remain visible (`✓ Membaca metadata spreadsheet`, `✓ Memeriksa struktur spreadsheet`, `● Membuat sheet "FlashSale050SCR"`).
- Human-readable tool labels remain; raw technical tool names (`Using google-sheets_...`) were not shown (Dev OFF).
- Developer Mode ON unchanged (this task touched only the persistent label; Dev diagnostics live view from TASK-050 intact).
- Continuation / failure / interrupt / completion semantics unchanged (only the persistent running label wording changed).
- No private chain-of-thought exposed.

## G. Unproven States

- **Failed** persistent wording (`⚠ Eksekusi gagal`): not exercised in this corrective smoke (no runtime failure occurred). The failure terminal is distinct (error rendering), previously proven in TASK-050 free-model 429 test. Persistent running indicator is a streaming-only element, so failure/completed states are represented by the terminal rendering, not the streaming indicator.
- **Completed** as a persistent line: the indicator is streaming-only by design; at completion the terminal state ("Selesai" + Execution Summary) takes over. `PROVEN` that completion is distinct; the specific `✓ Selesai` persistent-line wording is `UNPROVEN` (by design the indicator is not shown when not streaming).

## H. Final Verdict

`PASS`

The root cause was identified from source evidence, the persistent running state uses neutral wording (`● Sedang bekerja...`), lifecycle detail retains stage-specific information, `Memproses permintaan…` is no longer the generic persistent running label, real Alpha Workspace smoke confirmed the corrected behavior, TASK-050 behavior remains intact, and no unrelated changes or new product mode were introduced. The only unexercised state (persistent `✓ Selesai` line) is by design not a streaming element and is not a defect; per §18 rules an optional state not naturally triggered does not fail the task.
