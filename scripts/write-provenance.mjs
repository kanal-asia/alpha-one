/**
 * TASK-ALPHA-RELEASE-002 Phase 2: build-time source provenance for Windows packaging.
 *
 * Pure Node.js, zero dependencies (runs on bare `node`, no tsx/vite needed).
 *
 * Records the EXACT source revision the installer is built from:
 *   { version, sourceCommit, sourceCommitShort, contentDiff, builtAt }
 * written to dist/provenance.json, which electron-builder.json ships as
 * top-level resources/provenance.json (outside app.asar, plain JSON).
 *
 * - sourceCommit is read from git HEAD AT BUILD TIME, so the metadata always
 *   matches the revision actually being packaged — never a stale constant.
 * - contentDiff lists worktree-vs-HEAD content changes (line-ending phantoms
 *   excluded by construction: `git diff --name-only` is empty for them).
 *   A non-empty list means the build ran on a dirty tree; the fact is
 *   recorded, not hidden.
 *
 * Deterministic, idempotent, Windows-aware, fail-closed:
 * - fails unless run inside a git repository;
 * - fails unless HEAD resolves to a full 40-hex SHA;
 * - fails if dist/provenance.json cannot be written;
 * - prints the provenance JSON for build-evidence records;
 * - never touches secrets, network, or anything outside dist/provenance.json.
 *
 * Run: `npm run provenance` (wired into `npm run build:windows` after `build`,
 * before `build:electron`/packaging). Never hand-edit dist/provenance.json.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function thisDir() {
  return dirname(fileURLToPath(import.meta.url))
}

function repoRoot() {
  return resolve(thisDir(), '..')
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function fail(msg) {
  console.error(`[provenance] FATAL: ${msg}`)
  process.exit(1)
}

const root = repoRoot()

let sourceCommit
try {
  sourceCommit = git(['rev-parse', 'HEAD'])
} catch {
  fail('not a git repository or HEAD unresolvable (run from the repo root with git available).')
}
if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
  fail(`HEAD did not resolve to a full SHA (got: ${JSON.stringify(sourceCommit)}).`)
}

let pkg
try {
  pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
} catch {
  fail('cannot read package.json for version.')
}
if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
  fail('package.json has no usable version.')
}

let contentDiff = []
try {
  const out = git(['diff', '--name-only', 'HEAD'])
  contentDiff = out.length === 0 ? [] : out.split('\n').map((s) => s.trim()).filter(Boolean)
} catch {
  fail('cannot compute worktree content diff.')
}

const provenance = {
  schema: 'alpha-one/provenance@1',
  version: pkg.version,
  sourceCommit,
  sourceCommitShort: sourceCommit.slice(0, 7),
  contentDiff,
  contentClean: contentDiff.length === 0,
  builtAt: new Date().toISOString(),
}

const outDir = join(root, 'dist')
mkdirSync(outDir, { recursive: true })
const outPath = join(outDir, 'provenance.json')
try {
  writeFileSync(outPath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8')
} catch {
  fail(`cannot write ${outPath}.`)
}

console.log(`[provenance] ${JSON.stringify(provenance)}`)
console.log(`[provenance] wrote dist/provenance.json`)
