/**
 * TASK-ALPHA-LOCAL-BUILDER-MIGRATION-002: bootstrap script unit tests.
 * Pure helpers only (no copies, no exits). Filesystem use is limited to a
 * temp-dir package.json fixture for readPackageJson.
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  checkNodeVersion,
  checkPlatform,
  readPackageJson,
  RUNTIME_DIR_NAME,
} from './prepare-runtime-binaries.mjs'

describe('prepare-runtime-binaries helpers', () => {
  it('runtime dir is repo-relative with zero machine/username dependency', () => {
    expect(RUNTIME_DIR_NAME).toContain('build-installer')
    expect(RUNTIME_DIR_NAME).toContain('runtime')
    expect(RUNTIME_DIR_NAME).not.toMatch(/^[A-Za-z]:/)
    expect(RUNTIME_DIR_NAME).not.toMatch(/ASUS|Users/i)
  })

  it('checkNodeVersion accepts exact match and rejects any drift', () => {
    expect(() => checkNodeVersion('v26.5.0', '26.5.0')).not.toThrow()
    expect(() => checkNodeVersion('v26.4.0', '26.5.0')).toThrow(/mismatch/)
    expect(() => checkNodeVersion('v22.0.0', '26.5.0')).toThrow(/Install Node 26\.5\.0/)
  })

  it('checkPlatform accepts win32/x64 only', () => {
    expect(() => checkPlatform('win32', 'x64')).not.toThrow()
    expect(() => checkPlatform('linux', 'x64')).toThrow(/Windows x64/)
    expect(() => checkPlatform('win32', 'arm64')).toThrow(/Windows x64/)
  })

  it('readPackageJson surfaces the declared toolchain contract', () => {
    const dir = mkdtempSync(join(tmpdir(), 'alpha-pkg-'))
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ engines: { node: '26.5.0' }, dependencies: { 'opencode-ai': '1.18.21' } })
    )
    expect(readPackageJson(dir)).toEqual({ enginesNode: '26.5.0', opencodeVersion: '1.18.21' })
  })

  it('readPackageJson tolerates missing contract fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'alpha-pkg-'))
    writeFileSync(join(dir, 'package.json'), JSON.stringify({}))
    expect(readPackageJson(dir)).toEqual({})
  })
})
