import {
  type ExecuteOptions,
  type ExecutionLogEntry,
  type ExecutionResult,
  type ToolExecution,
  type ToolState,
} from '../types'
import { toolRegistry } from '../registry/tool-registry'
import {
  loadHistory,
  saveHistory,
} from '../persistence'

export type RuntimeStatus = 'idle' | 'loading' | 'ready' | 'error'

function logEntry(
  level: ExecutionLogEntry['level'],
  message: string
): ExecutionLogEntry {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    level,
    message,
    createdAt: new Date().toISOString(),
  }
}

/**
 * Tool Runtime is the single execution surface for all tools.
 *
 * It loads tools from the registry, executes them through a common model,
 * tracks execution lifecycle, monitors health, and emits logs. It never
 * contains tool-specific logic — that lives in each provider.
 */
export class ToolRuntime {
  private executions = new Map<string, ToolExecution>()
  private status: RuntimeStatus = 'idle'

  constructor() {
    for (const exec of loadHistory()) {
      this.executions.set(exec.id, exec)
    }
  }

  getStatus() {
    return this.status
  }

  private persist() {
    saveHistory([...this.executions.values()])
  }

  async load(): Promise<ToolState[]> {
    this.status = 'loading'
    const states = await toolRegistry.states()
    this.status = 'ready'
    return states
  }

  async health(): Promise<ToolState[]> {
    return toolRegistry.states()
  }

  async execute(
    toolId: string,
    options: ExecuteOptions,
    onLog?: (entry: ExecutionLogEntry) => void
  ): Promise<ToolExecution> {
    const tool = toolRegistry.get(toolId)
    const execution: ToolExecution = {
      id: `exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      toolId,
      toolName: tool?.definition.name ?? toolId,
      status: 'running',
      startedAt: new Date().toISOString(),
      logs: [],
    }
    const addLog = (level: ExecutionLogEntry['level'], message: string) => {
      const entry = logEntry(level, message)
      execution.logs = [...execution.logs, entry]
      onLog?.(entry)
    }

    if (!tool) {
      addLog('error', `Tool "${toolId}" is not registered.`)
      execution.status = 'failed'
      execution.finishedAt = new Date().toISOString()
      this.executions.set(execution.id, execution)
      this.persist()
      return execution
    }

    if (!tool.definition.config.enabled) {
      addLog('error', `${tool.definition.name} is not installed.`)
      execution.status = 'failed'
      execution.finishedAt = new Date().toISOString()
      this.executions.set(execution.id, execution)
      this.persist()
      return execution
    }

    addLog('info', `Executing ${tool.definition.name}...`)
    try {
      const result: ExecutionResult = await tool.execute(options)
      if (result.ok) {
        addLog('result', JSON.stringify(result.data ?? {}))
        execution.status = 'succeeded'
      } else {
        addLog('error', result.error ?? 'Execution failed.')
        execution.status = 'failed'
      }
      execution.result = result
    } catch (err) {
      addLog('error', (err as Error).message)
      execution.status = 'failed'
    }

    execution.finishedAt = new Date().toISOString()
    execution.durationMs =
      new Date(execution.finishedAt).getTime() -
      new Date(execution.startedAt).getTime()
    this.executions.set(execution.id, execution)
    this.persist()
    return execution
  }

  async cancel(toolId: string, executionId: string) {
    const tool = toolRegistry.get(toolId)
    await tool?.cancel(executionId)
    const execution = this.executions.get(executionId)
    if (execution) {
      execution.status = 'cancelled'
      execution.finishedAt = new Date().toISOString()
    }
  }

  async stop(toolId: string) {
    const tool = toolRegistry.get(toolId)
    await tool?.dispose()
  }

  async restart(toolId: string) {
    const tool = toolRegistry.get(toolId)
    await tool?.dispose()
    await tool?.initialize()
  }

  getExecutions(): ToolExecution[] {
    return [...this.executions.values()].sort(
      (a, b) => b.startedAt.localeCompare(a.startedAt)
    )
  }
}

export const toolRuntime = new ToolRuntime()
