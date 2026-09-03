import { app, BrowserWindow, shell, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { spawn, execSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, cpSync, mkdtempSync, appendFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'

const isDev = !app.isPackaged
const PORT = 3001
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/opencode/health`

// ---------------------------------------------------------------------------
// Temporary file logger for MSI-061R2 runtime trace (user-writable location)
// ---------------------------------------------------------------------------
function getTraceLogPath(): string {
  const appData = process.env.APPDATA || join(require('os').homedir(), 'AppData', 'Roaming')
  return join(appData, 'Alpha One', 'oauth-trace.log')
}
function traceLog(msg: string) {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${msg}\n`
  try { appendFileSync(getTraceLogPath(), line) } catch { /* ignore */ }
}
// Clear log on fresh start
try { writeFileSync(getTraceLogPath(), `=== Alpha One OAuth Trace ===\nStarted at ${new Date().toISOString()}\n`) } catch { /* ignore */ }
const FRONTEND_URL = `http://127.0.0.1:${PORT}/`

let mainWindow: BrowserWindow | null = null
let serverProcess: ChildProcess | null = null
let isQuitting = false

// ---------------------------------------------------------------------------
// IPC: Drive picker return path
// ---------------------------------------------------------------------------
ipcMain.on('picker:select', (event, data) => {
  // Forward the picker selection to all other windows, then close the picker child.
  // The child must NOT call window.close() itself — that races IPC delivery.
  const senderWebContentsId = event.sender.id
  const allWindows = BrowserWindow.getAllWindows()
  console.log(`[Alpha One] picker:select received from wcId=${senderWebContentsId}, broadcasting to ${allWindows.length - 1} window(s)`)
  console.log(`[Alpha One] picker:select data: ${JSON.stringify(data).substring(0, 200)}`)
  let broadcastCount = 0
  allWindows.forEach((win) => {
    if (win.webContents.id !== senderWebContentsId && !win.isDestroyed()) {
      const title = win.getTitle()
      const url = win.webContents.getURL()
      console.log(`[Alpha One] picker:return -> wcId=${win.webContents.id} title="${title}" url="${url.substring(0, 80)}"`)
      win.webContents.send('picker:return', data)
      broadcastCount++
    }
  })
  console.log(`[Alpha One] picker:return broadcast to ${broadcastCount} window(s)`)
  // Close the picker child window AFTER forwarding the result
  const pickerWin = BrowserWindow.fromWebContents(event.sender)
  if (pickerWin && !pickerWin.isDestroyed()) {
    console.log(`[Alpha One] Closing picker child wcId=${senderWebContentsId}`)
    pickerWin.close()
  }
})

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

function resolvePreloadScript(): string {
  // Both dev and packaged: preload.cjs is a sibling of main.cjs in electron/dist/
  return join(__dirname, 'preload.cjs')
}

// Resolved once at module load so all child-window creation paths share it.
const PRELOAD_PATH = resolvePreloadScript()

// ---------------------------------------------------------------------------
// Adaptive OAuth child-window sizing — fits inside the display work area
// ---------------------------------------------------------------------------
function resolveOauthChildBounds(): { width: number; height: number } {
  const OAUTH_WIDTH = 1000
  const MAX_HEIGHT = 800
  const HEIGHT_RATIO = 0.85

  // Get the display containing the main window (or fallback to primary)
  let workAreaHeight = 800
  let workAreaWidth = 1200
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds()
    const display = screen.getDisplayMatching(bounds)
    workAreaHeight = display.workArea.height
    workAreaWidth = display.workArea.width
  } else {
    const display = screen.getPrimaryDisplay()
    workAreaHeight = display.workArea.height
    workAreaWidth = display.workArea.width
  }

  const height = Math.min(Math.round(workAreaHeight * HEIGHT_RATIO), MAX_HEIGHT)
  const width = Math.min(OAUTH_WIDTH, workAreaWidth)

  return { width, height }
}

function resolveInstallDirectory(): string {
  if (isDev) {
    return resolveWorkingDirectory()
  }
  return join(process.resourcesPath, '..')
}

// ---------------------------------------------------------------------------
// Ensure OpenCode MCP config exists in user config directory.
// The installed MSI may not have opencode.jsonc at the project root, so the
// CLI falls back to ~/.config/opencode/opencode.jsonc. If that file has wrong
// commands (npx tsx) or hardcoded cwd paths, MCP servers fail to spawn.
// This function writes the correct config on first run.
// ---------------------------------------------------------------------------
function ensureOpenCodeMcpConfig(): void {
  const { homedir } = require('os')
  const userConfigDir = join(homedir(), '.config', 'opencode')
  const userConfigPath = join(userConfigDir, 'opencode.jsonc')

  // In dev mode, the project-level opencode.jsonc takes precedence.
  // Only write user config in production.
  if (isDev) return

  // Determine MCP server base path and node command
  // In production: MCP servers at <resources>/app/mcp-servers-dist/ (compiled JS), node at <resources>/node.exe
  const mcpBase = join(process.resourcesPath, 'app', 'mcp-servers-dist')
  const nodeExe = join(process.resourcesPath, 'node.exe')

  const servers = ['google-sheets', 'google-docs', 'google-slides', 'google-drive', 'google-apps-script', 'google-calendar', 'gmail']
  const mcpEntries: Record<string, unknown> = {}
  for (const name of servers) {
    mcpEntries[name] = {
      type: 'local',
      command: [nodeExe, join(mcpBase, `${name}.js`)],
      enabled: true,
      timeout: 15000,
    }
  }

  const config = {
    '$schema': 'https://opencode.ai/config.json',
    'mcp': mcpEntries,
  }

  try {
    const { existsSync, mkdirSync, writeFileSync, readFileSync } = require('fs')

    // Check if existing config already has correct MCP entries
    if (existsSync(userConfigPath)) {
      try {
        const raw = readFileSync(userConfigPath, 'utf8')
        const parsed = JSON.parse(raw)
        // Verify paths point to current resources/app/mcp-servers-dist (not old install root)
        const sheetsCmd = parsed?.mcp?.['google-sheets']?.command
        if (sheetsCmd?.[0]?.includes('node.exe') && sheetsCmd?.[1]?.includes('resources') && sheetsCmd?.[1]?.includes('mcp-servers-dist') && sheetsCmd?.[1]?.includes('.js')) {
          return
        }
      } catch { /* config corrupted, overwrite */ }
    }

    mkdirSync(userConfigDir, { recursive: true })
    writeFileSync(userConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
    console.log('[Alpha One] Wrote MCP config to', userConfigPath)
  } catch (err) {
    console.error('[Alpha One] Failed to write MCP config:', err)
  }
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
// Extract frontend dist from ASAR to temp directory for HTTP serving
// Express static middleware cannot serve files from inside ASAR archives.
// Node.js patches fs to work with ASAR paths, so we use fs.readFileSync
// to read files and fs.readdirSync to list directories.
// ---------------------------------------------------------------------------
function extractFrontendDist(): string | null {
  if (isDev) return null
  try {
    const fs = require('fs')
    const asarPath = join(process.resourcesPath, 'app.asar')
    const distDir = join(asarPath, 'dist')
    // Use Node.js patched fs to read ASAR directory
    const items = fs.readdirSync(distDir)
    const tempDir = mkdtempSync(join(tmpdir(), 'alpha-one-'))
    const extractedDist = join(tempDir, 'dist')
    mkdirSync(extractedDist, { recursive: true })
    function copyDir(src: string, dest: string) {
      const entries = fs.readdirSync(src, { withFileTypes: true })
      for (const entry of entries) {
        const srcPath = join(src, entry.name)
        const destPath = join(dest, entry.name)
        if (entry.isDirectory()) {
          mkdirSync(destPath, { recursive: true })
          copyDir(srcPath, destPath)
        } else {
          const content = fs.readFileSync(srcPath)
          fs.writeFileSync(destPath, content)
        }
      }
    }
    copyDir(distDir, extractedDist)
    const fileCount = fs.readdirSync(extractedDist).length
    console.log(`[Alpha One] Extracted ${fileCount} frontend items to: ${extractedDist}`)
    return extractedDist
  } catch (err) {
    console.error('[Alpha One] Failed to extract frontend dist:', err)
    return null
  }
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

    // Extract frontend dist from ASAR for HTTP serving
    const extractedDist = extractFrontendDist()

    serverProcess = spawn(nodeExe, [serverScript], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'production',
        ALPHA_DATA_DIR: dataDir,
        ...(extractedDist ? { DIST_DIR: extractedDist } : {}),
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
  const preload = resolvePreloadScript()
  console.log(`[Alpha One] Preload script: ${preload}`)

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Alpha One',
    icon: existsSync(join(__dirname, '..', 'dist', 'images', 'favicon.ico'))
      ? join(__dirname, '..', 'dist', 'images', 'favicon.ico')
      : existsSync(join(__dirname, '..', 'dist', 'images', 'favicon.png'))
        ? join(__dirname, '..', 'dist', 'images', 'favicon.png')
        : undefined,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload,
    },
    show: false,
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    const childOptions = (width: number, height: number) => ({
      action: 'allow' as const,
      overrideBrowserWindowOptions: {
        parent: win,
        show: true,
        width,
        height,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          preload: PRELOAD_PATH,
        },
      },
    })

    // OAuth provider URLs → open as an Alpha One/Electron child window
    // (NOT the system browser). The child returns to the local app on
    // completion, at which point it auto-closes and primary regains focus.
    if (
      url.includes('accounts.google.com') ||
      url.includes('alpha.kanal.asia')
    ) {
      const { width, height } = resolveOauthChildBounds()
      return childOptions(width, height)
    }

    // Internal navigation (local server URLs) → Electron child window,
    // properly parented + shown so picker UIs render instead of a blank frame.
    if (url.startsWith('http://127.0.0.1:') || url.startsWith('http://localhost:')) {
      return childOptions(1100, 800)
    }

    // Other external URLs open in system browser
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

  // -------------------------------------------------------------------------
  // OAuth child auto-close: when an OAuth child window (opened against the
  // external Google/VPS provider) finishes and navigates back to the local
  // app, close it and return focus to the primary window.
  // -------------------------------------------------------------------------
  app.on('web-contents-created', (_event, contents) => {
    let sawExternalOAuth = false
    let isOAuthChild = false
    const wcId = contents.id

    contents.on('did-start-navigation', (_e, url) => {
      traceLog(`did-start-navigation wc=${wcId} url=${url}`)
      if (url.includes('accounts.google.com') || url.includes('alpha.kanal.asia')) {
        sawExternalOAuth = true
        isOAuthChild = true
        traceLog(`sawExternalOAuth=true wc=${wcId}`)
      }
    })

    // Helper: close OAuth child if it landed on localhost after OAuth
    const tryCloseOauthChild = (url: string, source: string) => {
      if (!sawExternalOAuth) return
      const isLocalReturn = url.startsWith(`http://127.0.0.1:${PORT}/`) ||
        url.startsWith(`http://localhost:${PORT}/`)
      if (!isLocalReturn) return

      // Fresh reference — contents.browserWindow may be stale
      const freshWin = BrowserWindow.fromWebContents(contents)
      const allWindows = BrowserWindow.getAllWindows()
      const childWin = freshWin && freshWin !== mainWindow && !freshWin.isDestroyed()
        ? freshWin
        : allWindows.find(w => w !== mainWindow && !w.isDestroyed() && w.webContents.id === wcId)

      traceLog(`tryClose source=${source} wc=${wcId} freshWinId=${freshWin?.id} childWinId=${childWin?.id} url=${url} predicate=true`)

      if (!childWin) {
        traceLog(`tryClose ABORT: no valid child window found`)
        return
      }

      traceLog(`CLOSING window id=${childWin.id} wc=${wcId}`)
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus()
      childWin.destroy()
      traceLog(`destroy() called, isDestroyed=${childWin.isDestroyed()}`)
    }

    contents.on('did-navigate', (_e, url) => {
      traceLog(`did-navigate wc=${wcId} url=${url}`)
      tryCloseOauthChild(url, 'did-navigate')
    })

    contents.on('did-navigate-in-page', (_e, url) => {
      traceLog(`did-navigate-in-page wc=${wcId} url=${url}`)
      tryCloseOauthChild(url, 'did-navigate-in-page')
    })

    contents.on('did-finish-load', () => {
      if (!isOAuthChild) return
      const url = contents.getURL()
      traceLog(`did-finish-load wc=${wcId} url=${url}`)
      tryCloseOauthChild(url, 'did-finish-load')
    })

    contents.on('did-fail-load', (_e, code, desc) => {
      if (!isOAuthChild) return
      traceLog(`did-fail-load wc=${wcId} code=${code} desc=${desc}`)
    })

    contents.on('closed', () => {
      traceLog(`closed wc=${wcId}`)
    })
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

      // Ensure MCP config is correct before spawning backend
      ensureOpenCodeMcpConfig()

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
      if (isDev) {
        mainWindow.loadURL(FRONTEND_URL)
      } else {
        // Production: load from backend HTTP server.
        // Express static middleware cannot serve files from ASAR, so we extract
        // the frontend dist to a temp directory and serve via HTTP.
        // This provides a proper HTTP origin for routing, API calls, and OAuth.
        mainWindow.loadURL(FRONTEND_URL)
      }

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
