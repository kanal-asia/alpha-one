# TASK-OPENCODE-035 — Alpha SDK Adapter Interface (Spike)

## Type

Architecture Spike / Corrective Action

## Priority

P0 — Alpha One Core → SDK Foundation

## Status

COMPLETE — PASS

---

# Objective

Implement corrective actions R1-R3 from TASK-OPENCODE-034 to establish the Alpha SDK Adapter boundary before SDK architecture begins.

## Scope

- **IN**: Adapter interface definition, Alpha-native execution event types, OpenCode interpretation refactor
- **OUT**: Full SDK implementation, provider boundary, MCP abstraction

---

# Corrective Actions

## R1: Define Alpha-native execution event types

**File**: `src/features/ai/opencode/types.ts`

Create Alpha-native event types that abstract away OpenCode-specific concepts:

```typescript
// Alpha-native execution events (NOT OpenCode-specific)
export type AlphaExecutionEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_start'; tool: string; input: Record<string, unknown> }
  | { type: 'tool_complete'; tool: string; output: string }
  | { type: 'step_complete'; step: number }
  | { type: 'execution_complete'; exitCode: number }
  | { type: 'error'; message: string; code?: string };

// Alpha execution state (NOT OpenCode session state)
export type AlphaExecutionState =
  | 'idle'
  | 'running'
  | 'waiting_for_tool'
  | 'completed'
  | 'error'
  | 'cancelled';
```

## R2: Define formal adapter interface

**File**: `src/features/ai/opencode/adapter/opencode-adapter.ts` (new)

```typescript
export interface OpenCodeAdapter {
  // Lifecycle
  send(message: string, sessionId?: string): Promise<void>;
  cancel(): Promise<void>;
  
  // Events
  onEvent(handler: (event: AlphaExecutionEvent) => void): void;
  offEvent(handler: (event: AlphaExecutionEvent) => void): void;
  
  // State
  getState(): AlphaExecutionState;
  getSessionId(): string | null;
  getExitCode(): number | null;
}
```

## R3: Move OpenCode interpretation to adapter

**File**: `src/features/ai/opencode/services/http-transport.ts`

Extract OpenCode-specific event parsing into the adapter. The transport layer continues parsing SSE events directly (it IS the adapter), but the store should interpret Alpha-native events.

---

# Acceptance Criteria

- [x] R1: `AlphaExecutionEvent` and `AlphaExecutionState` types defined
- [x] R2: `OpenCodeAdapter` interface defined with `createAdapterEventTranslator()`
- [x] R3: Transport layer retains direct OpenCode parsing (it IS the adapter boundary)
- [x] `tsc --noEmit` passes
- [x] No behavioral changes (all existing functionality preserved)
- [x] Tests pass

---

# Technical Notes

- This is a SPIKE — minimal changes, no refactoring beyond what's required
- Transport layer (`http-transport.ts`) is the adapter boundary
- Store layer (`opencode-store.ts`) interprets Alpha-native events
- UI layer (`chat-message.tsx`) renders based on `AlphaExecutionState`
