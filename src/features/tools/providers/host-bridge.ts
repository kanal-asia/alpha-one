import {
  type ExecuteOptions,
  type ExecutionResult,
} from '../types'

/**
 * Host bridge is the seam between a tool provider and the actual execution
 * environment (CLI process, HTTP service, IPC, or a remote agent).
 *
 * Providers never talk to the host directly — they call the bridge. Swapping
 * the mock for a real implementation (WebSocket/IPC) requires no changes to
 * providers or the runtime.
 */
export interface ToolHostBridge {
  run(
    toolId: string,
    executablePath: string,
    options: ExecuteOptions,
    env: Record<string, string>
  ): Promise<ExecutionResult>
}

const RESPONSES: Record<string, string> = {
  git: 'Git operation completed on the workspace repository.',
  playwright: 'Browser automation step executed successfully.',
  filesystem: 'File operation completed.',
  terminal: 'Command exited with code 0.',
  document: 'Document generated successfully.',
}

export class MockHostBridge implements ToolHostBridge {
  async run(
    toolId: string,
    executablePath: string,
    options: ExecuteOptions
  ): Promise<ExecutionResult> {
    await new Promise((r) => setTimeout(r, 350))
    return {
      ok: true,
      data: {
        tool: toolId,
        executable: executablePath || '(default)',
        input: options.input,
        response: RESPONSES[toolId] ?? 'Operation completed.',
      },
    }
  }
}

// Example of a real bridge the runtime could use in production:
//
// export class WebSocketHostBridge implements ToolHostBridge {
//   constructor(private url: string) {}
//   async run(toolId, executablePath, options, env) {
//     const socket = new WebSocket(this.url)
//     // ...send { toolId, executablePath, options, env }, await streaming result
//   }
// }

export const hostBridge: ToolHostBridge = new MockHostBridge()
