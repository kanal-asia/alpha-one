import { HostTool } from './host-tool'
import { type ToolConfig, type ToolDefinition } from '../types'

const definition: ToolDefinition = {
  id: 'browser',
  name: 'Browser',
  description: 'Automate browser interactions via Playwright.',
  version: '1.0.0',
  category: 'browser',
  capabilities: [
    { id: 'navigate', label: 'Navigate' },
    { id: 'click', label: 'Click' },
    { id: 'screenshot', label: 'Screenshot' },
  ],
  config: { enabled: false, executablePath: 'playwright', env: {} },
}

export class PlaywrightTool extends HostTool {
  constructor(config?: Partial<ToolConfig>) {
    super(
      config ? { ...definition, config: { ...definition.config, ...config } } : definition
    )
  }
}
