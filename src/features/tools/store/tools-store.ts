import { create } from 'zustand'
import {
  type ExecutionLogEntry,
  type ToolExecution,
  type ToolState,
} from '../types'
import { toolRuntime } from '../runtime/tool-runtime'

interface ToolsStore {
  loaded: boolean
  tools: ToolState[]
  executions: ToolExecution[]
  runtimeStatus: string
  activeToolId: string | null

  load: () => Promise<void>
  refreshHealth: () => Promise<void>
  setActiveTool: (id: string | null) => void
  execute: (
    toolId: string,
    options: { input?: string; args?: Record<string, unknown> }
  ) => Promise<void>
  cancel: (toolId: string, executionId: string) => Promise<void>
  updateConfig: (
    toolId: string,
    config: { enabled?: boolean; executablePath?: string; env?: Record<string, string> }
  ) => Promise<void>
  appendLog: (executionId: string, entry: ExecutionLogEntry) => void
}

export const useToolsStore = create<ToolsStore>((set, get) => ({
  loaded: false,
  tools: [],
  executions: [],
  runtimeStatus: 'idle',
  activeToolId: null,

  load: async () => {
    const tools = await toolRuntime.load()
    set({
      tools,
      loaded: true,
      runtimeStatus: toolRuntime.getStatus(),
    })
  },

  refreshHealth: async () => {
    const tools = await toolRuntime.health()
    set({ tools })
  },

  setActiveTool: (id) => set({ activeToolId: id }),

  execute: async (toolId, options) => {
    const execution = await toolRuntime.execute(
      toolId,
      { input: options.input, args: options.args },
      (entry) => {
        const current = get().executions.find((e) => e.id === entry.id)
        if (current) {
          get().appendLog(execution.id, entry)
        }
      }
    )
    set((state) => ({ executions: [execution, ...state.executions] }))
  },

  cancel: async (toolId, executionId) => {
    await toolRuntime.cancel(toolId, executionId)
    set((state) => ({
      executions: state.executions.map((e) =>
        e.id === executionId ? { ...e, status: 'cancelled' } : e
      ),
    }))
  },

  updateConfig: async (toolId, config) => {
    const { toolRegistry } = await import('../registry/tool-registry')
    toolRegistry.updateConfig(toolId, config)
    await get().refreshHealth()
  },

  appendLog: (executionId, entry) =>
    set((state) => ({
      executions: state.executions.map((e) =>
        e.id === executionId
          ? { ...e, logs: [...e.logs, entry] }
          : e
      ),
    })),
}))
