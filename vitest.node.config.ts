import path from 'path'
import { defineConfig } from 'vitest/config'

/**
 * MSI-069: Node-only test project for loopback-socket tests that cannot run
 * in the Chromium browser project (node:net is externalized there).
 * Run via `npm run test:port`.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/lib/free-port.test.ts'],
  },
})
