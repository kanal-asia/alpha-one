import { CliProvider } from './CliProvider'
import { type ProviderInfo } from './types/Provider'

const info: ProviderInfo = {
  id: 'opencode',
  name: 'OpenCode',
  description: 'Local AI coding agent for autonomous development tasks.',
  version: '1.0.0',
  category: 'ai',
}

const log = (msg: string, meta?: Record<string, unknown>) => {
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'test') {
    console.log(msg, meta ?? '')
  }
}

export class OpenCodeProvider extends CliProvider {
  constructor(config?: Partial<import('./types/Provider').ProviderConfig>) {
    super(info, config)
  }

  async readVersion(): Promise<string | null> {
    log('[PROVIDER] OPENCODE READ VERSION')
    try {
      const res = await fetch('/api/opencode/health', { cache: 'no-store' })
      if (!res.ok) return null
      const data = await res.json()
      log('[PROVIDER] OPENCODE VERSION', { version: data.version })
      return data.version ?? null
    } catch (err) {
      log('[PROVIDER] OPENCODE READ VERSION ERROR', { error: err instanceof Error ? err.message : 'unknown' })
      return null
    }
  }

  async detect(): Promise<boolean> {
    log('[PROVIDER] OPENCODE DETECT START')
    this.status = 'detecting'
    try {
      const res = await fetch('/api/opencode/health', { cache: 'no-store' })
      if (!res.ok) {
        this.status = 'not_installed'
        log('[PROVIDER] OPENCODE DETECT FAILED - HTTP ERROR', { status: res.status })
        return false
      }
      const data = await res.json()
      const installed = data.cliReachable === true
      this.status = installed ? 'installed' : 'not_installed'
      log('[PROVIDER] OPENCODE DETECT RESULT', { installed, cliReachable: data.cliReachable, version: data.version })
      return installed
    } catch (err) {
      this.status = 'not_installed'
      log('[PROVIDER] OPENCODE DETECT ERROR', { error: err instanceof Error ? err.message : 'unknown' })
      return false
    }
  }

  async connect(_params?: Record<string, unknown>): Promise<import('./types/Provider').ProviderState> {
    log('[PROVIDER] OPENCODE CONNECT START')
    const installed = await this.detect()
    if (!installed) {
      this.status = 'error'
      log('[PROVIDER] OPENCODE CONNECT FAILED - NOT INSTALLED')
      return this.createState('error', 'unhealthy', { error: `${this.info.name} is not installed.` })
    }
    this.status = 'connected'
    const version = await this.readVersion()
    log('[PROVIDER] OPENCODE CONNECT SUCCESS', { version })
    return this.createState('connected', 'healthy', { version })
  }

  private createState(
    status: import('./types/Provider').ProviderStatus,
    health: import('./types/Provider').HealthState,
    extra?: Partial<import('./types/Provider').ProviderState>
  ): import('./types/Provider').ProviderState {
    return {
      info: this.info,
      status,
      health,
      version: this.info.version,
      lastCheckedAt: new Date().toISOString(),
      ...extra,
    }
  }
}
