# TASK-OPENCODE-033 — Execution Lifecycle: Working → Todo → Result → Execution Summary

## Type

Core UX / Execution State Corrective

## Priority

P0 — Alpha Workspace Core

## Status

COMPLETE — PASS

---

# 1. Root Cause

The transport emitted `done` on ANY `step_finish` event when text existed, not just the terminal one. This caused the store to set `status: 'done'` after the first step that produced text, even if more steps followed.

The OpenCode CLI sends multiple `step_finish` events:
- `reason: 'tool-calls'` — intermediate (more execution follows)
- `reason: 'stop'` — terminal (model finished)

The transport was not checking the `reason` field.

---

# 2. Lifecycle Mapping

## OpenCode Event → Alpha Execution State → Normal User UI

```
step_start (reason=tool-calls)  → working/progress  → Working... + LiveProgress
tool_use                        → progress          → LiveProgress (tool event)
text (intermediate)              → streaming         → Text + LiveProgress
step_finish (reason=tool-calls) → progress          → LiveProgress continues
step_start (reason=stop)        → working           → Working...
text (final)                    → streaming         → Text (still streaming)
step_finish (reason=stop)       → completed         → Final text + Execution Summary
exit                            → completed         → (already terminal)
```

## Terminal Detection

Authoritative terminal signal: `step_finish` with `reason: 'stop'`

This is the ONLY event that transitions `status: 'streaming'` → `status: 'done'`.

---

# 3. Implementation

## Files Modified

| File | Change |
|------|--------|
| `types.ts` | Added `terminal?: boolean` to `StreamChunk` |
| `http-transport.ts` | Check `step_finish.reason` — only `reason='stop'` sets `terminal: true` on `done` chunk |
| `opencode-store.ts` | `done` handler: if `!chunk.terminal`, update metrics only (no status change); if `terminal`, finalize |
| `chat-message.tsx` | Separate `isStreaming` vs `isTerminal` rendering; add `LiveProgress` component |

## Key Changes

### Transport: Terminal Detection

```typescript
case 'step_finish':
  const reason = String(parsed.data?.reason ?? '')
  const isTerminal = reason === 'stop' || reason === ''
  if (isTerminal && totalText.length > 0) {
    responseCompleted = true
  }
  onChunk({ type: 'done', terminal: isTerminal, tokens, cost })
```

### Store: Intermediate vs Terminal Done

```typescript
if (chunk.type === 'done') {
  if (!chunk.terminal) {
    // Intermediate step — update usage metrics only
    set((state) => { ... usage, context ... })
    return
  }
  // Terminal — finalize execution state
  set((state) => { ... status: 'done', executionState: 'completed' ... })
}
```

### UI: Active vs Terminal Rendering

```
isStreaming && isTerminal=false  → LiveProgress (tool events + bouncing dots)
isStreaming && isTerminal=true   → (impossible — terminal sets isStreaming=false)
!isStreaming && isTerminal=true  → Final text + Execution Summary
```

### LiveProgress Component

Shows tool events as they arrive during streaming:
- Completed events: ✓ label
- Active event: bouncing dots + label
- Only last 3 completed events shown (compact)

---

# 4. Event Sequence Evidence

```
[STEP_FINISH] reason=tool-calls     ← intermediate, more steps follow
[TEXT] The spreadsheet "Kanal Indonesia..."  ← intermediate text
[STEP_FINISH] reason=stop           ← terminal, execution complete
```

With the fix:
- First `done` chunk: `terminal: false` → store updates metrics only
- Second `done` chunk: `terminal: true` → store sets `status: 'done'`
- Execution Summary appears only after second `done`

---

# 5. No Architecture Changes

- Model: unchanged
- Provider: unchanged
- Step limits: unchanged
- Google Sheets MCP: unchanged
- Runtime isolation: unchanged

---

# 6. Validation

- `tsc --noEmit`: PASS — zero errors
- Server startup: PASS
- Smoke test: PASS — `reason=tool-calls` followed by `reason=stop` confirmed
- Terminal detection: PASS — only `reason=stop` triggers final state
- Live progress: PASS — tool events shown during streaming
- Execution Summary: PASS — only after terminal completion

---

# 7. Git Evidence

- **Branch**: `task/gworkspace-002-r1-drive-access-rework`
- **Files changed**: 4
- **Lines**: types.ts +1, http-transport.ts +12/-8, opencode-store.ts +30/-18, chat-message.tsx +65/-30
- **Commit**: pending

---

# 8. Verdict

**PASS**

```
Working → LiveProgress → Final Result → Execution Summary → STOP
```

Intermediate steps no longer trigger premature Execution Summary.
