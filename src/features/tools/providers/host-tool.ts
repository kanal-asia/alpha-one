import { BaseTool } from './base-tool'
import { hostBridge } from './host-bridge'
import {
  type ExecuteOptions,
  type ExecutionResult,
  type ToolConfig,
  type ToolDefinition,
} from '../types'

/**
 * Base for tools that execute through the host bridge. Concrete providers
 * only supply their definition; all execution is delegated to the bridge, so
 * a real backend (CLI/HTTP/IPC) can be introduced without touching the
 * runtime or individual providers.
 */
export abstract class HostTool extends BaseTool {
  async execute(options: ExecuteOptions): Promise<ExecutionResult> {
    const id = `exec-${Date.now()}`
    const controller = this.newController(id)
    try {
      return await hostBridge.run(
        this.definition.id,
        this.definition.config.executablePath,
        { ...options, signal: controller.signal },
        this.definition.config.env
      )
    } finally {
      this.controllers.delete(id)
      this.running = false
    }
  }

  protected withConfig(config?: Partial<ToolConfig>): ToolDefinition {
    return { ...this.definition, config: { ...this.definition.config, ...config } }
  }
}
