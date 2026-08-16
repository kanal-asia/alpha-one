/**
 * TASK-OPENCODE-035: Alpha SDK Adapter Interface
 *
 * Defines the formal boundary between Alpha One and OpenCode.
 * The adapter translates OpenCode-specific events into Alpha-native concepts.
 *
 * Responsibilities:
 * - Configuration translation (Alpha config → OpenCode config)
 * - Event translation (OpenCode SSE events → Alpha execution events)
 * - Lifecycle management (session start/stop/cancel)
 *
 * What the adapter MUST NOT expose:
 * - OpenCode SSE event structure
 * - OpenCode session lifecycle states
 * - OpenCode agent IDs
 * - OpenCode CLI flags
 * - Raw "Session not found" error messages
 */

import type {
  AlphaExecutionEvent,
  AlphaExecutionState,
} from '../types'

/**
 * Alpha SDK Adapter interface.
 * The transport layer implements this interface to translate OpenCode events.
 */
export interface OpenCodeAdapter {
  // Lifecycle
  send(message: string, sessionId?: string): Promise<void>
  cancel(): Promise<void>

  // Events
  onEvent(handler: (event: AlphaExecutionEvent) => void): void
  offEvent(handler: (event: AlphaExecutionEvent) => void): void

  // State
  getState(): AlphaExecutionState
  getSessionId(): string | null
  getExitCode(): number | null
}

/**
 * OpenCode-specific event types (internal to adapter).
 * NOT exported — UI never sees these.
 */
type OpenCodeEventType =
  | 'token'
  | 'done'
  | 'error'
  | 'warning'
  | 'session'
  | 'file_operation'
  | 'tool_event'
  | 'exit_code'

/**
 * Adapter event handler that translates OpenCode events to Alpha events.
 * The transport layer calls this handler for each SSE event.
 */
export function createAdapterEventTranslator() {
  const handlers = new Set<(event: AlphaExecutionEvent) => void>()
  let state: AlphaExecutionState = 'idle'
  let sessionId: string | null = null
  let exitCode: number | null = null

  function translate(chunk: {
    type: OpenCodeEventType
    content?: string
    error?: string
    sessionId?: string
    exitCode?: number
    terminal?: boolean
    toolEvent?: {
      tool: string
      status: 'running' | 'completed' | 'error'
      input?: Record<string, unknown>
    }
  }): AlphaExecutionEvent | null {
    switch (chunk.type) {
      case 'token':
        if (chunk.content) {
          state = 'running'
          return { type: 'text_delta', content: chunk.content }
        }
        return null

      case 'tool_event':
        if (chunk.toolEvent) {
          if (chunk.toolEvent.status === 'running') {
            state = 'waiting_for_tool'
            return {
              type: 'tool_start',
              tool: chunk.toolEvent.tool,
              input: chunk.toolEvent.input ?? {},
            }
          } else {
            state = 'running'
            return {
              type: 'tool_complete',
              tool: chunk.toolEvent.tool,
              output: '',
            }
          }
        }
        return null

      case 'session':
        if (chunk.sessionId) {
          sessionId = chunk.sessionId
        }
        return null

      case 'exit_code':
        if (chunk.exitCode !== undefined) {
          exitCode = chunk.exitCode
        }
        return null

      case 'error':
        state = 'error'
        return { type: 'error', message: chunk.error ?? 'Unknown error' }

      case 'done':
        if (chunk.terminal) {
          state = 'completed'
          return { type: 'execution_complete', exitCode: exitCode ?? 0 }
        }
        return null

      case 'warning':
        // Warnings are not Alpha events — log only
        return null

      case 'file_operation':
        // File operations are not Alpha events — log only
        return null

      default:
        return null
    }
  }

  return {
    translate,
    getState: () => state,
    getSessionId: () => sessionId,
    getExitCode: () => exitCode,
    reset: () => {
      state = 'idle'
      sessionId = null
      exitCode = null
    },
    onEvent: (handler: (event: AlphaExecutionEvent) => void) => {
      handlers.add(handler)
    },
    offEvent: (handler: (event: AlphaExecutionEvent) => void) => {
      handlers.delete(handler)
    },
    emit: (event: AlphaExecutionEvent) => {
      for (const handler of handlers) {
        handler(event)
      }
    },
  }
}
