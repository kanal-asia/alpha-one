/**
 * TASK-082B-R2 Phase 1: request-timeline unit tests. First-mark-wins,
 * elapsed-ms math, bounded summary shape (no payloads/secrets ever).
 */
import { describe, expect, it } from 'vitest'
import { createTimeline, markTimeline, summarizeTimeline } from './request-timeline'

describe('request-timeline', () => {
  it('creates a zeroed timeline at the origin', () => {
    const tl = createTimeline(1000)
    expect(tl.t0).toBe(1000)
    expect(tl.firstStdoutAt).toBeNull()
    expect(tl.terminalAt).toBeNull()
    expect(tl.stdoutBytes).toBe(0)
  })

  it('first mark wins; later marks are no-ops', () => {
    const tl = createTimeline(0)
    markTimeline(tl, 'firstStdout', 500)
    markTimeline(tl, 'firstStdout', 900)
    expect(tl.firstStdoutAt).toBe(500)
  })

  it('records elapsed ms per lifecycle event', () => {
    const tl = createTimeline(0)
    markTimeline(tl, 'firstStderr', 120)
    markTimeline(tl, 'firstEvent', 200)
    markTimeline(tl, 'firstText', 350)
    markTimeline(tl, 'exit', 5_000)
    markTimeline(tl, 'close', 5_010)
    markTimeline(tl, 'errorEmitted', 30_000)
    markTimeline(tl, 'terminal', 30_005)
    markTimeline(tl, 'firstResponseFired', 30_000)
    const s = summarizeTimeline(tl)
    expect(s).toMatchObject({
      firstStderrMs: 120,
      firstEventMs: 200,
      firstTextMs: 350,
      exitMs: 5_000,
      closeMs: 5_010,
      errorEmittedMs: 30_000,
      terminalMs: 30_005,
      firstResponseFiredMs: 30_000,
      startupFiredMs: null,
    })
  })

  it('summary carries only timings, counts, and labels', () => {
    const tl = createTimeline(0)
    tl.stdoutBytes = 128
    const s = summarizeTimeline(tl)
    expect(s.stdoutBytes).toBe(128)
    expect(Object.keys(s).sort()).toEqual(
      [
        'closeMs',
        'errorEmittedMs',
        'firstEventMs',
        'firstResponseFiredMs',
        'firstStderrMs',
        'firstStdoutMs',
        'firstTextMs',
        'startupFiredMs',
        'stderrBytes',
        'stdoutBytes',
        'terminalMs',
        'exitMs',
      ].sort()
    )
  })
})
