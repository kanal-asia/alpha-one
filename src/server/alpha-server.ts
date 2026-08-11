/**
 * Alpha Workspace — combined API server entry
 *
 * Boots the OpenCode API (AI/chat/providers) and mounts the Workspace API
 * (the vertical slice: tasks, workflows, artifacts, history) on the same app.
 */
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, runtimeManager } from '../services/opencode/server'
import { bootstrapPlatform } from '../platform/server/bootstrap'
import { createWorkspaceRouter } from '../platform/server/router'
import { createWorkspaceService } from '../platform/workspace/service'
import { createGoogleOAuthRouter } from '../services/google'

const workspaceRoot = process.cwd()
const kernel = bootstrapPlatform({
  workspace: { id: 'local', name: 'Alpha Workspace', path: workspaceRoot },
  artifactsDir: join(workspaceRoot, '.alpha', 'artifacts'),
  withOpenCode: true,
})

const service = createWorkspaceService(kernel)
app.use('/api/ws', createWorkspaceRouter(service))

// Google Workspace OAuth
app.use('/api/google/oauth', createGoogleOAuthRouter())

// Start server if run directly
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = process.env.PORT || 3001
  const server = app.listen(PORT, () => {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.log(`Alpha Workspace API server running on http://localhost:${PORT}`)
    }
    void kernel.start()
    void runtimeManager.start()
  })

  const shutdown = () => {
    void runtimeManager.stop()
    void kernel.stop()
    server.close(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
