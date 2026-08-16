import { create } from 'zustand'
import { type ConnectionStatus, type HistoryEntry } from '../types'

interface WorkspaceState {
  projectName: string
  currentFolder: string
  status: ConnectionStatus
  setStatus: (status: ConnectionStatus) => void
}

interface AIState {
  opencodeStatus: ConnectionStatus
  kiloStatus: ConnectionStatus
  setOpenCodeStatus: (status: ConnectionStatus) => void
  setKiloStatus: (status: ConnectionStatus) => void
}

interface SessionState {
  activeTool: 'opencode' | 'kilo' | null
  setActiveTool: (tool: 'opencode' | 'kilo' | null) => void
}

interface HistoryState {
  entries: HistoryEntry[]
  addEntry: (entry: HistoryEntry) => void
  clear: () => void
}

interface WorkspaceStore {
  workspace: WorkspaceState
  ai: AIState
  session: SessionState
  history: HistoryState
}

const DEFAULT_FOLDER = 'C:\\dev\\alpha-one'

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  workspace: {
    projectName: 'alpha-one',
    currentFolder: DEFAULT_FOLDER,
    status: 'disconnected',
    setStatus: (status) =>
      set((state) => ({ workspace: { ...state.workspace, status } })),
  },
  ai: {
    opencodeStatus: 'disconnected',
    kiloStatus: 'disconnected',
    setOpenCodeStatus: (status) =>
      set((state) => ({ ai: { ...state.ai, opencodeStatus: status } })),
    setKiloStatus: (status) =>
      set((state) => ({ ai: { ...state.ai, kiloStatus: status } })),
  },
  session: {
    activeTool: null,
    setActiveTool: (tool) =>
      set((state) => ({ session: { ...state.session, activeTool: tool } })),
  },
  history: {
    entries: [],
    addEntry: (entry) =>
      set((state) => ({
        history: { ...state.history, entries: [entry, ...state.history.entries] },
      })),
    clear: () => set((state) => ({ history: { ...state.history, entries: [] } })),
  },
}))
