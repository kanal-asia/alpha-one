/**
 * TASK-082-CORRECTIVE (C01/C03): deterministic OpenCode chat CWD.
 *
 * 1. No-project execution resolves to the neutral CWD, never inherited process CWD.
 * 2. Explicit Local Project execution still resolves to projectCwd.
 * 3. Initial and continuation/resume paths share one resolution (both call sites
 *    use the same chatCwd const built by this resolver — these cases pin the
 *    resolver contract each path depends on).
 */
import { describe, expect, it } from 'vitest'
import { resolveChatCwd } from './chat-cwd'

const NEUTRAL = 'C:\\Users\\tester\\AppData\\Roaming\\Alpha One'
const PROJECT = 'D:\\work\\client-deck'

describe('resolveChatCwd — no-project isolation (initial path)', () => {
  it('null project resolves to neutral CWD, not process.cwd()', () => {
    const out = resolveChatCwd(null, NEUTRAL)
    expect(out).toBe(NEUTRAL)
    expect(out).not.toBe(process.cwd())
  })
  it('undefined project resolves to neutral CWD', () => {
    expect(resolveChatCwd(undefined, NEUTRAL)).toBe(NEUTRAL)
  })
  it('blank project resolves to neutral CWD', () => {
    expect(resolveChatCwd('   ', NEUTRAL)).toBe(NEUTRAL)
    expect(resolveChatCwd('', NEUTRAL)).toBe(NEUTRAL)
  })
})

describe('resolveChatCwd — explicit project preserved', () => {
  it('selected project directory is used verbatim', () => {
    expect(resolveChatCwd(PROJECT, NEUTRAL)).toBe(PROJECT)
  })
  it('surrounding whitespace is trimmed, never falls back', () => {
    expect(resolveChatCwd(`  ${PROJECT}  `, NEUTRAL)).toBe(PROJECT)
  })
})

describe('resolveChatCwd — continuation/resume equivalence', () => {
  it('continuation with a project resolves identically to initial', () => {
    expect(resolveChatCwd(PROJECT, NEUTRAL)).toBe(resolveChatCwd(PROJECT, NEUTRAL))
    expect(resolveChatCwd(PROJECT, NEUTRAL)).toBe(PROJECT)
  })
  it('continuation without a project resolves identically to initial (neutral)', () => {
    expect(resolveChatCwd(null, NEUTRAL)).toBe(resolveChatCwd(null, NEUTRAL))
    expect(resolveChatCwd(null, NEUTRAL)).toBe(NEUTRAL)
  })
  it('neutral CWD is never the repository root by accident', () => {
    // The resolver returns the caller-supplied neutral dir verbatim; call sites
    // supply ensureDataRoot() (APPDATA/Alpha One), never process.cwd().
    const out = resolveChatCwd(null, NEUTRAL)
    expect(out).not.toBe(process.cwd())
    expect(out.toLowerCase()).not.toContain('dev\\alpha-one'.replace('\\', '/'))
  })
})
