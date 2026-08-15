# TASK-OPENCODE-028R1 — Chat Attachment Contrast + Response Loading UX

## Type

Small Corrective

## Priority

P1

## Status

COMPLETE

---

# Executive Verdict

**PASS**

---

# Finding A — Attachment Chip Contrast

## Root Cause

The `ReferenceChips` component uses default styling `bg-muted/60 text-foreground/80`. When rendered inside the user bubble (`bg-primary text-primary-foreground`), the parent only overrode the background (`[&>span]:bg-primary-foreground/10`) but left the text color as `text-foreground/80`. In dark mode, `primary` is very light (oklch 0.929) and `foreground` is near-white (oklch 0.984), making light text on a light background nearly invisible.

## Component

`src/features/ai/opencode/components/chat-message.tsx:73`

## Before

```tsx
<ReferenceChips references={message.references} className='[&>span]:bg-primary-foreground/10' />
```

## After

```tsx
<ReferenceChips references={message.references} className='[&>span]:bg-primary-foreground/10 [&>span]:text-primary-foreground [&>span]:border-primary-foreground/20' />
```

## Behavior

- Chip background: semi-transparent dark overlay (unchanged)
- Chip text: now uses `primary-foreground` (dark in dark mode, light in light mode) — matches bubble text
- Chip border: uses `primary-foreground/20` — subtle but visible

---

# Finding B — Missing Waiting State

## Root Cause

After the user sends a message, an empty assistant message with `status: 'streaming'` is created immediately. Before the first token arrives, the assistant bubble shows only a tiny pulsing cursor (`h-3.5 w-1.5 animate-pulse`). This is too subtle — users cannot tell whether the app is processing or stalled.

## Current Request Lifecycle

1. User sends → empty assistant message created with `status: 'streaming'`
2. `ensureRunning()` waits for runtime
3. SSE connection established
4. First token arrives → content populates
5. Stream completes → `isStreaming: false`

The gap between steps 1-4 is where the loading indicator is needed.

## Component

`src/features/ai/opencode/components/chat-message.tsx:134-142`

## Before

```tsx
) : isStreaming ? (
  <span className='inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle' />
)
```

## After

```tsx
) : isStreaming ? (
  <div className='flex items-center gap-2 text-sm text-muted-foreground'>
    <span className='flex gap-1'>
      <span className='inline-block size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]' />
      <span className='inline-block size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]' />
      <span className='inline-block size-1.5 animate-bounce rounded-full bg-current' />
    </span>
    <span>Thinking…</span>
  </div>
)
```

## Behavior

- Three animated bouncing dots with staggered delays
- "Thinking…" text label
- Uses `text-muted-foreground` for subtle appearance
- Disappears as soon as `message.content` is non-empty (first token arrives)
- Uses CSS-only animation (no JS timers, no GIF assets)

## State Transitions

| State | Condition | Indicator |
|-------|-----------|-----------|
| Pending | `!message.content && isStreaming` | ● ● ● Thinking… |
| Streaming | `message.content && isStreaming` | Response text + cursor |
| Completed | `message.content && !isStreaming` | Response text |
| Error | `message.status === 'error'` | Error state |
| Cancelled | `message.status === 'cancelled'` | Cancelled state |

---

# Visual QA

## Attachment contrast

- User bubble: `bg-primary` (light in dark mode)
- Chip text: `text-primary-foreground` (dark in dark mode) — readable
- Chip border: `border-primary-foreground/20` — visible

## Loading indicator

- Three dots animate with staggered bounce
- "Thinking…" text visible
- Disappears when first token arrives
- No orphaned indicator after completion/error

## Regression check

- Attachment remains clickable
- Resource reference unchanged
- No file copied
- No backend changes

---

# Validation

- `tsc --noEmit` — PASS
- ESLint — no new errors
- Runtime — server starts, chat functional

---

# Git Evidence

## Branch

`task/gworkspace-002-r1-drive-access-rework`

## Files Changed

```
M src/features/ai/opencode/components/chat-message.tsx
```

## Diff Stats

```
1 file changed, 8 insertions(+), 2 deletions(-)
```

---

# Verdict

**PASS**
