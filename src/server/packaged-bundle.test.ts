/**
 * TASK-ALPHA-RELEASE-002: packaged-backend bundle regression gate.
 *
 * Proven failure (2026-10-20): the installed Windows app showed
 * "Failed to start backend server" because dist/server/alpha-server.js kept
 * a bare external `import ... from "jose"` (added in 4f91b5d, never added to
 * tsup noExternal). electron-builder ships no node_modules, so the packaged
 * backend died with ERR_MODULE_NOT_FOUND before listening, and Electron's
 * readiness poll timed out.
 *
 * Two gates:
 *   A. Static (always runs): tsup.server.config.ts noExternal must pin 'jose'.
 *   B. Packaging (runs when dist/ exists): the built server bundles must not
 *      reference any bare external package — only node builtins and relative
 *      imports are resolvable inside the installed app.
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')
const tsupConfigPath = join(repoRoot, 'tsup.server.config.ts')
const distServerDir = join(repoRoot, 'dist', 'server')

function readNoExternalEntries(): string[] {
  const raw = readFileSync(tsupConfigPath, 'utf8')
  const block = raw.match(/noExternal\s*:\s*\[([\s\S]*?)\]/)
  if (!block) return []
  return [...block[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
}

const builtins = new Set([
  ...builtinModules.map((m) => m.replace(/^node:/, '')),
  ...builtinModules,
])

/** Bare specifiers that cannot resolve inside the installed app. */
function findBareExternals(js: string): string[] {
  // Strict package-name shape. This intentionally rejects string-concat
  // artifacts inside bundled code (e.g. from " + dynamic + ") — only real
  // module specifiers match. Plain require("...") is NOT scanned: tsup ESM
  // output uses __require for bundled shims, and the only plain require()
  // hits are string literals inside bundled warning messages.
  const isPkg = (s: string): boolean =>
    /^(@[A-Za-z0-9_.-]+\/)?[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)*$/.test(s)
  const found = new Set<string>()
  const consider = (spec: string): void => {
    if (spec.startsWith('.') || spec.startsWith('/')) return
    if (!isPkg(spec)) return
    const root = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
    if (!builtins.has(spec) && !builtins.has(root)) found.add(spec)
  }
  for (const m of js.matchAll(/\bfrom\s*["']([^"']+)["']/g)) consider(m[1])
  for (const m of js.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) consider(m[1])
  return [...found].sort()
}

describe('packaged backend bundle', () => {
  it('pins jose in tsup noExternal so the installed app needs no node_modules', () => {
    expect(existsSync(tsupConfigPath)).toBe(true)
    expect(readNoExternalEntries()).toContain('jose')
  })

  describe.skipIf(!existsSync(distServerDir))('built server bundles', () => {
    for (const bundle of ['alpha-server.js', 'alpha-infra-server.js']) {
      it(`${bundle} has no bare external imports`, () => {
        const file = join(distServerDir, bundle)
        if (!existsSync(file)) return
        const externals = findBareExternals(readFileSync(file, 'utf8'))
        expect(externals).toEqual([])
      })
    }
  })
})
