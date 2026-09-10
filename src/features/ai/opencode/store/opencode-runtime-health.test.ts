/**
 * H06 regression: runtime health "not installed" false positive.
 *
 * PROVEN DEFECT: `installed` was false when cli.installed=true AND
 * lifecycle=error — conflating "binary missing" with "runtime error".
 * After corrective, binary-present + error-lifecycle must still report
 * installed=true so the UI does not say "not installed".
 *
 * Uses the same fetch-stub pattern as opencode-console.test.ts.
 */
import './refresh-feedback-test-setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOpenCodeStore } from './opencode-store'

function stubFetch(snapshots: Array<{ lifecycle: string; stage: string; cli: { installed: boolean; version: string | null; executablePath: string | null; resolvedCommand: string | null; probeMs: number | null } }>): void {
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
            cli: s.cli,
          }),
        }
      }
      return { ok: false, json: async () => ({}) }
    })
  )
}

function installed(): boolean {
  return useOpenCodeStore.getState().installed
}

function messages(): string[] {
  return useOpenCodeStore.getState().logs.map((l) => l.message)
}

function reset(): void {
  useOpenCodeStore.getState().clearLogs()
  useOpenCodeStore.setState({
    connection: 'disconnected',
    installed: null,
    session: null,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  reset()
})

const INSTALLED_CLI = {
  installed: true,
  version: '1.18.21',
  executablePath: 'C:\\Program Files\\Alpha One\\resources\\opencode.exe',
  resolvedCommand: 'C:\\Program Files\\Alpha One\\resources\\opencode.exe',
  probeMs: 150,
}

describe('runtime health — binary present + lifecycle error (H05 taxonomy)', () => {
  it('PROVEN DEFECT FIX: binary present + lifecycle error → installed=true (not "not installed")', async () => {
    stubFetch([
      { lifecycle: 'error', stage: 'error', cli: INSTALLED_CLI },
    ])
    // detect() has a 30s deadline with 1s poll interval.
    // With real timers + instant fetch stub, one poll sees terminal error → completes quickly.
    const detect = useOpenCodeStore.getState().detect
    await detect()

    // NEW behavior: installed = true (binary is present, despite error lifecycle)
    expect(installed()).toBe(true)

    // Must NOT log "not installed" — binary exists
    const notInstalled = messages().some((m) => m.includes('not installed'))
    expect(notInstalled).toBe(false)

    // Must log detection with error-state hint
    const detected = messages().some((m) => m.includes('OpenCode detected at') && m.includes('error state'))
    expect(detected).toBe(true)
  })

  it('binary genuinely absent → still reports not_installed', async () => {
    stubFetch([
      { lifecycle: 'error', stage: 'error', cli: { installed: false, version: null, executablePath: null, resolvedCommand: null, probeMs: null } },
    ])
    await useOpenCodeStore.getState().detect()

    expect(installed()).toBe(false)
    const notInstalled = messages().some((m) => m.includes('not installed'))
    expect(notInstalled).toBe(true)
  })

  it('verification pending (transitional) does not become not_installed', async () => {
    stubFetch([
      { lifecycle: 'starting', stage: 'checking_cli', cli: INSTALLED_CLI },
      { lifecycle: 'ready', stage: 'ready', cli: INSTALLED_CLI },
    ])
    await useOpenCodeStore.getState().detect()

    // Transitional lifecycle → not terminal → keeps polling → eventually ready
    expect(installed()).toBe(true)
    const detected = messages().some((m) => m.includes('OpenCode detected at'))
    expect(detected).toBe(true)
  })

  it('successful verification transitions to ready', async () => {
    stubFetch([
      { lifecycle: 'healthy', stage: 'checking_cli', cli: INSTALLED_CLI },
      { lifecycle: 'loading_models', stage: 'loading_models', cli: INSTALLED_CLI },
      { lifecycle: 'ready', stage: 'ready', cli: INSTALLED_CLI },
    ])
    await useOpenCodeStore.getState().detect()

    expect(installed()).toBe(true)
    expect(useOpenCodeStore.getState().connection).toBe('connected')
  })

  it('prior error state is cleared when binary is subsequently healthy', async () => {
    // First: error lifecycle with binary present → installed=true (corrective)
    stubFetch([
      { lifecycle: 'error', stage: 'error', cli: INSTALLED_CLI },
    ])
    await useOpenCodeStore.getState().detect()
    expect(installed()).toBe(true)

    reset()
    // Second: healthy lifecycle → also installed=true
    stubFetch([
      { lifecycle: 'ready', stage: 'ready', cli: INSTALLED_CLI },
    ])
    await useOpenCodeStore.getState().detect()
    expect(installed()).toBe(true)
    expect(useOpenCodeStore.getState().connection).toBe('connected')
  })
})
