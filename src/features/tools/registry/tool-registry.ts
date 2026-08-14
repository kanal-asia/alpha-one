import {
  type Tool,
  type ToolState,
} from '../types'
import { OpenCodeTool } from '../providers/opencode-tool'
import { KiloCodeTool } from '../providers/kilo-code-tool'
import { FilesystemTool } from '../providers/filesystem-tool'
import { TerminalTool } from '../providers/terminal-tool'
import { GitTool } from '../providers/git-tool'
import { PlaywrightTool } from '../providers/playwright-tool'
import { DocumentTool } from '../providers/document-tool'
import {
  loadConfigOverrides,
  saveConfigOverrides,
} from '../persistence'

export class ToolRegistry {
  private tools = new Map<string, Tool>()
  private overrides = loadConfigOverrides()

  constructor() {
    this.register(new OpenCodeTool(this.overrides.opencode))
    this.register(new KiloCodeTool(this.overrides.kilocode))
    // Real provider subclasses — execution is routed through the host bridge.
    this.register(new FilesystemTool(this.overrides.filesystem))
    this.register(new TerminalTool(this.overrides.terminal))
    this.register(new GitTool(this.overrides.git))
    this.register(new PlaywrightTool(this.overrides.browser))
    this.register(new DocumentTool(this.overrides.document))
  }

  updateConfig(id: string, config: Partial<import('../types').ToolConfig>) {
    const tool = this.tools.get(id)
    if (!tool) return
    tool.updateConfig(config)
    this.overrides[id] = { ...this.overrides[id], ...config }
    saveConfigOverrides(this.overrides)
  }

  register(tool: Tool) {
    this.tools.set(tool.definition.id, tool)
  }

  get(id: string): Tool | undefined {
    return this.tools.get(id)
  }

  list(): Tool[] {
    return [...this.tools.values()]
  }

  async states(): Promise<ToolState[]> {
    return Promise.all(
      this.list().map(async (tool) => {
        const health = await tool.healthCheck()
        const installed = tool.definition.config.enabled
        return {
          definition: tool.definition,
          status: installed ? 'installed' : 'not_installed',
          health,
          lastCheckedAt: new Date().toISOString(),
        }
      })
    )
  }
}

export const toolRegistry = new ToolRegistry()
