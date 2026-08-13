export type ProviderId = 'opencode' | 'kilo-code' | 'google-workspace'

export type ProviderStatus =
  | 'unknown'
  | 'detecting'
  | 'installed'
  | 'not_installed'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'busy'
  | 'streaming'
  | 'cancelled'
  | 'completed'
  | 'launching'

export type HealthState = 'healthy' | 'unhealthy' | 'unknown'

export interface ProviderConfig {
  enabled: boolean
  executablePath?: string
  /** Arbitrary provider-specific options (scopes, account, endpoints...). */
  options?: Record<string, unknown>
}

export interface ProviderInfo {
  id: ProviderId
  name: string
  description: string
  version: string
  category: 'ai' | 'cloud'
}

export interface ProviderState {
  info: ProviderInfo
  status: ProviderStatus
  health: HealthState
  version: string | null
  lastCheckedAt: string | null
  error?: string
}

export interface ConnectParams {
  [key: string]: unknown
}

/**
 * Unified contract every provider exposes. The UI only ever talks to a
 * provider through this interface — never directly to an external app.
 *
 * Local-first note: `detect()` / `connect()` are implemented with safe
 * browser-compatible stubs in this sprint. Swapping in a real IPC/HTTP
 * bridge (see the Tool Runtime host-bridge pattern) requires no UI changes.
 */
export interface Provider {
  readonly info: ProviderInfo

  initialize(): Promise<void>
  healthCheck(): Promise<HealthState>
  detect(): Promise<boolean>
  connect(params?: ConnectParams): Promise<ProviderState>
  disconnect(): Promise<void>
  getStatus(): ProviderStatus
  getVersion(): string | null
  getHealth(): HealthState
  execute?(input: unknown, options?: Record<string, unknown>): Promise<unknown>
  dispose(): Promise<void>
}

export function stateOf(
  info: ProviderInfo,
  status: ProviderStatus,
  health: HealthState,
  extra?: Partial<ProviderState>
): ProviderState {
  return {
    info,
    status,
    health,
    version: info.version,
    lastCheckedAt: new Date().toISOString(),
    ...extra,
  }
}
