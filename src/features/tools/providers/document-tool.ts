import { HostTool } from './host-tool'
import { type ToolConfig, type ToolDefinition } from '../types'

const definition: ToolDefinition = {
  id: 'document',
  name: 'Document',
  description: 'Generate and transform documents from templates.',
  version: '1.0.0',
  category: 'document',
  capabilities: [
    { id: 'generate', label: 'Generate' },
    { id: 'convert', label: 'Convert' },
  ],
  config: { enabled: false, executablePath: '', env: {} },
}

export class DocumentTool extends HostTool {
  constructor(config?: Partial<ToolConfig>) {
    super(
      config ? { ...definition, config: { ...definition.config, ...config } } : definition
    )
  }
}
