import {
  type ExecuteOptions,
  type ExecutionResult,
  type HealthState,
  type Tool,
  type ToolCapability,
  type ToolConfig,
  type ToolDefinition,
} from '../types'

/** Shared implementation so every provider follows the same execution model. */
export abstract class BaseTool implements Tool {
  definition: ToolDefinition
  protected running = false
  protected controllers = new Map<string, AbortController>()

  constructor(definition: ToolDefinition) {
    this.definition = definition
  }

  async initialize(): Promise<void> {
    // No-op for mock providers. Real providers would resolve the executable.
  }

  async healthCheck(): Promise<HealthState> {
    return this.definition.config.enabled ? 'healthy' : 'unhealthy'
  }

  abstract execute(options: ExecuteOptions): Promise<ExecutionResult>

  async cancel(executionId: string): Promise<void> {
    this.controllers.get(executionId)?.abort()
    this.controllers.delete(executionId)
    this.running = false
  }

  async dispose(): Promise<void> {
    this.controllers.clear()
    this.running = false
  }

  updateConfig(config: Partial<ToolConfig>): void {
    this.definition = {
      ...this.definition,
      config: { ...this.definition.config, ...config },
    }
  }

  protected newController(executionId: string): AbortController {
    const controller = new AbortController()
    this.controllers.set(executionId, controller)
    this.running = true
    return controller
  }

  protected delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })
  }

  protected capability(id: string, label: string): ToolCapability {
    return { id, label }
  }
}
