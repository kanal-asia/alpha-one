/**
 * TASK-085 CORRECTIVE: packaged MCP config carries the scoped Slides
 * doom_loop allow, and staleness detection forces rewrite of pre-corrective
 * configs. Pure module — no electron imports.
 */
import { describe, expect, it } from 'vitest'
import {
  buildPackagedMcpConfig,
  buildPackagedMcpPermission,
  isPackagedMcpConfigCurrent,
  PACKAGED_MCP_SERVERS,
} from './mcp-config'

const joinWin = (a: string, b: string): string => `${a}\\${b}`
const NODE = 'C:\\r\\node.exe'
const BASE = 'C:\\r\\app\\mcp-servers-dist'

describe('buildPackagedMcpPermission — doom_loop allow (only schema-valid form)', () => {
  it('is exactly { doom_loop: allow } — granular scoping is schema-rejected by opencode', () => {
    expect(buildPackagedMcpPermission()).toEqual({ doom_loop: 'allow' })
  })
  it('config embeds permission alongside the 7 servers', () => {
    const cfg = buildPackagedMcpConfig(NODE, BASE, joinWin) as Record<string, unknown>
    expect(Object.keys(cfg.mcp as object)).toHaveLength(7)
    expect(PACKAGED_MCP_SERVERS).toContain('google-slides')
    expect((cfg.mcp as Record<string, { command: string[] }>)['google-slides'].command).toEqual([
      NODE,
      `${BASE}\\google-slides.js`,
    ])
    expect(cfg.permission).toEqual({ doom_loop: 'allow' })
  })
  it('opens nothing else: exactly one permission key', () => {
    expect(Object.keys(buildPackagedMcpPermission())).toEqual(['doom_loop'])
  })
})

describe('isPackagedMcpConfigCurrent — staleness', () => {
  const fresh = () => buildPackagedMcpConfig(NODE, BASE, joinWin)
  it('fresh config is current', () => {
    expect(isPackagedMcpConfigCurrent(fresh(), NODE)).toBe(true)
  })
  it('pre-corrective config WITHOUT the permission rule forces rewrite', () => {
    const old = fresh() as Record<string, unknown>
    delete old.permission
    expect(isPackagedMcpConfigCurrent(old, NODE)).toBe(false)
  })
  it('wrong rule value forces rewrite', () => {
    const cfg = fresh() as Record<string, Record<string, string>>
    cfg.permission.doom_loop = 'ask'
    expect(isPackagedMcpConfigCurrent(cfg, NODE)).toBe(false)
  })
  it('diverged node path forces rewrite', () => {
    expect(isPackagedMcpConfigCurrent(fresh(), 'D:\\other\\node.exe')).toBe(false)
  })
  it('missing server forces rewrite', () => {
    const cfg = fresh() as Record<string, Record<string, unknown>>
    delete cfg.mcp['google-slides']
    expect(isPackagedMcpConfigCurrent(cfg, NODE)).toBe(false)
  })
  it('corrupt/non-object configs force rewrite', () => {
    expect(isPackagedMcpConfigCurrent(null, NODE)).toBe(false)
    expect(isPackagedMcpConfigCurrent('string', NODE)).toBe(false)
    expect(isPackagedMcpConfigCurrent({}, NODE)).toBe(false)
  })
})
