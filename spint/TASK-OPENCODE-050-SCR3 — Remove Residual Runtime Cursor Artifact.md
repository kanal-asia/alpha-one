# TASK-OPENCODE-050-SCR3 — Remove Residual Runtime Cursor Artifact

## Type

Small Corrective Rework

## Parent

TASK-OPENCODE-050-SCR2

## Status

COMPLETED — PASS (2026-08-19)

---

# 1. OBJECTIVE

Remove ONLY the residual black cursor/bar visual artifact that appears underneath:

`[activity indicator] Sedang bekerja...`

during active OpenCode runtime execution.

This is the small black vertical/rectangular element visible on a separate line below the `Sedang bekerja...` status.

The purpose is simple:

> Remove the distracting terminal/cursor artifact without changing the working indicator, execution activity timeline, runtime behavior, or other UI.

---

# 2. HUMAN TEST EVIDENCE

Real Alpha Workspace screenshots show:

```text
✓ Membaca metadata spreadsheet
✓ Membaca data Laporan Keuangan
● Membaca data Laporan Keuangan...

▮▮▮▮ Sedang bekerja...
▮
```

The final `▮` on the line below `Sedang bekerja...` is the unwanted element.

It visually resembles:

* a terminal cursor;
* a text insertion cursor;
* an unfinished command line;
* a loading artifact.

It does NOT communicate useful runtime information.

The four-segment activity indicator beside `Sedang bekerja...` is NOT the target of this task.

---

# 3. EXACT SCOPE

## REMOVE

Only the residual black cursor/bar element underneath:

`Sedang bekerja...`

## KEEP

Keep all of the following unchanged:

1. `Sedang bekerja...`
2. The 4-segment activity animation beside `Sedang bekerja...`
3. Execution activity timeline.
4. `✓` completed activity indicator.
5. `●` current activity indicator.
6. `⚠` failure activity indicator.
7. Activity labels.
8. Developer Mode ON/OFF.
9. Execution lifecycle/state handling.
10. Completion behavior.
11. Interrupt behavior.
12. Failure behavior.
13. Existing `activityPulse` animation.
14. Existing `prefers-reduced-motion` behavior.

---

# 4. IMPORTANT PRODUCT DECISION

Do NOT redesign the activity indicator.

Do NOT replace the 4-segment animation.

Do NOT create a new animation.

Do NOT convert it into a 1→10 progress animation.

Do NOT change the wording.

Do NOT change the activity timeline.

This corrective exists for ONE visual defect only:

> remove the residual black cursor/bar underneath the working status.

---

# 5. AUDIT BEFORE IMPLEMENTATION

Before changing code:

1. Locate the component responsible for `Sedang bekerja...`.
2. Locate the DOM/React element rendered directly underneath it.
3. Confirm whether the black element is:

   * a cursor;
   * a placeholder;
   * a loading element;
   * a text caret;
   * an inherited styling artifact;
   * another runtime indicator.
4. Confirm the exact source of that element.
5. Remove only that element or its rendering condition.

Do not modify unrelated runtime components.

### AUDIT RESULTS (2026-08-18, `src/features/ai/opencode/components/chat-message.tsx`)

- `Sedang bekerja...` is rendered by `LiveProgress` / `ProgressIndicator` inside the `isStreaming &&` block.
- Directly underneath that block, the main `ChatMessageView` card had (line 440-442, pre-removal):

```tsx
{isStreaming && (
  <span className='ms-1 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle' />
)}
```

- This is a **text-insertion caret / terminal cursor artifact**: a `1.5px × 14px` inline-block, `bg-current` (black), `animate-pulse` (blinking), `align-middle`. It renders as the last element of the message card while streaming — appearing on its own line underneath `Sedang bekerja...` (because `LiveProgress` is a block that ends before it). It is a leftover streaming caret from TASK-033, unrelated to the SCR2 activity indicator.
- Classification: `PROVEN` — the black `▮` is the `h-3.5 w-1.5 animate-pulse` span (a text caret), not the 4-segment `activity-indicator__seg` element.
- Grep confirmed this is the only such caret in the message card (`status-indicator.tsx` uses `animate-pulse` only for amber runtime-status dots, which are correct and unchanged).

---

# 6. IMPLEMENTATION BOUNDARY

Expected scope is limited to the existing runtime status UI, most likely:

`src/features/ai/opencode/components/chat-message.tsx`

and only if required, the directly associated styling.

Do NOT modify:

* OpenCode execution engine;
* tool event processing;
* lifecycle event processing;
* Todo/Plan system;
* Google Sheets MCP;
* model routing;
* provider routing;
* runtime transport;
* conversation persistence;
* activity event generation;
* Developer Mode;
* `activityPulse` implementation unless absolutely required to remove the artifact.

Prefer removing the unnecessary rendered element rather than adding another CSS workaround.

---

# 7. REQUIRED RESULT

Before:

```text
▮▮▮▮ Sedang bekerja...
▮
```

After:

```text
▮▮▮▮ Sedang bekerja...
```

The second line must no longer contain the black cursor/bar.

The activity indicator beside `Sedang bekerja...` must remain unchanged.

---

# 8. RUNTIME BEHAVIOR

During execution:

```text
▮▮▮▮ Sedang bekerja...
```

must remain visible.

The unwanted second-line cursor/bar must NOT appear.

When execution completes:

* `Sedang bekerja...` disappears according to existing behavior.
* activity animation stops according to existing behavior.
* execution summary remains unchanged.

When execution is interrupted:

* existing interrupted state remains unchanged.
* no residual cursor/bar remains.

When execution fails:

* existing failure state remains unchanged.
* no residual cursor/bar remains.

---

# 9. HUMAN SMOKE TEST

Use:

`http://localhost:3000/ai/opencode`

Run a real OpenCode workflow long enough to observe the runtime status.

Verify visually:

### Stage 1 — Runtime starts

Confirm:

```text
▮▮▮▮ Sedang bekerja...
```

is visible.

Confirm there is NO separate black cursor/bar underneath it.

### Stage 2 — Activity timeline appears

Confirm execution activity continues to appear normally.

Example:

```text
✓ Membaca metadata spreadsheet
● Membaca data Laporan Keuangan...

▮▮▮▮ Sedang bekerja...
```

Confirm no second-line black cursor/bar exists.

### Stage 3 — Runtime continues

Observe the UI for several seconds.

Confirm the unwanted black element does not intermittently reappear.

### Stage 4 — Completion

Confirm:

* working status disappears;
* activity animation stops;
* no black cursor/bar remains;
* existing completion UI is unchanged.

### Stage 5 — Interrupt

If practical, interrupt one disposable execution.

Confirm no black cursor/bar remains after interruption.

---

# 10. SUCCESS CRITERIA

PASS requires:

1. The black cursor/bar underneath `Sedang bekerja...` is removed.
2. The 4-segment activity indicator remains intact.
3. `Sedang bekerja...` remains unchanged.
4. Execution Activity timeline remains unchanged.
5. No runtime architecture is modified.
6. No Todo/Plan behavior is modified.
7. Developer Mode ON/OFF remains unchanged.
8. Completion behavior remains unchanged.
9. Interrupt behavior remains unchanged.
10. Failure behavior remains unchanged.
11. No new animation is introduced.
12. Real human smoke test confirms the unwanted element is gone.
13. No new visual artifact is introduced.

---

# 11. EVIDENCE CLASSIFICATION

Use:

* PROVEN
* DERIVED
* UNPROVEN
* UNKNOWN
* INSUFFICIENT_EVIDENCE

Do not claim PASS for runtime states that were not actually tested.

---

# 12. EXECUTION SUMMARY

### Changed

- File: `src/features/ai/opencode/components/chat-message.tsx`.
- Element removed: the streaming caret span (lines 440-442, pre-removal):

```tsx
{isStreaming && (
  <span className='ms-1 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle' />
)}
```

This was the ONLY change. No CSS, no other component, no runtime/architecture change.

### Root Cause

The black `▮` underneath `Sedang bekerja...` was a leftover **text-insertion caret / terminal cursor** from TASK-033's streaming UI: a `1.5px × 14px` inline-block span (`h-3.5 w-1.5`), `bg-current` (black), `animate-pulse` (blinking), `align-middle`, rendered as the last element inside the message card while `isStreaming`. Because `LiveProgress` is a block that ends before it, the caret appeared on its own line below `Sedang bekerja...`, reading like an unfinished command-line cursor. It was unrelated to the SCR2 4-segment `activity-indicator__seg` animation (that element is a `4px × 10px` rounded segment with `activityPulse`, not `animate-pulse`).

Classification: `PROVEN` — the artifact was the `h-3.5 w-1.5 animate-pulse` caret span; grep confirmed it was the only such caret in the message card (`status-indicator.tsx` uses `animate-pulse` only for amber runtime-status dots, which are correct and were not touched).

### Verification

Real Alpha Workspace at `http://localhost:3000/workspace/assistant`, Dev OFF, `opencode-go/deepseek-v4-flash`. Disposable `1b8Eff9AUl6oPDFZHKBaxj_qksrnP5Ko3E72c5gEIcvA` (151×15), 222 DOM samples (600ms cadence):

- **Cursor caret during run: `false`** — 0 carets across all 222 samples (previously the caret rendered on every streaming frame).
- `Sedang bekerja...` present in 219 samples (indicator intact).
- 4-segment activity animation active in 219 samples (animation intact).
- Activity timeline visible (Stage 2: "Memeriksa struktur spreadsheet…", "●" current action).
- Stage 3 (continued observation, ~155s): no intermittent caret reappearance.
- Completion at 155.3s: `caret=0, segs=0, bekerja=false` (Stage 4 — animation stops, no artifact, Execution Summary present).
- Interrupt test (separate disposable): pre-stop `caret=0, segs=4`; post-stop `caret=0, segs=0, Eksekusi dihentikan=true, Completion=false` (Stage 5 — no residual artifact after interrupt).
- Output: `FlashSale050SCR3` sheetId 521811855, 43 candidates, source Sheet1 unchanged.

### Regression Check

- `Sedang bekerja...` still works (219 samples).
- 4-segment activity indicator still works (219 samples animating).
- Activity timeline still works (completed ✓ / current ● visible).
- Completion still works (Execution Summary, exit 0 `SUCCESS`, animation stops).
- Interrupt still works ("Eksekusi dihentikan", no false completion).
- No unrelated UI changed (single element removed; `status-indicator.tsx` dots untouched).

### Final Verdict

`PASS`

Required evidence present: the residual black cursor/bar under `Sedang bekerja...` is removed (0 carets in all 222 running samples and after completion/interrupt), the 4-segment indicator + `Sedang bekerja...` + activity timeline remain fully functional, and no unrelated UI/runtime behavior changed. No new animation or visual artifact introduced.
