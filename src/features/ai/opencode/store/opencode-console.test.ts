import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOpenCodeStore } from './opencode-store'

/**
 * MSI-071: Developer Console must reflect the runtime lifecycle instead of
 * emitting a false terminal error during normal startup.
 *
 * PROVEN DEFECT: detect() treated any non-ready snapshot as terminal, so a
 * launch observed as `Starting Runtime...` produced
 * `OpenCode runtime reported not installed` before detection finished — and
 * the stale error lingered after the runtime became healthy.
 */
describe('opencode-store detect() lifecycle reporting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  const PACKAGED = 'C:\\Program Files\\Alpha One\\resources\\opencode.exe'

  /** Queue of /api/runtime snapshots served in order (then repeated). */
  function mockRuntimeSnapshots(
    snapshots: Array<{ lifecycle: string; stage: string; installed: boolean }>
  ): void {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.endsWith('/api/opencode/health')) {
          return { ok: true, json: async () => ({ cliReachable: true }) }
        }
        if (u.endsWith('/api/runtime')) {
          const s = snapshots[Math.min(calls, snapshots.length - 1)]
          calls += 1
          return {
            ok: true,
            json: async () => ({
              lifecycle: s.lifecycle,
              stage: s.stage,
              cli: {
                installed: s.installed,
                version: s.installed ? '1.18.21' : null,
                executablePath: s.installed ? PACKAGED : null,
                resolvedCommand: s.installed ? PACKAGED : null,
              },
            }),
          }
        }
        return { ok: false, json: async () => ({}) }
      })
    )
  }

  function messages(): string[] {
    return useOpenCodeStore.getState().logs.map((l) => l.message)
  }

  function reset(): void {
    useOpenCodeStore.getState().clearLogs()
    useOpenCodeStore.setState({ installed: null, connection: 'disconnected' })
  }

  it('CONSOLE-STARTUP-01/02: starting → checking_cli emits pending only', async () => {
    vi.useFakeTimers()
    mockRuntimeSnapshots([
      { lifecycle: 'starting', stage: 'starting', installed: false },
      { lifecycle: 'starting', stage: 'checking_cli', installed: false },
      { lifecycle: 'ready', stage: 'ready', installed: true },
    ])
    reset()
    const done = useOpenCodeStore.getState().detect()
    // Let the first two polls run (transitional), not yet the terminal one.
    await vi.advanceTimersByTimeAsync(1500)
    const mid = messages()
    expect(
      mid.some((m) => m.includes('not installed')),
      `false error during startup: ${JSON.stringify(mid)}`
    ).toBe(false)
    expect(mid.some((m) => /starting|Checking/i.test(m))).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    await done
    const end = messages()
    expect(end.some((m) => m.includes(PACKAGED))).toBe(true)
    expect(end.some((m) => m.includes('not installed'))).toBe(false)
  })

  it('CONSOLE-STARTUP-03: loading_* phases never emit terminal failure', async () => {
    vi.useFakeTimers()
    mockRuntimeSnapshots([
      { lifecycle: 'starting', stage: 'starting', installed: false },
      { lifecycle: 'loading_models', stage: 'loading_models', installed: false },
      { lifecycle: 'ready', stage: 'ready', installed: true },
    ])
    reset()
    const done = useOpenCodeStore.getState().detect()
    await vi.advanceTimersByTimeAsync(1200)
    expect(
      messages().some((m) => m.includes('not installed'))
    ).toBe(false)
    await vi.advanceTimersByTimeAsync(5000)
    await done
    expect(messages().some((m) => m.includes(PACKAGED))).toBe(true)
  })

  it('CONSOLE-STARTUP-04: ready + installed shows canonical path, no stale failure', async () => {
    mockRuntimeSnapshots([
      { lifecycle: 'ready', stage: 'ready', installed: true },
    ])
    reset()
    await useOpenCodeStore.getState().detect()
    const ms = messages()
    expect(ms.some((m) => m.includes(PACKAGED))).toBe(true)
    expect(ms.some((m) => m.includes('not installed'))).toBe(false)
    expect(useOpenCodeStore.getState().connection).toBe('connected')
  })

  it('CONSOLE-FAIL-01: terminal not-installed emits one evidence-backed error', async () => {
    mockRuntimeSnapshots([
      { lifecycle: 'ready', stage: 'ready', installed: false },
    ])
    reset()
    await useOpenCodeStore.getState().detect()
    const ms = messages()
    const errors = ms.filter((m) => m.includes('not installed'))
    expect(errors.length).toBe(1)
    expect(errors[0]).toMatch(/lifecycle=ready/)
    expect(useOpenCodeStore.getState().connection).toBe('disconnected')
  })

  it('CONSOLE-RECOVERY-01: failure then ready recovers without contradiction', async () => {
    mockRuntimeSnapshots([
      { lifecycle: 'ready', stage: 'ready', installed: false },
    ])
    reset()
    await useOpenCodeStore.getState().detect()
    expect(
      messages().some((m) => m.includes('not installed'))
    ).toBe(true)

    mockRuntimeSnapshots([
      { lifecycle: 'ready', stage: 'ready', installed: true },
    ])
    await useOpenCodeStore.getState().detect()
    const ms = messages()
    // Store logs are newest-first: the recovery success must lead.
    expect(ms[0]).toContain(PACKAGED)
    expect(ms.some((m) => m.includes('not installed'))).toBe(true)
    expect(useOpenCodeStore.getState().connection).toBe('connected')
  })

  it('concurrent detect() calls share one run (no duplicate diagnostics)', async () => {
    mockRuntimeSnapshots([
      { lifecycle: 'ready', stage: 'ready', installed: true },
    ])
    reset()
    await Promise.all([
      useOpenCodeStore.getState().detect(),
      useOpenCodeStore.getState().detect(),
    ])
    const verdicts = messages().filter(
      (m) => m.includes(PACKAGED) || m.includes('not installed')
    )
    expect(verdicts.length).toBe(1)
  })
})
