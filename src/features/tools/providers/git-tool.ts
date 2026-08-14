import { HostTool } from './host-tool'
import { type ToolConfig, type ToolDefinition } from '../types'

const definition: ToolDefinition = {
  id: 'git',
  name: 'Git',
  description: 'Version control operations on the workspace repository.',
  version: '2.0.0',
  category: 'version_control',
  capabilities: [
    { id: 'clone', label: 'Clone' },
    { id: 'commit', label: 'Commit' },
    { id: 'status', label: 'Status' },
  ],
  config: { enabled: false, executablePath: 'git', env: {} },
}

export class GitTool extends HostTool {
  constructor(config?: Partial<ToolConfig>) {
    super(
      config ? { ...definition, config: { ...definition.config, ...config } } : definition
    )
  }
}
