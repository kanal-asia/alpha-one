/**
 * TASK-OPENCODE-032: Development Runtime Isolation
 *
 * Provides utilities for starting isolated Alpha One runtime instances
 * on dynamically selected free ports, ensuring agent/test runtimes
 * never conflict with the primary developer runtime on port 3001.
 */
import { createServer } from 'node:http'
import { spawn, execSync, type ChildProcess } from 'node:child_process'

// ---------------------------------------------------------------------------
// Port Allocation
// ---------------------------------------------------------------------------

/**
 * Find a free port by binding to port 0 (OS-assigned).
 * Returns the assigned port number.
 */
export function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.listen(0, () => {
      const addr = server.address()
      if (addr && typeof addr === 'object' && 'port' in addr) {
        const port = addr.port
        server.close(() => resolve(port))
      } else {
        server.close(() => reject(new Error('Could not determine free port')))
      }
    })
    server.on('error', reject)
  })
}

/**
 * Check if a specific port is currently in use.
 */
export async function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.listen(port, () => {
      server.close(() => resolve(false))
    })
    server.on('error', () => resolve(true))
  })
}

/**
 * Check if an Alpha One instance is running on a given port.
 */
export async function isAlphaOneRunning(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${port}/api/opencode/health`, {
      signal: AbortSignal.timeout(2000),
    })
    return res.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Process Tree Kill (Windows-safe)
// ---------------------------------------------------------------------------

/**
 * Kill a process tree by PID. On Windows, uses `taskkill /F /T /PID`
 * to kill the process and all its children.
 */
function killProcessTree(pid: number): void {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
    } else {
      process.kill(pid, 'SIGTERM')
      setTimeout(() => {
        try { process.kill(pid, 'SIGKILL') } catch { /* already dead */ }
      }, 3000)
    }
  } catch {
    // Process may already be dead
  }
}

// ---------------------------------------------------------------------------
// Isolated Runtime Lifecycle
// ---------------------------------------------------------------------------

export interface IsolatedRuntime {
  port: number
  url: string
  pid: number
  process: ChildProcess
  cleanup: () => Promise<void>
}

export interface IsolatedRuntimeOptions {
  /** Timeout in ms to wait for the runtime to become healthy. Default: 30000 */
  healthTimeout?: number
  /** Extra environment variables to pass to the child process */
  env?: Record<string, string>
}

/**
 * Start an isolated Alpha One runtime on a free port.
 *
 * This spawns a new Node.js process running alpha-server.ts on an
 * OS-assigned free port, waits for the health endpoint to respond,
 * and returns a handle with cleanup capabilities.
 *
 * INVARIANT: This never starts on port 3001 when the primary runtime
 * is occupied.
 */
export async function startIsolatedRuntime(
  options: IsolatedRuntimeOptions = {}
): Promise<IsolatedRuntime> {
  const { healthTimeout = 30_000, env: extraEnv = {} } = options

  // Allocate a free port
  const port = await findFreePort()
  const url = `http://localhost:${port}`

  // Resolve the path to alpha-server.ts
  const serverPath = new URL('./alpha-server.ts', import.meta.url).pathname
    .replace(/^\/([A-Z]:)/, '$1') // Fix Windows path

  // Spawn the child process
  const child = spawn(process.execPath, ['tsx', serverPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...extraEnv,
      PORT: String(port),
      NODE_ENV: 'test',
    },
    detached: false,
    windowsHide: true,
  })

  // Collect stdout/stderr for diagnostics
  let stdout = ''
  let stderr = ''
  child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })

  // Wait for health check
  const startTime = Date.now()
  let healthy = false

  while (Date.now() - startTime < healthTimeout) {
    if (child.exitCode !== null) {
      throw new Error(
        `Isolated runtime exited prematurely (code ${child.exitCode}). ` +
        `stdout: ${stdout.slice(0, 500)} stderr: ${stderr.slice(0, 500)}`
      )
    }

    try {
      const res = await fetch(`${url}/api/opencode/health`, {
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) {
        healthy = true
        break
      }
    } catch {
      // Not ready yet, wait
    }

    await new Promise((r) => setTimeout(r, 500))
  }

  if (!healthy) {
    killProcessTree(child.pid!)
    throw new Error(
      `Isolated runtime did not become healthy within ${healthTimeout}ms. ` +
      `stdout: ${stdout.slice(0, 500)} stderr: ${stderr.slice(0, 500)}`
    )
  }

  // Log startup
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line no-console
    console.log(
      `[Alpha One] Isolated runtime ready\n` +
      `  mode=isolated\n` +
      `  port=${port}\n` +
      `  pid=${child.pid}\n` +
      `  url=${url}`
    )
  }

  // Cleanup function — kills THIS process tree only
  const cleanup = async () => {
    if (child.exitCode === null && child.pid) {
      killProcessTree(child.pid)
      // Wait for graceful exit
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => resolve(), 5000)
        child.on('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
      })
    }
  }

  return {
    port,
    url,
    pid: child.pid!,
    process: child,
    cleanup,
  }
}

/**
 * Spawn a child process for agent validation (lightweight alternative
 * to startIsolatedRuntime when the full server isn't needed).
 */
export function spawnIsolated(
  command: string,
  args: string[],
  port: number,
  env?: Record<string, string>
): ChildProcess {
  return spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ...env,
      PORT: String(port),
    },
    detached: false,
    windowsHide: true,
  })
}
