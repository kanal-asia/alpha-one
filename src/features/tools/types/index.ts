export type ToolCategory =
  | 'ai'
  | 'filesystem'
  | 'browser'
  | 'document'
  | 'terminal'
  | 'version_control'
  | 'future'

export type ToolStatus =
  | 'installed'
  | 'not_installed'
  | 'running'
  | 'stopped'
  | 'error'

export type HealthState = 'healthy' | 'unhealthy' | 'unknown'

export type ExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface ToolCapability {
  id: string
  label: string
}

export interface ToolConfig {
  enabled: boolean
  executablePath: string
  env: Record<string, string>
}

export interface ToolDefinition {
  id: string
  name: string
  description: string
  version: string
  category: ToolCategory
  capabilities: ToolCapability[]
  config: ToolConfig
}

export interface ToolState {
  definition: ToolDefinition
  status: ToolStatus
  health: HealthState
  lastCheckedAt?: string
}

export interface ExecutionLogEntry {
  id: string
  level: 'info' | 'error' | 'result'
  message: string
  createdAt: string
}

export interface ExecutionResult {
  ok: boolean
  data?: unknown
  error?: string
}

export interface ToolExecution {
  id: string
  toolId: string
  toolName: string
  status: ExecutionStatus
  startedAt: string
  finishedAt?: string
  durationMs?: number
  logs: ExecutionLogEntry[]
  result?: ExecutionResult
}

export interface ExecuteOptions {
  args?: Record<string, unknown>
  input?: string
  signal?: AbortSignal
}

/** Common lifecycle every tool must implement. */
export interface Tool {
  definition: ToolDefinition
  initialize(): Promise<void>
  healthCheck(): Promise<HealthState>
  execute(options: ExecuteOptions): Promise<ExecutionResult>
  cancel(executionId: string): Promise<void>
  dispose(): Promise<void>
  updateConfig(config: Partial<ToolConfig>): void
}
