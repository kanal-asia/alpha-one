import {
  type Provider,
  type ProviderId,
  type ProviderState,
} from './types/Provider'
import { OpenCodeProvider } from './OpenCodeProvider'
import { KiloCodeProvider } from './KiloCodeProvider'
import { GoogleWorkspaceProvider } from './GoogleWorkspaceProvider'

export interface ProviderManagerOptions {
  pollIntervalMs?: number
}

/**
 * Central registry and lifecycle owner for every provider. The UI reads
 * provider state exclusively through this manager (never directly from a
 * provider instance), which keeps providers independent and lets the manager
 * own health monitoring and connection state.
 */
export class ProviderManager {
  private providers = new Map<ProviderId, Provider>()
  private states = new Map<ProviderId, ProviderState>()
  private timer: ReturnType<typeof setInterval> | null = null
  private pollIntervalMs: number

  constructor(options: ProviderManagerOptions = {}) {
    this.pollIntervalMs = options.pollIntervalMs ?? 15000
    this.register(new OpenCodeProvider({ enabled: true, executablePath: 'opencode' }))
    this.register(new KiloCodeProvider({ enabled: true, executablePath: 'kilo' }))
    this.register(new GoogleWorkspaceProvider({ enabled: false }))
  }

  register(provider: Provider) {
    this.providers.set(provider.info.id, provider)
  }

  get(id: ProviderId): Provider | undefined {
    return this.providers.get(id)
  }

  list(): Provider[] {
    return [...this.providers.values()]
  }

  listStates(): ProviderState[] {
    return [...this.states.values()]
  }

  getState(id: ProviderId): ProviderState | undefined {
    return this.states.get(id)
  }

  /** Provider-specific connection detail (e.g. Google account/scopes). */
  getConnection(id: ProviderId): unknown {
    const provider = this.providers.get(id)
    return (provider as { getConnection?: () => unknown } | undefined)?.getConnection?.() ?? null
  }

  async initializeAll(): Promise<ProviderState[]> {
    const results = await Promise.all(
      this.list().map(async (provider) => {
        await provider.initialize()
        const state = this.snapshot(provider)
        this.states.set(provider.info.id, state)
        return state
      })
    )
    this.startPolling()
    return results
  }

  async refresh(id: ProviderId): Promise<ProviderState | undefined> {
    const provider = this.providers.get(id)
    if (!provider) return undefined
    await provider.healthCheck()
    const state = this.snapshot(provider)
    this.states.set(id, state)
    return state
  }

  async refreshAll(): Promise<ProviderState[]> {
    return Promise.all(
      this.list().map(async (p) => {
        await p.healthCheck()
        const state = this.snapshot(p)
        this.states.set(p.info.id, state)
        return state
      })
    )
  }

  async connect(id: ProviderId, params?: Record<string, unknown>) {
    const provider = this.providers.get(id)
    if (!provider) throw new Error(`Unknown provider: ${id}`)
    const state = await provider.connect(params)
    this.states.set(id, state)
    return state
  }

  async disconnect(id: ProviderId) {
    const provider = this.providers.get(id)
    if (!provider) return
    await provider.disconnect()
    this.states.set(id, this.snapshot(provider))
  }

  private snapshot(provider: Provider): ProviderState {
    return {
      info: provider.info,
      status: provider.getStatus(),
      health: provider.getHealth(),
      version: provider.getVersion(),
      lastCheckedAt: new Date().toISOString(),
    }
  }

  private startPolling() {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.refreshAll()
    }, this.pollIntervalMs)
  }

  dispose() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const provider of this.providers.values()) void provider.dispose()
  }
}

export const providerManager = new ProviderManager()
