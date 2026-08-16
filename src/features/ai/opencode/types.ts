import { type ConnectionStatus } from '../types'
import type { RuntimeModel } from '@/features/runtime/contract'
import type {
  ReferenceAttachment,
  ReferenceResolutionError,
} from '@/features/ai/references/contract'

// ---------------------------------------------------------------------------
// TASK-OPENCODE-035: Alpha-native execution event types
// These abstract away OpenCode-specific SSE event names and structures.
// The adapter layer translates OpenCode events into these types.
// ---------------------------------------------------------------------------

export type AlphaExecutionEvent =
  | { type: 'text_delta'; content: string }
  | { type: 'tool_start'; tool: string; input: Record<string, unknown> }
  | { type: 'tool_complete'; tool: string; output: string }
  | { type: 'step_complete'; step: number }
  | { type: 'execution_complete'; exitCode: number }
  | { type: 'error'; message: string; code?: string }

export type AlphaExecutionState =
  | 'idle'
  | 'running'
  | 'waiting_for_tool'
  | 'completed'
  | 'error'
  | 'cancelled'

// Legacy types retained for backward compatibility during migration
export type OpenCodeSessionState =
  | 'not_started'
  | 'starting'
  | 'running'
  | 'busy'
  | 'finished'
  | 'stopped'
  | 'error'

export type ExecutionLogLevel = 'info' | 'prompt' | 'stream' | 'completed' | 'error'

export interface ExecutionLogEntry {
  id: string
  level: ExecutionLogLevel
  message: string
  createdAt: string
}

export type StreamEventType =
  | 'token'
  | 'done'
  | 'error'
  | 'warning'
  | 'session'
  | 'file_operation'
  | 'tool_event'
  | 'exit_code'

/** Scalar token metrics reported natively by OpenCode (`step_finish.tokens`). */
export interface TokenMetrics {
  total: number
  input: number
  output: number
  reasoning: number
  cacheRead: number
  cacheWrite: number
}

export interface StreamChunk {
  type: StreamEventType
  content?: string
  error?: string
  sessionId?: string
  referenceErrors?: ReferenceResolutionError[]
  /** Native usage captured from `step_finish` (PROVEN, not estimated). */
  tokens?: TokenMetrics
  cost?: number
  /** TASK-OPENCODE-018R2: File operation metadata from tool_use events. */
  filePath?: string
  fileTool?: string
  /** TASK-OPENCODE-030: Tool event for progress display. */
  toolEvent?: ToolEvent
  /** TASK-OPENCODE-030: Exit code from process. */
  exitCode?: number
  /** TASK-OPENCODE-033: Whether this done chunk signals terminal completion. */
  terminal?: boolean
}

export interface OpenCodeSession {
  id: string
  workspacePath: string
  state: OpenCodeSessionState
  startedAt?: string
  endedAt?: string
}

export interface OpenCodeSettings {
  executablePath: string
  workspacePath: string
  autoConnect: boolean
  autoReconnect: boolean
  streamingSpeed: number
  /** Model + mode chosen in the toolbar. */
  defaultModel: string
  defaultMode: string
  /** TASK-OPENCODE-023: Selected reasoning variant for the active model. */
  defaultVariant: string
  /** Behavior toggles. */
  autoSave: boolean
  streaming: boolean
  developerMode: boolean
}

export interface WorkspaceInfo {
  path: string
  name: string
  recent: boolean
}

export type ModelAvailability = 'available' | 'limited' | 'unavailable'

/**
 * UI model view. Every field of the canonical `RuntimeModel` contract is
 * preserved; `displayName` is shown and `id` (provider/slug) is what the
 * runtime always receives. availability/latency are display-only.
 */
export interface ModelInfo extends RuntimeModel {
  availability: ModelAvailability
  latency: 'low' | 'medium' | 'high'
}

export interface ModeInfo {
  id: string
  name: string
  description: string
}

export interface ProviderSummary {
  id: string
  name: string
  connection: 'connected' | 'configured' | 'available' | 'unavailable'
  modelCount: number
  freeModelCount: number
  hasCredentials: boolean
  requiresAuth: boolean
  source: 'runtime' | 'registry'
}

export interface OpenCodeAuthResult {
  ok: boolean
  command: string
  output: string
  timedOut: boolean
}

export type ChatRole = 'user' | 'assistant'

export type ChatMessageStatus = 'streaming' | 'done' | 'error' | 'cancelled'

/** TASK-OPENCODE-030: Execution state for UI feedback. */
export type ExecutionState =
  | 'idle'
  | 'working'
  | 'progress'
  | 'completed'
  | 'completed_no_text'
  | 'error'
  | 'cancelled'

/** TASK-OPENCODE-030: Safe tool event for user-facing progress. */
export interface ToolEvent {
  id: string
  label: string
  tool: string
  status: 'running' | 'completed' | 'error'
  timestamp: string
  /** Developer Mode only — raw technical detail. */
  detail?: string
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: string
  status?: ChatMessageStatus
  model?: string
  mode?: string
  tokens?: number
  durationMs?: number
  /** Reference metadata only — never file content/binary. */
  references?: ReferenceAttachment[]
  /** Structured resolution errors surfaced by the backend. */
  referenceErrors?: ReferenceResolutionError[]
  /** Native scalar usage reported by the runtime for this message. */
  usage?: TokenMetrics
  cost?: number
  /** TASK-OPENCODE-030: Execution state and tool events. */
  executionState?: ExecutionState
  toolEvents?: ToolEvent[]
  exitCode?: number
}

export type ContextStatus = 'normal' | 'attention' | 'high' | 'critical'

/**
 * Derived context usage (DERIVED, never presented as a native value): current
 * step tokens vs the model's context window. `null` means the basis is missing
 * (no tokens or unknown context window) — never converted into 0%.
 */
export interface ChatContext {
  used: number
  limit: number
  percent: number
  status: ContextStatus
}

export interface ChatUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  reasoningTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cost: number
}

export interface ChatProjectContext {
  id?: string
  name?: string
  path?: string
}

export interface Chat {
  id: string
  title: string
  messages: ChatMessage[]
  sessionId?: string
  /** Project context stamped when the chat is created/sent. */
  project?: ChatProjectContext
  createdAt: string
  updatedAt: string
  /** Aggregated native usage across this conversation (scalar state only). */
  usage?: ChatUsage
  /** Derived context usage vs the active model's context window. */
  context?: ChatContext | null
  /** Whether the chat is archived. */
  archived?: boolean
}

/** Mirrors the backend `opencode stats` parser (native totals). */
export interface UsageStats {
  sessions: number | null
  messages: number | null
  days: number | null
  totalCost: number | null
  avgCostPerDay: number | null
  avgTokensPerSession: number | null
  medianTokensPerSession: number | null
  inputTokens: number | null
  outputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
}

export interface CompactResult {
  supported: boolean
  ok?: boolean
  message?: string
}

export type { ConnectionStatus }
