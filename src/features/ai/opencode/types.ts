import { type ConnectionStatus } from '../types'
import type { RuntimeModel } from '@/features/runtime/contract'
import type {
  ReferenceAttachment,
  ReferenceResolutionError,
} from '@/features/ai/references/contract'

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

export interface StreamChunk {
  type: StreamEventType
  content?: string
  error?: string
  sessionId?: string
  referenceErrors?: ReferenceResolutionError[]
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
  /** Model defaults. */
  temperature: number
  maxTokens: number
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
}

export type { ConnectionStatus }
