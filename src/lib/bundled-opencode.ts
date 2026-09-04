/**
 * TASK-OPENCODE-095: Bundled OpenCode runtime resolution.
 *
 * Provides deterministic resolution of the OpenCode executable bundled
 * with Alpha One. The bundled binary comes from the `opencode-ai` npm
 * package, which includes platform-specific binaries.
 *
 * Resolution priority:
 *   1. PACKAGED: ALPHA_ONE_RESOURCES_PATH/opencode[.exe] (backend in production)
 *   2. PACKAGED: Electron process.resourcesPath/opencode[.exe] (production)
 *   3. BUNDLED: node_modules/opencode-ai/bin/opencode[.exe]
 *   4. PROJECT: local project node_modules (development fallback)
 *   5. GLOBAL: PATH-based resolution (development fallback only)
 *
 * Production Alpha One MUST use the packaged binary.
 * The global fallback exists ONLY for development convenience.
 */

import { join, resolve } from "node:path"
import { accessSync, constants } from "node:fs"
import { fileURLToPath } from "node:url"

/** Bundled OpenCode version — must match opencode-ai dependency in package.json. */
export const BUNDLED_OPENCODE_VERSION = "1.18.21"

const isWin = process.platform === "win32"
const binaryName = isWin ? "opencode.exe" : "opencode"

function fileExists(p: string): boolean {
  try {
    accessSync(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Resolve the bundled OpenCode executable from the opencode-ai npm package.
 *
 * This searches in order:
 *   1. Packaged: ALPHA_ONE_RESOURCES_PATH/opencode[.exe] (backend in production)
 *   2. Packaged: Electron process.resourcesPath/opencode[.exe] (production)
 *   3. Relative to the current module (ESM import.meta.url)
 *   4. Relative to the process CWD
 *   5. Relative to the app root (two levels up from this file)
 *
 * Returns the absolute path to the executable, or null if not found.
 */
export function resolveBundledOpenCode(): string | null {
  const candidates: string[] = []

  // 1. PACKAGED PRODUCTION (backend): Electron main passes the packaged
  //    resources root via ALPHA_ONE_RESOURCES_PATH because plain node has no
  //    process.resourcesPath.
  const envResources = process.env.ALPHA_ONE_RESOURCES_PATH
  if (typeof envResources === "string" && envResources) {
    candidates.push(join(envResources, binaryName))
  }

  // 2. PACKAGED PRODUCTION: Electron bundles opencode.exe at resourcesPath.
  //    process.resourcesPath is only available in packaged Electron context;
  //    in development it is undefined or points elsewhere.
  if (typeof process.resourcesPath === "string" && process.resourcesPath) {
    candidates.push(join(process.resourcesPath, binaryName))
  }

  // 3. Relative to this module's location:
  //    src/lib/bundled-opencode.ts → ../../node_modules/opencode-ai/bin/opencode[.exe]
  try {
    const __filename = fileURLToPath(import.meta.url)
    const __dirname = join(__filename, "..")
    candidates.push(
      join(__dirname, "..", "..", "node_modules", "opencode-ai", "bin", binaryName),
    )
  } catch {
    // import.meta.url may fail in some contexts
  }

  // 4. Relative to CWD
  candidates.push(
    join(process.cwd(), "node_modules", "opencode-ai", "bin", binaryName),
  )

  // 5. Relative to app root (two levels up from src/lib/)
  candidates.push(
    join(resolve(process.cwd()), "node_modules", "opencode-ai", "bin", binaryName),
  )

  // 6. Check if opencode-ai is resolvable from CWD (npm/pnpm hoisting)
  try {
    const pkgPath = require.resolve("opencode-ai/package.json", {
      paths: [process.cwd()],
    })
    const pkgDir = join(pkgPath, "..")
    candidates.push(join(pkgDir, "bin", binaryName))
  } catch {
    // require.resolve may fail in ESM — ignore
  }

  for (const candidate of candidates) {
    if (fileExists(candidate)) {
      return candidate
    }
  }

  return null
}

/**
 * Get diagnostic information about bundled OpenCode resolution.
 * Useful for runtime health checks and error reporting.
 */
export function getBundledOpenCodeInfo(): {
  version: string
  resolved: string | null
  platform: string
  arch: string
} {
  return {
    version: BUNDLED_OPENCODE_VERSION,
    resolved: resolveBundledOpenCode(),
    platform: process.platform,
    arch: process.arch,
  }
}
