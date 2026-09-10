/**
 * TASK-082-RUNTIME-CORRECTIVE (R04/R05): startup quiet watchdog.
 *
 * Proven mechanism: a stale `--session` resume hangs with zero output forever,
 * while healthy spawns emit step_start almost immediately. The watchdog fires
 * ONLY on total post-spawn silence, so it can never kill an active run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { armStartupWatchdog, STARTUP_QUIET_MS, type WatchedChild } from './spawn-watchdog'

function fakeChild(): WatchedChild & { emit: (event: string) => void; kills: string[] } {
  const listeners = new Map<string, Array<() => void>>()
  const mkStream = () => ({
    once: (event: string, cb: () => void) => {
      listeners.set(`stream:${event}`, [...(listeners.get(`stream:${event}`) ?? []), cb])
    },
    removeListener: (event: string, cb: () => void) => {
      listeners.set(`stream:${event}`, (listeners.get(`stream:${event}`) ?? []).filter((f) => f !== cb))
    },
  })
  const stdout = mkStream()
  const stderr = mkStream()
  return {
    stdout,
    stderr,
    kills: [],
    once: (event: string, cb: () => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), cb])
    },
    removeListener: (event: string, cb: () => void) => {
      listeners.set(event, (listeners.get(event) ?? []).filter((f) => f !== cb))
    },
    kill: function (this: { kills: string[] }, signal?: string): boolean {
      this.kills.push(signal ?? 'SIGTERM')
      return true
    },
    emit: (event: string) => {
      for (const cb of [...(listeners.get(event) ?? [])]) cb()
      for (const cb of [...(listeners.get(`stream:${event}`) ?? [])]) cb()
    },
  } as unknown as WatchedChild & { emit: (event: string) => void; kills: string[] }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('armStartupWatchdog', () => {
  it('exposes a sane silence budget constant', () => {
    expect(STARTUP_QUIET_MS).toBe(60_000)
  })

  it('fires after total silence (stale-session hang reproduction)', () => {
    const child = fakeChild()
    let fired = 0
    armStartupWatchdog(child, { quietMs: 60_000, onTimeout: () => { fired += 1 } })
    vi.advanceTimersByTime(59_999)
    expect(fired).toBe(0)
    vi.advanceTimersByTime(1)
    expect(fired).toBe(1)
    // Single fire only.
    vi.advanceTimersByTime(600_000)
    expect(fired).toBe(1)
  })

  it('stdout activity disarms (healthy run can never trip it)', () => {
    const child = fakeChild()
    let fired = 0
    armStartupWatchdog(child, { quietMs: 60_000, onTimeout: () => { fired += 1 } })
    vi.advanceTimersByTime(10_000)
    child.emit('data')
    vi.advanceTimersByTime(600_000)
    expect(fired).toBe(0)
  })

  it('stderr activity disarms', () => {
    const child = fakeChild()
    let fired = 0
    const disarm = armStartupWatchdog(child, { quietMs: 5_000, onTimeout: () => { fired += 1 } })
    expect(typeof disarm).toBe('function')
    child.emit('data')
    vi.advanceTimersByTime(60_000)
    expect(fired).toBe(0)
  })

  it('exit/close/error disarm', () => {
    for (const event of ['exit', 'close', 'error']) {
      const child = fakeChild()
      let fired = 0
      armStartupWatchdog(child, { quietMs: 1_000, onTimeout: () => { fired += 1 } })
      child.emit(event)
      vi.advanceTimersByTime(60_000)
      expect(fired).toBe(0)
    }
  })

  it('manual disarm prevents firing', () => {
    const child = fakeChild()
    let fired = 0
    const disarm = armStartupWatchdog(child, { quietMs: 1_000, onTimeout: () => { fired += 1 } })
    disarm()
    disarm()
    vi.advanceTimersByTime(60_000)
    expect(fired).toBe(0)
  })

  it('helper never kills by itself (caller owns settle/kill)', () => {
    const child = fakeChild()
    armStartupWatchdog(child, { quietMs: 1_000, onTimeout: () => undefined })
    vi.advanceTimersByTime(60_000)
    expect(child.kills).toEqual([])
  })
})
