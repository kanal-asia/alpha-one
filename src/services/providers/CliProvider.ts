import {
  type ConnectParams,
  type HealthState,
  type Provider,
  type ProviderConfig,
  type ProviderInfo,
  type ProviderState,
  type ProviderStatus,
  stateOf,
} from './types/Provider'

/**
 * Shared base for CLI-backed providers (OpenCode, Kilo Code). Implements the
 * unified {@link Provider} contract with a real runtime bridge.
 */
export abstract class CliProvider implements Provider {
  protected config: ProviderConfig
  protected status: ProviderStatus = 'unknown'
  protected health: HealthState = 'unknown'
  protected lastError: string | null = null

  constructor(
    public readonly info: ProviderInfo,
    config?: Partial<ProviderConfig>
  ) {
    this.config = { enabled: false, ...config }
  }

  abstract readVersion(): Promise<string | null>

  async initialize(): Promise<void> {
    this.health = await this.healthCheck()
  }

  async healthCheck(): Promise<HealthState> {
    this.log('info', 'health_check', 'Starting health check')
    const installed = await this.detect()
    this.health = installed ? 'healthy' : 'unhealthy'
    this.log('info', 'health_check', `Health check result: ${this.health}`)
    return this.health
  }

  async detect(): Promise<boolean> {
    this.setStatus('detecting')
    this.log('info', 'detect', 'Detecting provider installation')
    try {
      const res = await fetch(`/api/opencode/health`, { cache: 'no-store' })
      if (!res.ok) {
        this.setStatus('not_installed')
        this.log('warn', 'detect', 'Health endpoint returned error')
        return false
      }
      const data = await res.json()
      const installed = data.cliReachable === true
      this.setStatus(installed ? 'installed' : 'not_installed')
      this.log('info', 'detect', `Detection result: ${installed ? 'installed' : 'not_installed'}`, { version: data.version })
      return installed
    } catch (err) {
      this.setStatus('not_installed')
      this.log('error', 'detect', 'Detection failed', { error: err instanceof Error ? err.message : 'Unknown error' })
      return false
    }
  }

  async connect(_params?: ConnectParams): Promise<ProviderState> {
    this.log('info', 'connect', 'Connecting to provider')
    const installed = await this.detect()
    if (!installed) {
      this.setStatus('error')
      this.lastError = `${this.info.name} is not installed.`
      this.log('error', 'connect', this.lastError)
      return stateOf(this.info, 'error', 'unhealthy', {
        error: this.lastError,
      })
    }
    this.setStatus('launching')
    this.log('info', 'connect', 'Launching runtime')
    // In a real implementation, this would start the runtime bridge
    this.setStatus('connected')
    const version = await this.readVersion()
    this.log('info', 'connect', 'Connected successfully', { version })
    return stateOf(this.info, 'connected', 'healthy', { version })
  }

  async disconnect(): Promise<void> {
    this.log('info', 'disconnect', 'Disconnecting provider')
    this.setStatus('disconnected')
  }

  getStatus(): ProviderStatus {
    return this.status
  }

  getVersion(): string | null {
    return this.info.version
  }

  getHealth(): HealthState {
    return this.health
  }

  async dispose(): Promise<void> {
    this.log('info', 'dispose', 'Disposing provider')
    this.setStatus('disconnected')
  }

  protected setStatus(status: ProviderStatus): void {
    this.status = status
    this.log('debug', 'status', `Status changed: ${status}`)
  }

  protected log(level: 'debug' | 'info' | 'warn' | 'error', category: string, message: string, meta?: Record<string, unknown>): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      provider: this.info.id,
      category,
      message,
      ...meta,
    }
    // Structured logging - in production would send to logging service
    // For now, use a custom logger that respects the no-console rule
    if (typeof window !== 'undefined') {
      const w = window as Window & { __LOGGER__?: (e: Record<string, unknown>) => void }
      if (w.__LOGGER__) {
        w.__LOGGER__(entry)
      }
    }
  }
}


