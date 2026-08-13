import { create } from 'zustand'
import { providerManager } from '@/services/providers/ProviderManager'
import {
  type ProviderId,
  type ProviderState,
  type ProviderStatus,
} from '@/services/providers/types/Provider'

interface ProvidersStore {
  loaded: boolean
  initializing: boolean
  states: Record<ProviderId, ProviderState>
  connection: Record<ProviderId, unknown>
  lastUpdatedAt: string | null

  initialize: () => Promise<void>
  refresh: (id: ProviderId) => Promise<void>
  refreshAll: () => Promise<void>
  connect: (id: ProviderId, params?: Record<string, unknown>) => Promise<void>
  disconnect: (id: ProviderId) => Promise<void>
  getState: (id: ProviderId) => ProviderState
}

function toRecord(states: ProviderState[]): Record<ProviderId, ProviderState> {
  return states.reduce(
    (acc, s) => {
      acc[s.info.id] = s
      return acc
    },
    {} as Record<ProviderId, ProviderState>
  )
}

const emptyState = (id: ProviderId): ProviderState => ({
  info: { id, name: id, description: '', version: '', category: 'ai' },
  status: 'unknown',
  health: 'unknown',
  version: null,
  lastCheckedAt: null,
})

export const useProvidersStore = create<ProvidersStore>((set, get) => ({
  loaded: false,
  initializing: false,
  states: {} as Record<ProviderId, ProviderState>,
  connection: {} as Record<ProviderId, unknown>,
  lastUpdatedAt: null,

  initialize: async () => {
    if (get().initializing || get().loaded) return
    set({ initializing: true })
    const states = await providerManager.initializeAll()
    set({
      states: toRecord(states),
      loaded: true,
      initializing: false,
      lastUpdatedAt: new Date().toISOString(),
    })
  },

  refresh: async (id) => {
    const state = await providerManager.refresh(id)
    if (!state) return
    set((prev) => ({
      states: { ...prev.states, [id]: state },
      lastUpdatedAt: new Date().toISOString(),
    }))
  },

  refreshAll: async () => {
    const states = await providerManager.refreshAll()
    set({
      states: toRecord(states),
      lastUpdatedAt: new Date().toISOString(),
    })
  },

  connect: async (id, params) => {
    const state = await providerManager.connect(id, params)
    set((prev) => ({
      states: { ...prev.states, [id]: state },
      connection: { ...prev.connection, [id]: providerManager.getConnection(id) },
      lastUpdatedAt: new Date().toISOString(),
    }))
  },

  disconnect: async (id) => {
    await providerManager.disconnect(id)
    const state = providerManager.getState(id)
    if (state) {
      set((prev) => ({
        states: { ...prev.states, [id]: state },
        connection: { ...prev.connection, [id]: null },
        lastUpdatedAt: new Date().toISOString(),
      }))
    }
  },

  getState: (id) => get().states[id] ?? emptyState(id),
}))

export function statusLabel(status: ProviderStatus): string {
  return status.replace('_', ' ')
}
