import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { spawn, execSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:net'

const isDev = !app.isPackaged
const PORT = 3001
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/opencode/health`
const FRONTEND_URL = `http://127.0.0.1:${PORT}/`

let mainWindow: BrowserWindow | null = null
let serverProcess: ChildProcess | null = null
let isQuitting = false

// ---------------------------------------------------------------------------
// Working directory resolution
// ---------------------------------------------------------------------------
function resolveWorkingDirectory(): string {
  if (isDev) {
    return join(__dirname, '..', '..')
  }
  return join(process.resourcesPath, '..')
}

function resolveServerScript(): string {
  const cwd = resolveWorkingDirectory()
  if (isDev) {
    return join(cwd, 'dist', 'server', 'alpha-server.js')
  }
  return join(process.resourcesPath, 'app', 'dist', 'server', 'alpha-server.js')
}

function resolveInstallDirectory(): string {
  if (isDev) {
    return resolveWorkingDirectory()
  }
  return join(process.resourcesPath, '..')
}

// ---------------------------------------------------------------------------
// Writable data root — MUST be outside the installation directory
// ---------------------------------------------------------------------------
function resolveDataDir(): string {
  if (isDev) {
    // Development: use project root .alpha-data
    return join(resolveWorkingDirectory(), '.alpha-data')
  }
  // Production: %APPDATA%\Alpha One
  const appData = process.env.APPDATA
  if (appData) {
    return join(appData, 'Alpha One')
  }
  // Fallback
  return join(require('os').homedir(), '.alpha-one')
}

// ---------------------------------------------------------------------------
// Port detection
// ---------------------------------------------------------------------------
function checkPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '127.0.0.1')
  })
}

function waitForPortFree(port: number, timeoutMs = 10000, intervalMs = 200): Promise<boolean> {
  return new Promise(async (resolve) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (await checkPortFree(port)) {
        resolve(true)
        return
      }
      await new Promise((r) => setTimeout(r, intervalMs))
    }
    resolve(false)
  })
}

// ---------------------------------------------------------------------------
// Process ownership detection
// ---------------------------------------------------------------------------
type OwnershipResult = 'ALPHA_ONE_OWNED' | 'FOREIGN_PROCESS' | 'UNKNOWN'

function getPortListenerPid(port: number): number | null {
  try {
    const output = execSync(
      `netstat -ano -p TCP | findstr ":${port}" | findstr "LISTENING"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const lines = output.trim().split('\n').filter(Boolean)
    if (lines.length === 0) return null
    const match = lines[0].trim().match(/\s+(\d+)\s*$/)
    return match ? parseInt(match[1], 10) : null
  } catch {
    return null
  }
}

function getProcessInfo(pid: number): { exePath: string; commandLine: string } | null {
  try {
    const exePath = execSync(
      `wmic process where "ProcessId=${pid}" get ExecutablePath /value`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const exeMatch = exePath.match(/ExecutablePath=(.+)/i)
    const exe = exeMatch ? exeMatch[1].trim() : ''

    const cmdOutput = execSync(
      `wmic process where "ProcessId=${pid}" get CommandLine /value`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const cmdMatch = cmdOutput.match(/CommandLine=(.+)/i)
    const cmd = cmdMatch ? cmdMatch[1].trim() : ''

    return { exePath: exe, commandLine: cmd }
  } catch {
    return null
  }
}

function getChildPids(parentPid: number): number[] {
  try {
    const output = execSync(
      `wmic process where "ParentProcessId=${parentPid}" get ProcessId /value`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    const matches = output.match(/ProcessId=(\d+)/g) || []
    return matches.map((m) => parseInt(m.split('=')[1], 10))
  } catch {
    return []
  }
}

function getFullProcessTree(pid: number): number[] {
  const tree = [pid]
  const children = getChildPids(pid)
  for (const child of children) {
    tree.push(...getFullProcessTree(child))
  }
  return tree
}

function isAlphaOnePath(exePath: string, commandLine: string): boolean {
  const installDir = resolveInstallDirectory().toLowerCase()

  // Check if executable path is within the Alpha One installation directory
  if (exePath.toLowerCase().startsWith(installDir)) {
    return true
  }

  // Check if command line references Alpha One's server entrypoint
  if (commandLine.toLowerCase().includes('alpha-server.js')) {
    return true
  }

  // Check if command line references Alpha One's node.exe in resources
  if (commandLine.toLowerCase().includes('resources\\node.exe') ||
      commandLine.toLowerCase().includes('resources/node.exe')) {
    return true
  }

  return false
}

function classifyPortOwner(port: number): {
  ownership: OwnershipResult
  pid: number | null
  info: { exePath: string; commandLine: string } | null
} {
  const pid = getPortListenerPid(port)
  if (pid === null) {
    return { ownership: 'ALPHA_ONE_OWNED', pid: null, info: null }
  }

  const info = getProcessInfo(pid)
  if (!info) {
    return { ownership: 'UNKNOWN', pid, info: null }
  }

  console.log(`[Alpha One] Port ${port} owner: PID=${pid}, exe=${info.exePath}`)
  console.log(`[Alpha One] Port ${port} owner command: ${info.commandLine}`)

  if (isAlphaOnePath(info.exePath, info.commandLine)) {
    return { ownership: 'ALPHA_ONE_OWNED', pid, info }
  }

  return { ownership: 'FOREIGN_PROCESS', pid, info }
}

// ---------------------------------------------------------------------------
// Process termination
// ---------------------------------------------------------------------------
function terminateProcessTree(pid: number): boolean {
  try {
    const tree = getFullProcessTree(pid)
    console.log(`[Alpha One] Terminating process tree: ${tree.join(', ')}`)

    // Try graceful termination first
    for (const p of tree) {
      try {
        execSync(`taskkill /pid ${p}`, { stdio: 'ignore' })
      } catch {
        // May already be dead
      }
    }

    // Wait briefly for graceful shutdown
    const start = Date.now()
    while (Date.now() - start < 2000) {
      try {
        execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] })
        // Process still alive, wait
      } catch {
        // Process gone
        return true
      }
      execSync('timeout /t 1 /nobreak >nul', { stdio: 'ignore' })
    }

    // Force termination if still alive
    for (const p of tree) {
      try {
        execSync(`taskkill /pid ${p} /T /F`, { stdio: 'ignore' })
      } catch {
        // May already be dead
      }
    }

    return true
  } catch (err) {
    console.error('[Alpha One] Failed to terminate process tree:', err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Backend startup
// ---------------------------------------------------------------------------
function startBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const cwd = resolveWorkingDirectory()
    const serverScript = resolveServerScript()
    const nodeExe = isDev
      ? 'node'
      : join(process.resourcesPath, 'node.exe')

    if (!existsSync(serverScript)) {
      reject(new Error(`Server script not found: ${serverScript}`))
      return
    }

    console.log(`[Alpha One] Starting backend: ${nodeExe} ${serverScript}`)
    console.log(`[Alpha One] CWD: ${cwd}`)
    console.log(`[Alpha One] Port: ${PORT}`)

    const dataDir = resolveDataDir()
    mkdirSync(dataDir, { recursive: true })
    console.log(`[Alpha One] Data dir: ${dataDir}`)

    serverProcess = spawn(nodeExe, [serverScript], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'production',
        ALPHA_DATA_DIR: dataDir,
      },
    })

    serverProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString().trim()
      if (msg) console.log(`[Alpha Server] ${msg}`)
    })

    serverProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim()
      if (msg) console.error(`[Alpha Server] ${msg}`)
    })

    serverProcess.on('error', (err) => {
      console.error('[Alpha One] Failed to start backend:', err)
      reject(err)
    })

    serverProcess.on('exit', (code, signal) => {
      console.log(`[Alpha One] Backend exited: code=${code}, signal=${signal}`)
      serverProcess = null
      if (!isQuitting) {
        console.error('[Alpha One] Backend exited unexpectedly')
      }
    })

    setTimeout(resolve, 500)
  })
}

// ---------------------------------------------------------------------------
// Backend readiness detection
// ---------------------------------------------------------------------------
async function waitForBackend(timeoutMs = 30000, intervalMs = 500): Promise<boolean> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(HEALTH_URL, {
        signal: AbortSignal.timeout(2000),
      })
      if (res.ok) {
        console.log('[Alpha One] Backend is ready')
        return true
      }
    } catch {
      // Server not ready yet, continue polling
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }

  console.error(`[Alpha One] Backend failed to become ready within ${timeoutMs}ms`)
  return false
}

// ---------------------------------------------------------------------------
// Port collision resolution
// ---------------------------------------------------------------------------
type PortResolution = 'READY_TO_START' | 'FOREIGN_CONFLICT' | 'UNRESOLVABLE'

async function resolvePortCollision(): Promise<PortResolution> {
  const isFree = await checkPortFree(PORT)
  if (isFree) {
    console.log(`[Alpha One] Port ${PORT} is free`)
    return 'READY_TO_START'
  }

  console.log(`[Alpha One] Port ${PORT} is occupied, identifying owner...`)
  const { ownership, pid, info } = classifyPortOwner(PORT)

  switch (ownership) {
    case 'ALPHA_ONE_OWNED':
      if (pid === null) {
        // Port occupied but no PID found — try health check to confirm it's us
        try {
          const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) })
          if (res.ok) {
            console.log('[Alpha One] Existing Alpha One backend detected, will reuse')
            return 'READY_TO_START'
          }
        } catch {
          // Can't reach it, wait for port to free
        }
        const freed = await waitForPortFree(PORT, 5000)
        return freed ? 'READY_TO_START' : 'UNRESOLVABLE'
      }

      console.log(`[Alpha One] Terminating stale Alpha One backend (PID: ${pid})`)
      terminateProcessTree(pid)

      console.log(`[Alpha One] Waiting for port ${PORT} to be released...`)
      const freed = await waitForPortFree(PORT, 10000)
      if (!freed) {
        console.error(`[Alpha One] Port ${PORT} not released after termination`)
        return 'UNRESOLVABLE'
      }

      console.log(`[Alpha One] Port ${PORT} released`)
      return 'READY_TO_START'

    case 'FOREIGN_PROCESS':
      console.log(`[Alpha One] Port ${PORT} owned by foreign process: ${info?.exePath}`)
      return 'FOREIGN_CONFLICT'

    case 'UNKNOWN':
      console.log(`[Alpha One] Port ${PORT} owner cannot be identified`)
      return 'UNRESOLVABLE'
  }
}

// ---------------------------------------------------------------------------
// Error window
// ---------------------------------------------------------------------------
function showErrorWindow(message: string, diagnostic: string): void {
  mainWindow = createMainWindow()
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Alpha One</title></head>
<body style="font-family:system-ui,sans-serif;padding:40px;text-align:center;background:#1a1a1a;color:#e0e0e0;">
  <h1 style="color:#ff6b6b;">Alpha One</h1>
  <p style="font-size:18px;margin:20px 0;">${message}</p>
  <p style="color:#888;font-size:14px;margin:10px 0;">${diagnostic}</p>
  <button onclick="window.close()" style="margin-top:20px;padding:10px 30px;font-size:16px;cursor:pointer;background:#ff6b6b;color:white;border:none;border-radius:6px;">Close</button>
</body>
</html>`
  mainWindow.loadURL(`data:text/html,${encodeURIComponent(html)}`)
  mainWindow.show()
}

// ---------------------------------------------------------------------------
// Window creation
// ---------------------------------------------------------------------------
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Alpha One',
    icon: existsSync(join(__dirname, '..', 'dist', 'images', 'favicon.png'))
      ? join(__dirname, '..', 'dist', 'images', 'favicon.png')
      : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Allow internal navigation (local server URLs) to open in Electron
    if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) {
      return { action: 'allow' }
    }
    // External URLs open in system browser
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
      shutdown()
    }
  })

  return win
}

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------
async function shutdown() {
  if (isQuitting) return
  isQuitting = true

  console.log('[Alpha One] Shutting down...')

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy()
    mainWindow = null
  }

  if (serverProcess && serverProcess.pid) {
    console.log(`[Alpha One] Killing server process (PID: ${serverProcess.pid})`)
    try {
      execSync(`taskkill /pid ${serverProcess.pid} /T /F`, { stdio: 'ignore' })
    } catch {
      // Process may already be dead
    }
    serverProcess = null
  }

  app.quit()
}

// ---------------------------------------------------------------------------
// Single instance
// ---------------------------------------------------------------------------
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // ---------------------------------------------------------------------------
  // App lifecycle
  // ---------------------------------------------------------------------------
  app.whenReady().then(async () => {
    console.log('[Alpha One] Application starting...')
    console.log(`[Alpha One] Dev mode: ${isDev}`)
    console.log(`[Alpha One] CWD: ${resolveWorkingDirectory()}`)

    try {
      // Resolve port collision before starting backend
      const resolution = await resolvePortCollision()

      if (resolution === 'FOREIGN_CONFLICT') {
        showErrorWindow(
          'Port 3001 is already in use',
          'Alpha One did not terminate the other application. Please close the conflicting application and try again.'
        )
        return
      }

      if (resolution === 'UNRESOLVABLE') {
        showErrorWindow(
          'Cannot start Alpha One',
          'Port 3001 is occupied by an unidentified process. Please check what is using this port and try again.'
        )
        return
      }

      // Start backend
      await startBackend()

      // Wait for backend readiness
      const ready = await waitForBackend()
      if (!ready) {
        showErrorWindow(
          'Failed to start backend server',
          'The backend process started but did not become ready. Please check that port 3001 is available.'
        )
        return
      }

      // Create window and load frontend
      mainWindow = createMainWindow()
      mainWindow.loadURL(FRONTEND_URL)

      console.log('[Alpha One] Application ready')
    } catch (err) {
      console.error('[Alpha One] Startup failed:', err)
      app.quit()
    }
  })

  app.on('window-all-closed', () => {
    shutdown()
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('activate', () => {
    if (mainWindow) {
      mainWindow.show()
    }
  })
}
