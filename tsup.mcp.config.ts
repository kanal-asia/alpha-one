import { defineConfig } from 'tsup'

const servers = [
  'google-sheets',
  'google-docs',
  'google-slides',
  'google-drive',
  'google-apps-script',
  'google-calendar',
  'gmail',
]

export default defineConfig({
  entry: Object.fromEntries(
    servers.map(name => [name, `mcp-servers/${name}/server.ts`])
  ),
  outDir: 'mcp-servers-dist',
  format: 'esm',
  platform: 'node',
  target: 'node22',
  bundle: true,
  splitting: false,
  sourcemap: false,
  clean: true,
})
