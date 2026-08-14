import { HostTool } from './host-tool'
import { type ToolConfig, type ToolDefinition } from '../types'

const definition: ToolDefinition = {
  id: 'terminal',
  name: 'Terminal',
  description: 'Run shell commands in the workspace environment.',
  version: '1.0.0',
  category: 'terminal',
  capabilities: [
    { id: 'run', label: 'Run' },
    { id: 'pipe', label: 'Pipe' },
  ],
  config: { enabled: false, executablePath: '', env: {} },
}

export class TerminalTool extends HostTool {
  constructor(config?: Partial<ToolConfig>) {
    super(
      config ? { ...definition, config: { ...definition.config, ...config } } : definition
    )
  }
}
