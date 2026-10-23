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
    include: [
      'src/lib/free-port.test.ts',
      'mcp-servers/shared/google/activity-runtime.test.ts',
      'mcp-servers/google-slides/compose-registration.test.ts',
      'scripts/prepare-runtime-binaries.test.ts',
      'src/lib/activity-persistence.test.ts',
      'src/lib/profile-resolve.test.ts',
      'src/services/opencode/artifact-correspondence.test.ts',
      'src/services/opencode/mcp-guidance.test.ts',
      'src/services/opencode/auth-context.test.ts',
      'src/services/opencode/google-id-token.test.ts',
      'src/services/google/oauth-router-product-login.test.ts',
      'src/server/packaged-bundle.test.ts',
      'src/lib/subscription-plans.test.ts',
      'src/lib/subscription-status.test.ts',
      'src/services/subscription/router.test.ts',
      'src/services/subscription/router-unavailable.test.ts',
      'src/services/subscription/transitions.test.ts',
      'src/services/subscription/cancel.test.ts',
      'src/services/subscription/entitlement.test.ts',
      'src/services/subscription/access.test.ts',
      'src/services/subscription/usage.test.ts',
      'src/services/subscription/migration.test.ts',
      'src/services/subscription/migration-legacy.test.ts',
      'src/services/account/enforcement.test.ts',
    ],
  },
})
