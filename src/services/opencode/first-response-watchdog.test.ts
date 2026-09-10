/**
 * TASK-082B-R2 §14: first-response watchdog unit tests (fake timers).
 * Covers: silence fire at threshold, single-fire, stdout/stderr/exit/close/
 * error disarm, manual disarm, custom threshold, post-activity stall immunity
 * (mid-generation territory — this timer must stay silent).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  armFirstResponseWatchdog,
  FIRST_RESPONSE_QUIET_MS,
  type FirstResponseWatchedChild,
} from './first-response-watchdog'

function fakeChild(): FirstResponseWatchedChild & { emit: (event: string) => void } {
  const listeners = new Map<string, Array<() => void>>()
  const mkStream = () => ({
    once: (event: string, cb: () => void) => {
      listeners.set(`stream:${event}`, [...(listeners.get(`stream:${event}`) ?? []), cb])
    },
    removeListener: (event: string, cb: () => void) => {
      listeners.set(`stream:${event}`, (listeners.get(`stream:${event}`) ?? []).filter((f) => f !== cb))
    },
  })
  return {
    stdout: mkStream(),
    stderr: mkStream(),
    once: (event: string, cb: () => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), cb])
    },
    removeListener: (event: string, cb: () => void) => {
      listeners.set(event, (listeners.get(event) ?? []).filter((f) => f !== cb))
    },
    emit: (event: string) => {
      for (const cb of [...(listeners.get(event) ?? [])]) cb()
      for (const cb of [...(listeners.get(`stream:${event}`) ?? [])]) cb()
    },
  } as unknown as FirstResponseWatchedChild & { emit: (event: string) => void }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('armFirstResponseWatchdog', () => {
  it('exposes the evidence-based 20s budget', () => {
    expect(FIRST_RESPONSE_QUIET_MS).toBe(20_000)
  })

  it('4. fires on total silence at the threshold (exhausted-model signature)', () => {
    const child = fakeChild()
    let fired = 0
    armFirstResponseWatchdog(child, { quietMs: FIRST_RESPONSE_QUIET_MS, onTimeout: () => { fired += 1 } })
    vi.advanceTimersByTime(19_999)
    expect(fired).toBe(0)
    vi.advanceTimersByTime(1)
    expect(fired).toBe(1)
  })

  it('12. fires exactly once even far past the threshold', () => {
    const child = fakeChild()
    let fired = 0
    armFirstResponseWatchdog(child, { quietMs: 5_000, onTimeout: () => { fired += 1 } })
    vi.advanceTimersByTime(600_000)
    expect(fired).toBe(1)
  })

  it('6. first stdout byte disarms (healthy fast model can never trip it)', () => {
    const child = fakeChild()
    let fired = 0
    armFirstResponseWatchdog(child, { quietMs: 5_000, onTimeout: () => { fired += 1 } })
    vi.advanceTimersByTime(1_000)
    child.emit('data')
    vi.advanceTimersByTime(600_000)
    expect(fired).toBe(0)
  })

  it('2. stderr byte disarms (early provider error path rides on bytes)', () => {
    const child = fakeChild()
    let fired = 0
    const disarm = armFirstResponseWatchdog(child, { quietMs: 5_000, onTimeout: () => { fired += 1 } })
    void disarm
    vi.advanceTimersByTime(1_000)
    child.emit('data')
    vi.advanceTimersByTime(600_000)
    expect(fired).toBe(0)
  })

  it.each(['exit', 'close', 'error'] as const)('3/9. %s disarms (early close / stop path)', (event) => {
    const child = fakeChild()
    let fired = 0
    armFirstResponseWatchdog(child, { quietMs: 5_000, onTimeout: () => { fired += 1 } })
    vi.advanceTimersByTime(1_000)
    child.emit(event)
    vi.advanceTimersByTime(600_000)
    expect(fired).toBe(0)
  })

  it('manual disarm prevents fire (stop / new-chat / settle paths)', () => {
    const child = fakeChild()
    let fired = 0
    const disarm = armFirstResponseWatchdog(child, { quietMs: 5_000, onTimeout: () => { fired += 1 } })
    vi.advanceTimersByTime(1_000)
    disarm()
    disarm()
    vi.advanceTimersByTime(600_000)
    expect(fired).toBe(0)
  })

  it('8. activity then stall never refires (mid-generation is out of scope)', () => {
    const child = fakeChild()
    let fired = 0
    armFirstResponseWatchdog(child, { quietMs: 5_000, onTimeout: () => { fired += 1 } })
    vi.advanceTimersByTime(1_000)
    child.emit('data')
    // Stall "forever" after genuine activity: this timer stays silent.
    vi.advanceTimersByTime(3_600_000)
    expect(fired).toBe(0)
  })

  it('7. tool-call bytes disarm like any stdout activity', () => {
    const child = fakeChild()
    let fired = 0
    armFirstResponseWatchdog(child, { quietMs: 5_000, onTimeout: () => { fired += 1 } })
    vi.advanceTimersByTime(4_999)
    child.emit('data')
    vi.advanceTimersByTime(1)
    expect(fired).toBe(0)
  })
})
