import { BaseTool } from './base-tool'
import {
  type ExecuteOptions,
  type ExecutionResult,
  type ToolConfig,
  type ToolDefinition,
} from '../types'

const definition: ToolDefinition = {
  id: 'kilo-code',
  name: 'Kilo Code',
  description: 'AI pair programmer for code completion and refactoring.',
  version: '1.0.0',
  category: 'ai',
  capabilities: [
    { id: 'complete', label: 'Complete' },
    { id: 'refactor', label: 'Refactor' },
  ],
  config: {
    enabled: true,
    executablePath: 'kilo',
    env: {},
  },
}

export class KiloCodeTool extends BaseTool {
  constructor(config?: Partial<ToolConfig>) {
    super({ ...definition, config: { ...definition.config, ...config } })
  }

  async execute(options: ExecuteOptions): Promise<ExecutionResult> {
    const id = `exec-${Date.now()}`
    const controller = this.newController(id)
    try {
      await this.delay(400, controller.signal)
      return {
        ok: true,
        data: {
          prompt: options.input,
          response: `Kilo Code handled: ${options.input ?? '(empty)'}`,
        },
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        return { ok: false, error: 'Execution cancelled.' }
      }
      return { ok: false, error: (err as Error).message }
    } finally {
      this.controllers.delete(id)
      this.running = false
    }
  }
}
