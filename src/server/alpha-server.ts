/**
 * Alpha One — combined API server entry
 *
 * Boots the OpenCode API (AI/chat/providers) and mounts the Workspace API
 * (the vertical slice: tasks, workflows, artifacts, history) on the same app.
 */
import 'dotenv/config'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, runtimeManager } from '../services/opencode/server'
import { bootstrapPlatform } from '../platform/server/bootstrap'
import { createWorkspaceRouter } from '../platform/server/router'
import { createWorkspaceService } from '../platform/workspace/service'
import { createFsRouter } from '../services/fs/fs-router'

const workspaceRoot = process.cwd()
const kernel = bootstrapPlatform({
  workspace: { id: 'local', name: 'Alpha One', path: workspaceRoot },
  artifactsDir: join(workspaceRoot, '.alpha', 'artifacts'),
  withOpenCode: true,
})

const service = createWorkspaceService(kernel)
app.use('/api/ws', createWorkspaceRouter(service))
app.use('/api/fs', createFsRouter())

// ---------------------------------------------------------------------------
// TASK-OPENCODE-024: Port collision detection + runtime reuse.
// Before binding, check if the port is already occupied by an Alpha One
// instance. If so, exit cleanly instead of crashing with EADDRINUSE.
// ---------------------------------------------------------------------------
async function isAlphaOneRunning(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/api/opencode/health`, {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}

// Start server if run directly
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const PORT = Number(process.env.PORT) || 3001

  // TASK-OPENCODE-024: Detect existing runtime before binding.
  if (await isAlphaOneRunning(PORT)) {
    // eslint-disable-next-line no-console
    console.log(
      `[Alpha One] Runtime already running on port ${PORT}. ` +
      `Reusing existing instance. To start a fresh instance, stop the existing one first.`
    )
    process.exit(0)
  }

  const server = app.listen(PORT, () => {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line no-console
      console.log(`Alpha One API server running on http://localhost:${PORT}`)
    }
    void kernel.start()
    void runtimeManager.start()
  })

  // TASK-OPENCODE-024: Handle EADDRINUSE gracefully.
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // eslint-disable-next-line no-console
      console.error(
        `[Alpha One] Port ${PORT} is already in use. ` +
        `Another Alpha One runtime may be running. ` +
        `Check http://localhost:${PORT}/api/opencode/health to verify.`
      )
      process.exit(1)
    }
    throw err
  })

  const shutdown = () => {
    void runtimeManager.stop()
    void kernel.stop()
    server.close(() => process.exit(0))
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
