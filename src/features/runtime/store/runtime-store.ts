import { create } from 'zustand'
import {
  type RuntimeConnectionState,
  type RuntimeLog,
  type RuntimeSnapshot,
  deriveConnection,
} from '../types'

const POLL_INTERVAL_MS = 2500

async function fetchSnapshot(): Promise<RuntimeSnapshot | null> {
  try {
    const res = await fetch('/api/runtime', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    return (await res.json()) as RuntimeSnapshot
  } catch {
    return null
  }
}

async function postAction(path: string): Promise<RuntimeSnapshot | null> {
  try {
    const res = await fetch(`/api/runtime/${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) return null
    return (await res.json()) as RuntimeSnapshot
  } catch {
    return null
  }
}

interface RuntimeStore {
  snapshot: RuntimeSnapshot | null
  connection: RuntimeConnectionState
  apiUp: boolean
  lastError: string | null
  logs: RuntimeLog[]
  logsOpen: boolean
  initialized: boolean
  refreshing: boolean

  init: () => void
  refresh: () => Promise<void>
  start: () => Promise<void>
  restart: () => Promise<void>
  refreshModels: () => Promise<void>
  setLogsOpen: (open: boolean) => void
}

export const useRuntimeStore = create<RuntimeStore>((set, get) => ({
  snapshot: null,
  connection: 'starting_runtime',
  apiUp: false,
  lastError: null,
  logs: [],
  logsOpen: false,
  initialized: false,
  refreshing: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    void get().refresh()
    const interval = setInterval(() => {
      void get().refresh()
    }, POLL_INTERVAL_MS)
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => clearInterval(interval))
    }
  },

  refresh: async () => {
    if (get().refreshing) return
    set({ refreshing: true })
    const snapshot = await fetchSnapshot()
    if (snapshot) {
      set({
        snapshot,
        apiUp: true,
        connection: deriveConnection(snapshot),
        logs: snapshot.logs,
        lastError: snapshot.error,
        refreshing: false,
      })
    } else {
      set({ apiUp: false, connection: 'api_offline', refreshing: false })
    }
  },

  start: async () => {
    set({ connection: 'starting_runtime' })
    const snapshot = await postAction('start')
    if (snapshot) {
      set({
        snapshot,
        apiUp: true,
        connection: deriveConnection(snapshot),
        logs: snapshot.logs,
        lastError: snapshot.error,
      })
    } else {
      set({ apiUp: false, connection: 'api_offline' })
    }
  },

  restart: async () => {
    set({ connection: 'starting_runtime' })
    const snapshot = await postAction('restart')
    if (snapshot) {
      set({
        snapshot,
        apiUp: true,
        connection: deriveConnection(snapshot),
        logs: snapshot.logs,
        lastError: snapshot.error,
      })
    } else {
      set({ apiUp: false, connection: 'api_offline' })
    }
  },

  refreshModels: async () => {
    const snapshot = await postAction('refresh-models')
    if (snapshot) {
      set({
        snapshot,
        connection: deriveConnection(snapshot),
        logs: snapshot.logs,
      })
    }
  },

  setLogsOpen: (open) => set({ logsOpen: open }),
}))
