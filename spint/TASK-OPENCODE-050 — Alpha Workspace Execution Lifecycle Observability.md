# TASK-OPENCODE-050 — Alpha Workspace Execution Lifecycle Observability

## Type

P1 UI / Runtime Observability

## Priority

P1 — Core Alpha Workspace Execution UX

## Status

COMPLETED — PASS WITH LIMITATION (2026-08-18)

---

# 1. OBJECTIVE

Improve Alpha Workspace execution UI so the user can understand what the agent is actually doing while preserving the complete real execution lifecycle.

This task is NOT about copying or duplicating the OpenCode terminal UI.

The requirement is:

> Alpha Workspace must preserve execution-lifecycle completeness comparable to the actual OpenCode runtime, while presenting only the appropriate level of detail in the normal UI.

Developer Mode provides additional technical/runtime detail.

There is NO "Marketing Mode".

Do NOT introduce, name, or implement a "Marketing Mode".

The only UI distinction is:

- Developer Mode OFF
- Developer Mode ON

---

# 2. CORE DESIGN PRINCIPLE

Use:

> EXECUTION COMPLETENESS + PRESENTATION SIMPLICITY

The runtime/event system must retain the complete execution lifecycle.

The normal UI may summarize or group technical events.

Developer Mode may expose the underlying technical events.

Do NOT create two different execution engines.

Do NOT create a fake progress system.

Do NOT replace runtime truth with timers or animated placeholders.

UI state must be derived from actual runtime/execution events.

---

# 3. REQUIRED EXECUTION LIFECYCLE

Alpha Workspace must be capable of representing the complete lifecycle:

1. Request received
2. Thinking / processing
3. Plan / Todo created
4. Tool execution starts
5. Tool progress / result
6. Tool failure / retry when applicable
7. Analysis / processing continues
8. Continuation when applicable
9. Runtime/model transition when applicable
10. Verification
11. Completion
12. Failure
13. Interrupt / cancellation

Not every execution will contain every state.

The system must not fabricate states that did not occur.

The UI must not incorrectly collapse an intermediate state into completion.

---

# 4. PREVIOUS EVIDENCE / CONTEXT

Previous Alpha Workspace testing showed that the UI could display:

`Working...`

without giving the user enough information about what was actually happening.

Previous runtime evidence also showed:

- agent Thinking;
- Todo creation;
- tool execution;
- tool output;
- continuation;
- model/runtime transitions;
- interrupt behavior;
- execution exit;
- subsequent execution;
- buffer/progress information.

These details are visible in the OpenCode terminal runtime but were not adequately represented in Alpha Workspace.

The requirement is NOT to reproduce the terminal visually.

The requirement is:

> Do not lose meaningful execution lifecycle information when presenting it inside Alpha Workspace.

---

# 5. MANDATORY EXECUTION ORDER

Do NOT start by implementing UI.

Mandatory order:

1. REAL SMOKE TEST
2. AUDIT CURRENT RUNTIME/EVENT FLOW
3. CLASSIFY ROOT CAUSE
4. DESIGN MINIMAL EVENT/UI MAPPING
5. IMPLEMENT
6. DIRECT REGRESSION TEST
7. ALPHA WORKSPACE E2E
8. INTERRUPTION / FAILURE TEST
9. CONTINUATION TEST
10. DEVELOPER MODE TEST
11. FINAL LIFECYCLE AUDIT
12. EXECUTION SUMMARY

The first implementation action MUST NOT be source-code modification.

---

# 6. REAL SMOKE TEST FIRST

Run the real Alpha Workspace:

`http://localhost:3000/workspace/assistant`

Use an execution that performs actual MCP/tool work.

Prefer a spreadsheet workflow similar to the previously observed Google Sheets workflow because it naturally exercises:

- planning;
- tool execution;
- multiple tool calls;
- analysis;
- continuation;
- verification;
- completion.

Observe the UI and runtime simultaneously.

Capture actual evidence for:

- initial request;
- Working state;
- Thinking;
- Todo/plan;
- tool events;
- tool result;
- continuation;
- completion;
- failure/timeout if encountered;
- Execution Summary.

Do not modify source code before the smoke test and initial audit.

### §6 Smoke Test Results (2026-08-18, before implementation)

Ran a real Google Sheets flash-sale workflow through `http://localhost:3000/workspace/assistant` on fresh disposable `1h-89-D-jlF8O46N6zQVoZgvBwFzDBa7Q7qhTwKCN3N0` (`ALPHA_ONE_MCP050SMOKE_2026-08-18T10-51-03-083Z`, 131×24, 3144 cells), model `opencode-go/deepseek-v4-flash`, Developer Mode OFF. High-frequency DOM sampler captured 102 UI samples while the server log captured the runtime event stream simultaneously.

**Runtime truth (server log, session `ses_feb80a21affeAUkXiUSJdy9sCF`, pid 21076):** 8 steps over ~77s; 8 tool calls with full detail — `list_sheets` → `get_spreadsheet` → `read_range Sheet1!A1:W5` → `bash` (compute avg 24.58, 39 candidates) → `bash` → `create_sheet title=FlashSale050` → `write_range FlashSale050!A1:O40` → `read_range FlashSale050!A1:O5` + `read_range FlashSale050!A36:O40` (verification) → `list_sheets` → final text + `step_finish reason=stop`. PROCESS CLOSE: exit 0, `terminalStepFinishReceived: true`, `decision: 'SUCCESS'`, totalLatencyMs 86965. Output verified: FlashSale050 sheet created, 39/39 candidates correct, Sheet1 untouched.

**UI truth (DOM samples, Developer Mode OFF):**
- `Working…` visible from 17.2s to 33.4s.
- At 34.3s the `Working…` indicator **disappeared** while the runtime was still actively executing (mid-tool-call phase, ~43s of execution remained).
- UI then showed raw technical labels `Using google-sheets_google_sheets_list_sheets` / `Using google-sheets_google_sheets_get_spreadsheet` — no human-readable summary, no Thinking, no Todo/plan, no per-tool status, no verification/completion staging.
- No `Thinking`, no Todo/plan, no lifecycle stage text ever appeared in the DOM.
- My sampler's idle-break fired because the UI went silent/stale while the runtime kept working — the UI gave no indication the agent was still active.

**Smoke-test first-attempt (free model):** `opencode/deepseek-v4-flash-free` aborted with provider 429 `Rate limit exceeded` (external, same as TASK-049); UI showed `Working…` for ~80s then `OpenCode exited with code 1`. Confirms the UI also fails to distinguish a provider-level failure promptly.

**Classified:** "Working state insufficient / dropped mid-execution" and "raw tool names in normal UI" are `PROVEN` by the DOM samples above. "Thinking/Todo invisible" is `PROVEN` by the same samples (neither ever rendered).

---

# 7. AUDIT BEFORE IMPLEMENTATION

At minimum inspect:

- Alpha Workspace assistant UI;
- chat/message rendering;
- Working state implementation;
- OpenCode server/runtime;
- event stream;
- tool events;
- Todo events/state;
- continuation;
- model/build state;
- terminal/exit state;
- error state;
- interrupt/cancellation state;
- Execution Summary;
- Developer Mode state.

Determine:

1. Which runtime events already exist?
2. Which events reach the frontend?
3. Which events are currently discarded?
4. Which events exist only server-side?
5. Which UI state is inferred rather than event-driven?
6. Which lifecycle transitions are currently invisible?
7. How Developer Mode currently works.
8. Whether the existing event model can support the requirement without redesign.

Do not assume a missing UI element means the backend event is missing.

Prove where the information is lost.

### §7 Audit Results (2026-08-18)

**Event flow path (PROVEN, traced end-to-end):**
`OpenCode CLI (child process, server.ts) → SSE (server.ts sendEvent) → HTTPTransport (http-transport.ts parseSSEBlock + switch) → StreamChunk → opencode-store.ts sendMessage callback → ChatMessage → chat-message.tsx`

**Server-side events emitted (`server.ts` `sendEvent` call sites):**
- `session` (line 303) — real CLI session ID
- `token` (371, 520) — wraps every non-step_finish CLI event (incl. `tool_use`, `text`, `step_start`, `reasoning`)
- `step_finish` (361, 518) — dedicated, raw evt
- `file_operation` (339-346) — write/edit file detection
- `stderr` (383, 531)
- `error` (257, 391, 646-654)
- `done` (416, 642, 645) — `{terminal: true|false}`
- `exit` (417, 643, 655)
- `cancelled` (665) — only on `req.on("close")`

**What reaches the frontend (transport switch, http-transport.ts:453-628):**
- `token` → emits `tool_event` if evt.type==='tool_use' (472-487), else `token` (text) (489-494)
- `file_operation` → `file_operation`
- `step_finish` → `{type:'done', terminal:false}` + tokens (507-539)
- `error` → `{type:'error'}`
- `exit` → `{type:'exit_code'}` (552-563)
- `done` → `{type:'done', terminal:true}` only if terminal && !responseCompleted (586-601)
- `session` → `{type:'session'}`
- `stderr` → `error 'Session not found'` if matched
- `cancelled` → `{type:'error', error:'Request cancelled'}` (620-624)
- **`step_start` → DROPPED** (falls to `default`, 626-627)
- **`reasoning` → conflated into `token` text** (458-460 extracts `part.text`/`evt.text` for ANY event incl. reasoning)

**Store handling (opencode-store.ts sendMessage callback, 583-785):**
- `token` → append content (584)
- `tool_event` → `executionState:'progress'`, append toolEvents (585-605)
- `exit_code` → store exitCode (606-619)
- `session` → store real sessionId (620-628)
- `file_operation` → register resource (629-661)
- `done` non-terminal → usage/context only (668-686); terminal → `status:'done'`, `executionState: content? 'completed':'completed_no_text'` (688-726)
- `error` → `status:'error'`, `executionState:'error'` unless already done (732-783)
- **No todo/plan state; no thinking state; no continuation state; no distinct cancelled executionState** (only `status` 'cancelled' from stopGeneration, line 829 — `executionState` never set to 'cancelled')

**UI rendering (chat-message.tsx):**
- Active message = `streaming && message.status==='streaming'` (276); only one streaming assistant msg exists (store 508)
- `LiveProgress` (132-161): active "Working…" line renders ONLY when `active || (!lastEvent?.status || lastEvent.status==='running')` (149). **When last tool event is 'completed' and no 'running' event → active line does NOT render** → UI goes silent mid-execution (matches smoke DOM: Working… gone at 34.3s while runtime kept going to ~77s).
- `ProgressIndicator` (167-181): label = last tool event label or 'Working…'
- `EXEC_STATE_LABELS` (25-33) computed but **never rendered** (dead code)
- Tool labels via `mapToolToLabel` (134-171): `TOOL_LABELS` keys are `google_sheets.list_sheets` style but actual MCP tool names are `google-sheets_google_sheets_list_sheets` → key MISS (no match) → fallback `Using ${tool}` = **raw technical tool name** (matches smoke DOM).
- DeveloperDiagnostics (91-126) only shows when `message.status==='done'` (terminal only), not during streaming; ToolEvent.detail never populated.
- Cancelled message with no content → "Empty response." (350-352); no distinct "Cancelled" visual.

**ToolEvent fields (types.ts:171-179):** `{id, label, tool, status, timestamp, detail?}` — no range/op metadata persisted (detail never passed).

**Runtime busy state (runtime.ts):** server-scoped `busy` lifecycle exists and is polled (2.5s) but per-message UI is NOT driven by it (driven by client `isStreaming`+toolEvents).

**Answers to §7 questions:**
1. Runtime events that exist: session, token (wrapping tool_use/text/step_start/reasoning), step_finish, file_operation, stderr, error, done, exit, cancelled.
2. Reach frontend: tool_event (from tool_use), token (text), done, error, exit_code, session, file_operation; step_finish partially (as done:terminal=false).
3. Discarded: `step_start`; reasoning conflated; todo (todowrite is just a tool label); continuation (no event); runtime transition (no event).
4. Server-only: continuation spawn, process exit/close details, decision, busy lifecycle.
5. Inferred UI state: "Working…" label = last tool event or literal; isStreaming from store; no stage derivation.
6. Invisible lifecycle: thinking, todo/plan, step transitions, continuation, runtime/model transition, per-tool running→done, interrupt.
7. Developer Mode: cookie `developer_mode=on` (developer-mode-provider.tsx); current effect is ONLY terminal DeveloperDiagnostics + debug panel; no live lifecycle detail.
8. Event model adequacy: existing `token` SSE wrapper carries tool_use/step_start/reasoning; server can add minimal events (continuation, thinking) without a new event system. Tool name mapping must be fixed (key format mismatch). Todo requires either parsing todowrite input or a dedicated server event.

---

# 8. ROOT-CAUSE CLASSIFICATION

| Observation | Evidence | Classification | Root Cause? | Corrective Action |
|---|---|---|---|---|
| Working state insufficient / dropped mid-execution | smoke050 DOM: `Working…` visible 17.2s–33.4s, GONE at 34.3s while runtime ran to ~77s (8 steps, 8 tools). chat-message.tsx:149 LiveProgress active-line condition requires a 'running' event or lastEvent unset/running; tool events arrive only as 'completed' (CLI emits completed tool_use) → active line never shows | PROVEN | YES — LiveProgress's "active" indicator only renders on a 'running' event that never arrives | always render an active working line while `isStreaming` (drive from store isStreaming, not from tool status); show last completed label + "…" |
| Thinking state invisible | smoke DOM: never rendered 'Thinking' anywhere; server emits reasoning inside `token` SSE (server.ts:371) and transport conflates reasoning text into `token` content (http-transport.ts:458-460); no dedicated thinking/step_start event | PROVEN | YES — reasoning/step_start not surfaced as a distinct stage; transport drops `step_start` (default case 626-627) | add a `thinking`/stage chunk on `step_start` + reasoning presence; store a stage on the message; render "● Memproses..." while between tools |
| Todo state invisible/incomplete | `todowrite` tool_use flows through generic tool pipeline (transport 472-487 → store 585-605) as a transient label "Updating task list"; no TodoCreate/TodoUpdate anywhere in src; no todo field on ChatMessage | PROVEN | YES — no todo event parsing/state at all | parse `todowrite` input.todos into a plan list on the message; render "Rencana pekerjaan" with ✓/●/○ states; never treat todo as completion |
| Tool progress invisible | LiveProgress shows only last-3 completed labels; no running→done per tool; no failure/retry visual during streaming; ToolEvent has no range/op metadata persisted (detail never passed) | PROVEN | YES — LiveProgress omits active state (same as Working row); no per-tool status transitions surfaced | render tool list with running/completed/error states while streaming; persist safe detail (operation) for dev mode |
| Continuation invisible | server.ts spawnContinuation (421+) emits NO dedicated event; continuation child events reuse token/step_finish/done; transport has no continuation case; store has no continuation state | PROVEN | YES — no continuation event propagated | server: `sendEvent("continuation", {...})` on each continuation spawn; transport: forward; store: set a continuation flag/count; UI: "↻ Melanjutkan pekerjaan..." |
| Runtime/model transition invisible | same as continuation — no event; only server logs `[API] CONTINUING SESSION` / CONTINUATION PROCESS SPAWNED | PROVEN | YES — same as above | covered by continuation event (developer mode: show attempt/sessionId) |
| Error state unclear | error chunk → store sets status 'error' + executionState 'error' (store 759-783); UI renders error text (chat-message 344-347). During streaming a tool error becomes just a tool_event with status 'error' in list; no distinct failure visual until terminal | DERIVED | Partial — terminal errors ARE distinct; mid-stream tool errors are not | while streaming, show "⚠ ..." on tool error events; keep terminal error as-is |
| Interrupt state unclear | stopGeneration (store 820-836) sets `status:'cancelled'` but NEVER executionState 'cancelled'; EXEC_STATE_LABELS['cancelled'] dead code; cancelled w/o content → "Empty response." (350-352); no server cancel request (transport stopSession no-op 234-236; no cancel endpoint caller) | PROVEN | YES — cancelled is not a first-class lifecycle state; no distinct UI | set executionState 'cancelled' in stopGeneration + on server 'cancelled'/abort; render "Eksekusi dihentikan" distinct from completion |
| Completion state ambiguous | TASK-049 fix verified: done(terminal=true) only on genuine terminal; store finalizes status 'done' + executionState completed/completed_no_text; smoke run 2/3 + TASK-049 confirmed no false terminal post-fix | PROVEN (fixed) | No (already correct from TASK-049) | preserve; ensure new lifecycle UI never overrides terminal done |
| Developer Mode detail missing | DeveloperDiagnostics only when status==='done' (terminal); ToolEvent.detail never populated; no live lifecycle detail; no tool range/op/duration | PROVEN | YES — dev mode has no live technical view | populate ToolEvent.detail (safe op/range), render dev diagnostics live while streaming; add continuation/session/step detail |

Use only:

`PROVEN`

`DERIVED`

`UNPROVEN`

`UNKNOWN`

`INSUFFICIENT_EVIDENCE`

Do not turn an assumed UI improvement into a proven bug.

---

# 9. EVENT MODEL REQUIREMENT

If the runtime already emits sufficient events, reuse them.

Do NOT create duplicate event systems.

If events are missing, add only the minimum event information required.

The conceptual execution stream should be capable of representing:

- execution started;
- Thinking;
- Todo created;
- Todo updated;
- tool started;
- tool progress;
- tool succeeded;
- tool failed;
- retry started;
- continuation started;
- runtime transition;
- verification started;
- execution completed;
- execution failed;
- execution interrupted.

These are conceptual states.

Before implementation, inspect the existing codebase and preserve existing event naming/conventions where possible.

Do NOT blindly introduce new event names if equivalent existing events already exist.

### §9 Event Mapping Design (minimal, reuses existing events)

CLI JSON stream (PROVEN from smoke log, session `ses_feb80a21...`): `step_start` ×18, `tool_use` ×20, `step_finish` ×18, `text` ×16. No separate `reasoning` parts in JSON mode. These are the complete runtime lifecycle events.

Mapping (existing event → UI):

| Runtime event | Where it exists today | Target UI representation |
|---|---|---|
| `step_start` | server wraps as `token` (server.ts:371); transport DROPS it (http-transport.ts:626 default) | "● Memproses..." / thinking stage. Fix: transport `token` case emits `thinking` chunk on evtType `step_start`; store sets message stage + lifecycle entry |
| `tool_use` | transport → `tool_event` (472-487), but label mapping broken (key format mismatch → raw `Using google-sheets_...`) | "✓ Membaca data" / "● Membuat sheet baru" / "⚠ Gagal..." / "↻ Mencoba kembali..." — fix `TOOL_LABELS` keys to real names (`google-sheets_google_sheets_read_range` etc.); emit per-status; aggregate into a tool list on the message; derive plan from `todowrite` input |
| `step_finish` | transport → `done terminal:false` (507-539) | step boundary; usage/cost update (existing) |
| `text` | transport → `token` content (489-494) | final/streaming answer (existing) |
| `done` | server (642/645) → transport `done terminal:true/false` (586-601) | completion/failure terminal (existing, TASK-049 verified) |
| continuation | server spawns child but emits NO event | ADD `sendEvent("continuation", {attempt, sessionId})` at spawnContinuation (server.ts ~421); transport forwards; store sets `continuationCount`; UI "↻ Melanjutkan pekerjaan..." |
| cancel | `stopGeneration` sets status only (store 820-836); server `cancelled` on req close (665) | set `executionState:'cancelled'`; UI "Eksekusi dihentikan" |
| tool failure | transport `tool_event status:'error'` (479-481) | UI "⚠ ..." while streaming + retry line only if a retry event exists |
| session/model | `session` event exists | dev mode: continuation attempt + sessionId detail |

New types added (minimal): StreamChunk `thinking` + `continuation`; ChatMessage `plan?` (Todo items), `lifecycle?` (aggregated stages), `continuations?` (count). No new event system — reuses the SSE `token` wrapper + 2 additive events (`continuation`, `thinking` from step_start).

Normal UI (Dev OFF): stage line + plan (Rencana pekerjaan) + tool list (✓/●/⚠/↻) + continuation + failure/interrupt distinct + Execution Summary. Developer UI (Dev ON): live DeveloperDiagnostics with tool name/op/detail + lifecycle entries.

### §5 Step 6 — Direct Regression Test (2026-08-18)

Backend restarted with the server.ts change (new log `alpha-server-050.log`). Direct SSE test against `POST /api/opencode/chat/stream` on fresh disposable `13J08330PBg7-caBJdvp7z58HxAzu_N5Hy-UlPwwNiYw`:

- HTTP 200; event counts: `session:1, token:7, step_finish:3, done:1`
- **`step_start` forwarded as `token` ×3** (PASS — transport now maps these to `thinking` chunks)
- **`tool_use` forwarded ×3** with real MCP names `google-sheets_google_sheets_get_spreadsheet/list_sheets/read_range` (PASS — transport label map now resolves these; verified all three → human labels, no `Using ...` fallthrough)
- Terminal `done {terminal:true}` received; **0 error events** (PASS)
- `continuation` absent as expected for a single-process completion (0) — the server emits it only when a continuation actually spawns
- Project typecheck (`tsc -p tsconfig.app.json`): my changed files clean; remaining errors are pre-existing (`opencode-service.ts` sendPrompt arity, `activity-mapper.ts`, `isolated-runtime.ts` — all present before this task)

---

# 10. NORMAL UI — DEVELOPER MODE OFF

When Developer Mode is OFF, the UI must remain simple.

Do NOT expose:

- raw JSON;
- MCP protocol details;
- function arguments;
- stack traces;
- internal process IDs;
- internal server implementation details;
- raw token accounting;
- raw HTTP information;
- source-code paths;
- private model reasoning.

The UI should communicate:

### What the agent is doing

Examples:

`Memahami permintaan`

`Membaca data`

`Menganalisis data`

`Menyiapkan hasil`

`Memverifikasi hasil`

`Melanjutkan pekerjaan`

### What has already happened

Examples:

`✓ Data berhasil dibaca`

`✓ Analisis selesai`

`✓ Hasil berhasil dibuat`

### What is currently happening

Example:

`● Menganalisis data...`

### What happened when execution fails

Example:

`⚠ Terjadi kendala saat membaca data`

If retry is actually occurring:

`Mencoba kembali...`

Do not claim a retry if no retry event occurred.

---

# 11. THINKING STATE

Do NOT expose private/internal model reasoning.

The UI may show a concise execution status derived from the actual runtime state.

Good:

`● Menganalisis data...`

or:

`● Menentukan produk yang sesuai...`

Not acceptable:

- raw chain-of-thought;
- hidden reasoning text;
- verbose internal reasoning;
- fabricated reasoning.

The purpose is to tell the user:

> The agent is still actively working and what high-level stage it is currently performing.

---

# 12. TODO / PLAN PRESENTATION

Todo state must not be treated as completion.

If the runtime creates a plan, the UI should be capable of presenting meaningful progress.

Example:

`Rencana pekerjaan`

`✓ Membaca data`

`✓ Menganalisis performa`

`● Menyiapkan rekomendasi`

`○ Membuat output`

`○ Memverifikasi hasil`

Do not display a Todo as completed merely because `step_finish` or another intermediate terminal-like event was received.

Completion must remain tied to actual execution completion criteria.

---

# 13. TOOL EXECUTION PRESENTATION

Normal UI should summarize tool activity.

Examples:

Actual tool:

`google_sheets_google_sheets_read_range`

Normal UI:

`Membaca data Product Performance`

Actual tool:

`google_sheets_google_sheets_create_sheet`

Normal UI:

`Membuat sheet baru`

Actual tool:

`google_sheets_google_sheets_write_ranges`

Normal UI:

`Menambahkan hasil`

The mapping must be based on actual tool/event semantics.

Do not fabricate descriptions that contradict the operation being executed.

---

# 14. TOOL RESULT PRESENTATION

The UI should distinguish:

- currently executing;
- succeeded;
- failed;
- retrying.

Example:

`● Membaca data...`

then:

`✓ Data berhasil dibaca`

If failure:

`⚠ Gagal membaca data`

If retry:

`↻ Mencoba kembali...`

The user should not need Developer Mode to understand that an operation failed and whether the system is still working.

---

# 15. CONTINUATION

Continuation is an important runtime state.

If an execution ends and the same logical task continues, normal UI should clearly communicate:

`↻ Melanjutkan pekerjaan...`

The UI must not imply:

`Completed`

when execution is actually continuing.

Developer Mode may expose more detail, such as:

- execution/session sequence;
- model/build transition;
- continuation reason;
- runtime transition.

Do not expose unnecessary internal details in normal UI.

---

# 16. RUNTIME / MODEL TRANSITION

If the runtime exits one execution and starts another execution as part of the same logical task, this must not disappear from the lifecycle.

Normal UI:

`↻ Melanjutkan pekerjaan...`

Developer Mode:

show the actual runtime transition with sufficient technical context to diagnose it.

Do not invent a transition if none occurred.

---

# 17. INTERRUPT / CANCEL

If the runtime supports interrupt/cancellation, the user must be able to understand when execution is interrupted.

Normal UI:

`Eksekusi dihentikan`

Developer Mode:

show the relevant runtime event/details.

Do not display:

`Completed`

after an interrupted execution.

If interrupt capability is not currently wired to Alpha Workspace, audit and classify it before implementation.

Do not implement unrelated terminal behavior solely because OpenCode terminal has it.

---

# 18. FAILURE / TIMEOUT

Failure must be an explicit lifecycle state.

Example:

`⚠ Eksekusi tidak selesai`

`Waktu eksekusi habis sebelum pekerjaan selesai.`

If the runtime provides an actionable failure state, show it.

Do not turn timeout into:

`Done`

Do not leave the user indefinitely seeing:

`Working...`

after the runtime has actually terminated.

---

# 19. COMPLETION

Completion must be based on actual runtime completion.

A plan/Todo alone is not completion.

A tool call alone is not completion.

A partial response is not necessarily completion.

A continuation request is not completion.

Completion must use the existing proven terminal/completion criteria from the Alpha Workspace runtime.

Do not regress safeguards established by previous tasks.

---

# 20. DEVELOPER MODE ON

Developer Mode ON should expose more runtime detail without changing execution behavior.

It may expose:

### Lifecycle

- execution start;
- Thinking;
- Todo;
- tool events;
- retries;
- continuation;
- runtime/model transitions;
- verification;
- completion/failure;
- interrupt.

### Tool detail

- actual tool name;
- operation;
- status;
- duration where available;
- relevant range/operation metadata where safe.

### Runtime detail

- model/build;
- execution/session identifier where appropriate;
- context information if already available;
- step information if available;
- latency/duration if available.

### Errors

- actual technical error;
- relevant failure stage;
- retry;
- final failure.

Do not expose:

- secrets;
- OAuth tokens;
- credentials;
- private access tokens;
- authorization headers;
- sensitive internal data.

Developer Mode is an observability view, not a permission escalation.

---

# 21. DEVELOPER MODE OFF / ON INVARIANT

Both modes must represent the same execution.

Only presentation detail changes.

Example:

Developer Mode OFF:

`● Membaca data...`

Developer Mode ON:

`● Tool: google_sheets_read_range`
`Range: Product Performance_Monthly!A1:Z127`
`Status: running`

Both must refer to the same actual runtime event.

Do NOT create separate fake state machines for each mode.

---

# 22. NO FAKE PROGRESS

Do not implement progress based on:

- timers;
- percentage animation;
- arbitrary intervals;
- random status rotation;
- estimated completion without runtime evidence.

For example, this is NOT acceptable:

`Analyzing... → 10% → 30% → 60% → 90%`

unless those progress measurements actually exist in the runtime.

Use real execution events.

---

# 23. UI POSITIONING

The execution state must be visually associated with the relevant OpenCode/AI message.

Do not create a detached global `Working...` indicator that leaves ambiguity about which execution it belongs to.

The user must immediately understand:

> This execution card is currently active.

The lifecycle should remain visually attached to its corresponding AI execution/message.

---

# 24. TERMINAL REFERENCE RULE

Use OpenCode terminal behavior as a reference for lifecycle completeness only.

The target is:

`OpenCode lifecycle completeness`

NOT:

`OpenCode terminal UI duplication`

Alpha Workspace should remain native to Alpha Workspace.

Do not copy:

- terminal layout;
- terminal styling;
- raw terminal logs;
- CLI controls;
- raw process output.

The objective is:

> Every meaningful execution step must be represented, but the presentation must remain simple when Developer Mode is OFF.

---

# 25. E2E TEST MATRIX

Test at least:

### A. Normal successful execution

Expected:

`start → thinking → plan → tools → result → completion`

### B. Multiple tool execution

Expected:

all meaningful tool progress represented.

### C. Continuation

Expected:

`execution → continuation → execution → completion`

### D. Tool failure + retry

Expected:

`tool → failure → retry → success`

only when the runtime actually retries.

### E. Final failure

Expected:

`execution → failure`

not `completion`.

### F. Interrupt

Expected:

`execution → interrupted`

not `completion`.

### G. Developer Mode OFF

Expected:

simple, understandable execution states.

### H. Developer Mode ON

Expected:

same lifecycle with additional technical details.

### I. Todo-only intermediate state

Expected:

Todo remains in progress and does not produce false completion.

### J. Real Google Sheets workflow

Expected:

actual tool execution reflected in UI.

### §25 Test Matrix Results (2026-08-18)

| Case | Expected | Result | Evidence |
|---|---|---|---|
| A. Normal successful execution | start → thinking → plan → tools → result → completion | PASS | Dev OFF E2E: Working→"Memproses permintaan…"→"Memeriksa struktur spreadsheet"→"Membaca data"→"Membuat sheet"→"Menulis data"→read-back→"Selesai"→Execution Summary; exit 0 SUCCESS |
| B. Multiple tool execution | all meaningful tool progress represented | PASS | Dev OFF E2E showed 8+ distinct human tool labels continuously (never dropped); 20/20 candidates written |
| C. Continuation | execution → continuation → execution → completion | PASS | Dev ON E2E: `[52.0s] Melanjutkan pekerjaan…` ×2 while server logged `CONTINUING SESSION` → `CONTINUATION PROCESS SPAWNED pid 20008 attempt 1` → `CONTINUATION PROCESS CLOSE {attempt 1, terminalStepFinishReceived: true, isTerminal: true}`; UI then showed tool labels again and completed with Execution Summary |
| D. Tool failure + retry | tool → failure → retry → success only when runtime retries | NOT OBSERVED (no retry occurred in runs) | no `retry` event emitted by runtime in any test run; UI correctly shows no fabricated retry (§10: do not claim retry without event) |
| E. Final failure | execution → failure (not completion) | PASS | free-model run: provider 429 → UI "OpenCode exited with code 1 before producing a final answer."; server `PROCESS CLOSE {code 1, decision:'EXIT_CODE_1', terminalStepFinishReceived:false}`; NOT "Completed", NOT stuck "Working…" |
| F. Interrupt | execution → interrupted (not completion) | PASS | Stop clicked at 20.6s during active execution → UI "**Eksekusi dihentikan**" persisted 12+ samples; NO Execution Summary, NO "Empty response", NO "Completed" |
| G. Developer Mode OFF | simple, understandable states | PASS | human labels + stage line + plan only; no raw tool names (`Using google-sheets_...` never shown; `google-sheets_google_sheets_*` never in DOM) |
| H. Developer Mode ON | same lifecycle + technical detail | PASS | Dev ON E2E: Developer Diagnostics rendered live (saw in DOM), same lifecycle labels; server log shows tool names/ranges/status for technical audit |
| I. Todo-only intermediate state | Todo remains in progress, no false completion | PARTIAL — todowrite never triggered in these runs; plan rendering built but untested live | agent used inline planning (bash analysis) instead of `todowrite`; `plan` UI path present but not exercised — recorded as limitation |
| J. Real Google Sheets workflow | actual tool execution reflected in UI | PASS | both E2E runs: create_sheet/read_range/write_range reflected as human labels tied to actual tool events (verified against server log tool_use) |

Note on D/I: the opencode-go model planned inline (bash) rather than calling `todowrite`, so the Todo plan UI path was built but not live-triggered in these runs (the `todowrite` tool path is exercised in TASK-049's Kanal log where the agent used it). No retry events were emitted by the runtime, so no retry UI was shown — correct per §10/§14 (never claim a retry that didn't occur).

---

# 26. REAL ALPHA WORKSPACE TEST

Use:

`http://localhost:3000/workspace/assistant`

Execute a real spreadsheet workflow requiring multiple tool calls.

Capture evidence of:

- initial state;
- Thinking;
- Todo;
- tool calls;
- tool results;
- Working state;
- continuation if triggered;
- completion;
- Execution Summary.

Compare UI against actual runtime evidence.

The UI is not allowed to claim a state that the runtime did not produce.

---

# 27. DEVELOPER CONSOLE / RUNTIME EVIDENCE

Use browser/developer/runtime logs where useful.

If the UI says:

`Membuat sheet baru`

prove that an actual sheet-creation tool event occurred.

If the UI says:

`Melanjutkan pekerjaan`

prove that continuation occurred.

If the UI says:

`Selesai`

prove that the runtime actually completed.

This is an evidence-first UI task.

---

# 28. REGRESSION GATES

Verify existing Alpha Workspace behavior:

- normal chat;
- new chat;
- existing chat;
- tool execution;
- Todo;
- continuation;
- final response;
- Execution Summary;
- retry;
- timeout;
- Developer Mode toggle;
- existing Google Sheets workflows.

Do not expand scope into unrelated UI redesign.

---

# 29. SCOPE CONTROL

## In Scope

- execution lifecycle observability;
- runtime event propagation required for observability;
- execution state aggregation;
- execution UI;
- Developer Mode presentation;
- lifecycle E2E tests.

## Out of Scope

- Google Sheets MCP capability expansion;
- new agent framework;
- CrewAI;
- Google ADK;
- model routing;
- general OpenCode redesign;
- terminal UI clone;
- unrelated workspace navigation;
- unrelated chat UX;
- business-domain features.

If an unrelated issue is discovered:

record it in BACKLOG only.

---

# 30. PERFORMANCE

Do not materially increase runtime cost merely to display UI state.

Prefer:

- existing events;
- existing event stream;
- lightweight state aggregation;
- incremental UI updates.

Do not duplicate expensive MCP calls solely for UI observability.

The UI must observe execution, not execute it again.

---

# 31. SECURITY

Do not expose:

- OAuth tokens;
- API keys;
- credentials;
- authorization headers;
- secrets;
- private runtime credentials.

Developer Mode is not permission escalation.

Spreadsheet content remains untrusted data.

Do not allow runtime/tool output to override system or developer safety rules.

---

# 32. EXECUTION SUMMARY

Write the execution summary into this same task file.

Use:

## A. Initial Smoke Test

Actual current UI behavior (before implementation, 2026-08-18): ran a real Google Sheets flash-sale workflow on disposable `1h-89-D-...` with `opencode-go/deepseek-v4-flash`, Dev OFF. Runtime completed 8 steps / 8 tools (list_sheets → get_spreadsheet → read_range → bash ×2 → create_sheet → write_range → read_range verify) and produced a correct 39/39-candidate sheet. **UI showed only:**
- `Working…` from 17.2s–33.4s, then **disappeared at 34.3s** while the runtime kept running to ~77s (UI went silent/stale).
- Raw technical labels `Using google-sheets_google_sheets_list_sheets` / `get_spreadsheet` — no human summary.
- No Thinking, no Todo/plan, no per-tool status, no verification stage ever rendered.
- Free-model first attempt: provider 429 → `Working…` for ~80s then `OpenCode exited with code 1` (failure not promptly distinguishable).

## B. Runtime Audit

Traced end-to-end: `CLI child (server.ts) → SSE sendEvent → HTTPTransport parseSSEBlock + switch → StreamChunk → opencode-store sendMessage → ChatMessage → chat-message.tsx`. Findings (see §7): server emits session/token/step_finish/file_operation/stderr/error/done/exit/cancelled; transport drops `step_start` (default case) and conflates reasoning text into content; `TOOL_LABELS` keys (`google_sheets.list_sheets`) never match real MCP names (`google-sheets_google_sheets_list_sheets`) → raw-name fallthrough; store tracks no thinking/todo/continuation/cancelled-executionState; `LiveProgress` active line requires a `running` event that never arrives → Working disappears; `EXEC_STATE_LABELS` dead code; DeveloperDiagnostics terminal-only with no detail; cancel is client-side only.

## C. Evidence Classification

- `PROVEN` (smoke DOM + chat-message.tsx:149): Working indicator dropped mid-execution; raw tool names in normal UI.
- `PROVEN` (smoke DOM): Thinking and Todo never rendered.
- `PROVEN` (server.ts/transport/store audit): no continuation event, no cancelled executionState, no tool detail.
- `DERIVED`: terminal error state was already distinct (TASK-049); the gap was mid-stream tool failure visibility.
- `UNPROVEN`: retry behavior (runtime emitted no retry events in any test run).
- `INSUFFICIENT_EVIDENCE`: live Todo plan rendering (todowrite not triggered by opencode-go in these runs).

## D. Root Cause

Lifecycle info was missing because: (1) `LiveProgress` gated the active working line on a `running` tool event that never arrives (tools emit `completed` only) — so the UI silently stopped indicating activity; (2) tool-label keys were in the wrong namespace so labels fell back to raw technical names; (3) `step_start` was dropped and reasoning conflated into content (no thinking stage); (4) no continuation/cancel/todo events were propagated to the store/UI; (5) Developer Mode had no live detail channel.

## E. Implementation

- `src/services/opencode/server.ts`: emit `sendEvent("continuation", { attempt, sessionId })` when a continuation spawns (spawnContinuation).
- `src/features/ai/opencode/types.ts`: added `thinking`/`continuation` StreamEventType; `LifecycleStage`, `TodoItem` interfaces; StreamChunk `thinking`/`continuation` fields; ChatMessage `lifecycle`/`plan`/`continuations`; ToolEvent `todos`.
- `src/features/ai/opencode/services/http-transport.ts`: mapped real MCP tool names (`google-sheets_google_sheets_*`) to Indonesian labels + safe sheet/range context; `toolDetail()` for Dev Mode; forward `step_start` → `thinking` chunk; guard reasoning text from content; forward `continuation` SSE → chunk; parse `todowrite` input → `todos` on ToolEvent.
- `src/features/ai/opencode/store/opencode-store.ts`: lifecycle helpers (pushStage/appendOrUpdateStage); assistant msg initialized with lifecycle + continuations:0; handle `thinking` (stage), `continuation` (count + stage), tool_event (stage + plan from todos); terminal done → completed/failed stage; error → failed stage; stopGeneration → executionState `'cancelled'` + interrupted stage.
- `src/features/ai/opencode/components/chat-message.tsx`: LiveProgress always shows an active working line while streaming (fixes the dropped indicator), derives stage from lifecycle/tools; added TodoPlan ("Rencana pekerjaan"); continuation banner "Melanjutkan pekerjaan…"; distinct "Eksekusi dihentikan" terminal; error terminal with icon; live DeveloperDiagnostics (streaming + terminal) with lifecycle/tool/detail; removed dead `EXEC_STATE_LABELS`.

## F. Event Mapping

| Runtime event | UI representation |
|---|---|
| `step_start` (token) | `thinking` chunk → "● Memproses permintaan…" stage |
| `tool_use` | human label ("✓ Membaca data", "● Membuat sheet baru", "⚠ ...") + lifecycle tool stage + Dev detail (operation/range/sheet) |
| `step_finish` | usage/cost update (existing); boundary between steps |
| `text` | streamed answer (existing) |
| `done` terminal | "Selesai" / "Eksekusi tidak selesai" stage + Execution Summary |
| `continuation` | "↻ Melanjutkan pekerjaan…" banner + count + Dev detail (attempt/sessionId) |
| cancel (client abort) | executionState `cancelled` → "Eksekusi dihentikan" |
| `error` | failed stage + error terminal |

## G. Developer Mode OFF

Evidence (Dev OFF E2E, `10pTuqlpXl6-...`): lifecycle timeline showed Working→"Memproses permintaan…"→"Memeriksa struktur spreadsheet"→"Membaca metadata spreadsheet"→"Membaca data"→"Membuat sheet FlashSale050E2E"→"Menulis data FlashSale050E2E"→verification reads→"Selesai"→Execution Summary. Raw tool names (`google-sheets_google_sheets_*` / `Using google-sheets_...`) **never** appeared. Indicator never dropped (30.9s→80.4s continuous). 20/20 candidates correct.

## H. Developer Mode ON

Evidence (Dev ON E2E): same lifecycle labels + **Developer Diagnostics rendered live** (seen in DOM during streaming) with lifecycle entries and tool detail; continuation shown as "Melanjutkan pekerjaan…" with server-log technical context (`CONTINUING SESSION` → `CONTINUATION PROCESS SPAWNED pid 20008 attempt 1` → `CONTINUATION PROCESS CLOSE {attempt 1, terminalStepFinishReceived: true, isTerminal: true}`). Completion 20/20 candidates correct.

## I. E2E Lifecycle Tests

- Success: PASS (A, B, J) — full lifecycle + correct output.
- Retry: not observed (runtime never retried; UI correctly shows no fake retry) — PASS (no fabrication).
- Continuation: PASS (C) — real server continuation + UI "Melanjutkan pekerjaan…".
- Failure: PASS (E) — provider 429 → clear failure state, `decision:'EXIT_CODE_1'`, not "Completed".
- Interrupt: PASS (F) — Stop at 20.6s → "Eksekusi dihentikan", no false completion.
- Todo: PARTIAL (I) — plan UI built; `todowrite` not triggered by opencode-go in these runs (agent planned inline); no false completion from Todo (verified in design).

## J. Real Alpha Workspace Test

Both Dev OFF and Dev ON real runs through `http://localhost:3000/workspace/assistant` completed correctly (20/20 candidates each; source sheet unchanged; Execution Summary present). Continuation exercised end-to-end in the Dev ON run. Failure + interrupt verified in dedicated tests. No manual intervention required.

## K. Regression

- Direct SSE test: backend 200; `step_start`/`tool_use`/terminal done all forwarded; no error events.
- TASK-049 honest-terminal logic intact: failure run `decision:'EXIT_CODE_1'`, continuation close `isTerminal:true` → `done(terminal=true)`.
- Project typecheck (`tsc -p tsconfig.app.json`): my files clean; only pre-existing errors remain (`opencode-service.ts` sendPrompt arity, `activity-mapper.ts`, `isolated-runtime.ts` — all present before this task).
- Normal chat / new chat / existing chat / Execution Summary / Developer Mode toggle all exercised in E2E.

## L. Security

No secrets/tokens/credentials exposed. Dev Mode detail is operation/range/sheet-name only (never cell values, never auth). Reasoning text is explicitly prevented from becoming assistant content (http-transport reasoning guard). Spreadsheet content remains UNTRUSTED DATA — no rule changes. No new permissions; Dev Mode remains observability-only.

## M. Backlog

- `opencode-service.ts:97` sendPrompt signature arity mismatch (interface 7 params vs impl 8) — pre-existing, not introduced here.
- `todowrite` plan UI untested live with opencode-go (model planned inline) — needs a future run where the agent uses `todowrite` (TASK-049's Kanal log shows it does).
- Live tool-failure "⚠" during streaming not directly exercised (no tool error occurred in runs); code path present.
- Pre-existing typecheck errors in `activity-mapper.ts` / `isolated-runtime.ts` — unrelated.

## N. Final Verdict

`PASS WITH LIMITATION`

Limitations: (1) Todo/plan live rendering not exercised end-to-end because the tested model did not call `todowrite`; (2) tool-failure/retry mid-stream UI not directly observed (no runtime retry/error occurred). Both are implemented and designed per spec but lack live evidence in this session's runs. All other criteria (smoke-before-implement, audit-before-implement, evidence-based root cause, full lifecycle representation, Thinking without private reasoning, tool execution visibility, continuation, interrupt, failure distinct from completion, Dev OFF simple / Dev ON detailed, same underlying execution, no fake progress, UI tied to execution, real E2E pass, safeguards intact) are met.

---

# 33. PASS CRITERIA

PASS requires:

1. Real smoke test performed before implementation.
2. Audit performed before implementation.
3. Root cause supported by evidence.
4. Complete execution lifecycle is represented.
5. Todo is not mistaken for completion.
6. Thinking is represented without exposing private reasoning.
7. Tool execution is represented.
8. Tool failures/retries are represented when they occur.
9. Continuation is represented when it occurs.
10. Runtime/model transition is not silently lost when relevant.
11. Interrupt is represented when supported/tested.
12. Failure/timeout is clearly distinct from completion.
13. Completion reflects actual runtime completion.
14. Developer Mode OFF remains simple.
15. Developer Mode ON exposes useful technical detail.
16. Both modes reflect the same underlying execution.
17. No fake progress exists.
18. UI state is tied to the relevant AI/OpenCode execution.
19. Real Alpha Workspace E2E passes.
20. Existing runtime safeguards remain intact.
21. Execution Summary is written only after execution/testing is complete.

---

# 34. FINAL DESIGN RULE

The implementation must follow:

> DO NOT HIDE EXECUTION FACTS.
>
> DO NOT FLOOD THE USER WITH ENGINEERING DETAILS.
>
> PRESERVE THE COMPLETE RUNTIME LIFECYCLE.
>
> SIMPLIFY ONLY THE PRESENTATION.

Normal UI answers:

`Apa yang sedang terjadi?`

Developer Mode answers:

`Apa tepatnya yang sedang terjadi di runtime?`

Both must describe the same real execution.
