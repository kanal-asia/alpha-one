import { HostTool } from './host-tool'
import { type ToolConfig, type ToolDefinition } from '../types'

const definition: ToolDefinition = {
  id: 'filesystem',
  name: 'Filesystem',
  description: 'Read, write, and inspect files in the workspace.',
  version: '1.0.0',
  category: 'filesystem',
  capabilities: [
    { id: 'read', label: 'Read' },
    { id: 'write', label: 'Write' },
    { id: 'list', label: 'List' },
  ],
  config: { enabled: false, executablePath: '', env: {} },
}

export class FilesystemTool extends HostTool {
  constructor(config?: Partial<ToolConfig>) {
    super(
      config ? { ...definition, config: { ...definition.config, ...config } } : definition
    )
  }
}
