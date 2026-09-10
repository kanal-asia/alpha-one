/**
 * TASK-082B-R2 Phase 1: bounded request-lifecycle timing (pure, no I/O).
 * Records monotonic elapsed-ms markers around the OpenCode child lifecycle so
 * first-response vs mid-generation silence is evidence, not inference.
 * No prompts, payloads, secrets, or credentials are ever recorded — only
 * timestamps, byte counts, and classification labels.
 */

export interface RequestTimeline {
  /** Monotonic origin (Date.now() at spawn). All markers are elapsed ms. */
  t0: number
  spawnedAt: number
  firstStdoutAt: number | null
  firstStderrAt: number | null
  firstEventAt: number | null
  firstTextAt: number | null
  exitAt: number | null
  closeAt: number | null
  firstResponseFiredAt: number | null
  startupFiredAt: number | null
  errorEmittedAt: number | null
  terminalAt: number | null
  stdoutBytes: number
  stderrBytes: number
}

export function createTimeline(now: number = Date.now()): RequestTimeline {
  return {
    t0: now,
    spawnedAt: now,
    firstStdoutAt: null,
    firstStderrAt: null,
    firstEventAt: null,
    firstTextAt: null,
    exitAt: null,
    closeAt: null,
    firstResponseFiredAt: null,
    startupFiredAt: null,
    errorEmittedAt: null,
    terminalAt: null,
    stdoutBytes: 0,
    stderrBytes: 0,
  }
}

export type TimelineMark =
  | 'firstStdout'
  | 'firstStderr'
  | 'firstEvent'
  | 'firstText'
  | 'exit'
  | 'close'
  | 'firstResponseFired'
  | 'startupFired'
  | 'errorEmitted'
  | 'terminal'

/** Records the FIRST occurrence of a mark only; later calls are no-ops. */
export function markTimeline(tl: RequestTimeline, mark: TimelineMark, now: number = Date.now()): void {
  const elapsed = now - tl.t0
  switch (mark) {
    case 'firstStdout':
      if (tl.firstStdoutAt === null) tl.firstStdoutAt = elapsed
      break
    case 'firstStderr':
      if (tl.firstStderrAt === null) tl.firstStderrAt = elapsed
      break
    case 'firstEvent':
      if (tl.firstEventAt === null) tl.firstEventAt = elapsed
      break
    case 'firstText':
      if (tl.firstTextAt === null) tl.firstTextAt = elapsed
      break
    case 'exit':
      if (tl.exitAt === null) tl.exitAt = elapsed
      break
    case 'close':
      if (tl.closeAt === null) tl.closeAt = elapsed
      break
    case 'firstResponseFired':
      if (tl.firstResponseFiredAt === null) tl.firstResponseFiredAt = elapsed
      break
    case 'startupFired':
      if (tl.startupFiredAt === null) tl.startupFiredAt = elapsed
      break
    case 'errorEmitted':
      if (tl.errorEmittedAt === null) tl.errorEmittedAt = elapsed
      break
    case 'terminal':
      if (tl.terminalAt === null) tl.terminalAt = elapsed
      break
  }
}

/** Bounded one-line summary for structured logs (elapsed ms, counts, labels). */
export function summarizeTimeline(tl: RequestTimeline): Record<string, number | string | null> {
  return {
    firstStdoutMs: tl.firstStdoutAt,
    firstStderrMs: tl.firstStderrAt,
    firstEventMs: tl.firstEventAt,
    firstTextMs: tl.firstTextAt,
    exitMs: tl.exitAt,
    closeMs: tl.closeAt,
    firstResponseFiredMs: tl.firstResponseFiredAt,
    startupFiredMs: tl.startupFiredAt,
    errorEmittedMs: tl.errorEmittedAt,
    terminalMs: tl.terminalAt,
    stdoutBytes: tl.stdoutBytes,
    stderrBytes: tl.stderrBytes,
  }
}
