/**
 * TASK-066: Minimal MCP bootstrap smoke (temporary, read-only).
 *
 * Proves startMcpServer (shared mcp.ts) speaks JSON-RPC 2.0 over stdio:
 * initialize, tools/list, tools/call, ping, and clean shutdown.
 *
 * Feed line-delimited JSON-RPC on stdin; responses are written to stdout.
 */

import { startMcpServer } from '../google/mcp'

startMcpServer({
  name: 'mcp-bootstrap-smoke',
  version: '0.0.0',
  tools: [
    {
      name: 'proof.echo',
      description: 'Returns the provided text (proof tool).',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to echo back' },
        },
        required: ['text'],
      },
    },
  ],
  callTool: (name, args) => {
    if (name === 'proof.echo') {
      const text = typeof args.text === 'string' ? args.text : ''
      return { content: [{ type: 'text', text: JSON.stringify({ echo: text }, null, 2) }] }
    }
    return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true }
  },
})