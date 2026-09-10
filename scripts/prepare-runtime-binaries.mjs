/**
 * TASK-ALPHA-LOCAL-BUILDER-MIGRATION-002 Phase 6: canonical runtime-binary
 * bootstrap for Windows packaging.
 *
 * Pure Node.js, zero dependencies (runs on bare `node`, no tsx/vite needed).
 *
 * Copies into build-installer/runtime/ (gitignored staging inputs consumed by
 * electron-builder.json extraResources):
 *   node_modules/opencode-ai/bin/opencode.exe -> build-installer/runtime/opencode.exe
 *   process.execPath (running Node)          -> build-installer/runtime/node.exe
 *
 * Deterministic, idempotent, Windows-aware, fail-closed:
 * - fails unless platform is win32/x64;
 * - fails unless the running Node version exactly matches package.json engines.node;
 * - fails unless the opencode-ai package version matches package.json dependencies;
 * - fails if any source binary is missing;
 * - prints SHA256 of both outputs for build-evidence records;
 * - uses repository-relative paths only (zero machine/username dependency);
 * - never touches secrets, network, or anything outside the repo staging dir.
 *
 * Run: `npm run prepare:runtime` (after `npm ci`). Invoked automatically by
 * the canonical `npm run build:windows` flow — never copy these EXEs by hand.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

export const RUNTIME_DIR_NAME = join('build-installer', 'runtime')

function thisFilePath() {
  // file:///C:/... -> C:/... (Windows-safe; POSIX unaffected).
  return new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
}

export function repoRoot() {
  // scripts/<file> -> repo root.
  return resolve(dirname(thisFilePath()), '..')
}

export function readPackageJson(root) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const out = {}
  if (pkg.engines && pkg.engines.node) out.enginesNode = pkg.engines.node
  if (pkg.dependencies && pkg.dependencies['opencode-ai']) out.opencodeVersion = pkg.dependencies['opencode-ai']
  return out
}

/** Exact-match version gate (reproducible builder = exact toolchain). */
export function checkNodeVersion(current, required) {
  const norm = (v) => String(v).trim().replace(/^v/i, '')
  if (norm(current) !== norm(required)) {
    throw new Error(
      `Node version mismatch: running ${current}, builder requires ${required}. ` +
        `Install Node ${required} (https://nodejs.org) and retry.`
    )
  }
}

export function checkPlatform(platform = process.platform, arch = process.arch) {
  if (platform !== 'win32' || arch !== 'x64') {
    throw new Error(`Unsupported builder platform: ${platform}/${arch}. Windows x64 is required.`)
  }
}

export function installedOpencodeVersion(root) {
  const pkgPath = join(root, 'node_modules', 'opencode-ai', 'package.json')
  if (!existsSync(pkgPath)) {
    throw new Error('opencode-ai package not found under node_modules. Run `npm ci` first.')
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (!pkg.version) throw new Error('opencode-ai package.json has no version.')
  return pkg.version
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function prepareRuntimeBinaries(root = repoRoot()) {
  checkPlatform()
  const { enginesNode, opencodeVersion } = readPackageJson(root)
  if (!enginesNode) throw new Error('package.json engines.node is not declared.')
  checkNodeVersion(process.version, enginesNode)
  if (!opencodeVersion) throw new Error('package.json dependencies.opencode-ai is not declared.')
  const installed = installedOpencodeVersion(root)
  const norm = (v) => String(v).trim().replace(/^[v^~>=<\s]+/, '')
  if (norm(installed) !== norm(opencodeVersion)) {
    throw new Error(
      `opencode-ai version mismatch: installed ${installed}, package.json declares ${opencodeVersion}. Run \`npm ci\` first.`
    )
  }
  const nodeSrc = process.execPath
  if (!existsSync(nodeSrc)) throw new Error(`Running Node binary not found: ${nodeSrc}`)
  const opencodeSrc = join(root, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe')
  if (!existsSync(opencodeSrc)) {
    throw new Error(
      'Bundled OpenCode binary not found. Run `npm ci` first (opencode-ai postinstall provides it).'
    )
  }
  const outDir = join(root, RUNTIME_DIR_NAME)
  mkdirSync(outDir, { recursive: true })
  const nodeExe = join(outDir, 'node.exe')
  const opencodeExe = join(outDir, 'opencode.exe')
  copyFileSync(nodeSrc, nodeExe)
  copyFileSync(opencodeSrc, opencodeExe)
  return {
    nodeExe,
    nodeSha256: sha256File(nodeExe),
    opencodeExe,
    opencodeSha256: sha256File(opencodeExe),
    opencodeVersion: installed,
  }
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  basename(resolve(process.argv[1])) === 'prepare-runtime-binaries.mjs'
if (invokedDirectly) {
  try {
    const out = prepareRuntimeBinaries()
    console.log(`[prepare:runtime] node.exe     -> ${out.nodeExe}`)
    console.log(`[prepare:runtime]   sha256     ${out.nodeSha256}`)
    console.log(`[prepare:runtime] opencode.exe -> ${out.opencodeExe} (opencode-ai ${out.opencodeVersion})`)
    console.log(`[prepare:runtime]   sha256     ${out.opencodeSha256}`)
  } catch (err) {
    console.error(`[prepare:runtime] FAILED: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
}
