import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOpenCodeStore } from './opencode-store'

/**
 * MSI-070: Developer Console must report the CANONICAL runtime state.
 *
 * PROVEN DEFECT: `detect()` logged the stale configured default
 * (`OpenCode not found at "opencode"`) even when the canonical bundled
 * resolver was healthy — the detection was health-based (correct) but the
 * user-visible text used the wrong source.
 */
describe('opencode-store detect() console reporting', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const PACKAGED = 'C:\\Program Files\\Alpha One\\resources\\opencode.exe'

  function mockFetch(healthy: boolean): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url)
        if (u.endsWith('/api/opencode/health')) {
          return { ok: true, json: async () => ({ cliReachable: healthy }) }
        }
        if (u.endsWith('/api/runtime')) {
          return {
            ok: true,
            json: async () => ({
              lifecycle: healthy ? 'ready' : 'error',
              stage: healthy ? 'ready' : 'error',
              cli: healthy
                ? {
                    installed: true,
                    version: '1.18.21',
                    executablePath: PACKAGED,
                    resolvedCommand: PACKAGED,
                  }
                : {
                    installed: false,
                    version: null,
                    executablePath: null,
                    resolvedCommand: null,
                  },
            }),
          }
        }
        return { ok: false, json: async () => ({}) }
      })
    )
  }

  it('logs the canonical packaged path when runtime is healthy', async () => {
    mockFetch(true)
    useOpenCodeStore.getState().clearLogs()
    await useOpenCodeStore.getState().detect()
    const messages = useOpenCodeStore.getState().logs.map((l) => l.message)
    expect(
      messages.some((m) => m.includes(PACKAGED)),
      `expected canonical path in logs, got: ${JSON.stringify(messages)}`
    ).toBe(true)
    expect(
      messages.some((m) => m.includes('not found at "opencode"'))
    ).toBe(false)
  })

  it('never prints the stale literal when runtime reports down', async () => {
    mockFetch(false)
    useOpenCodeStore.getState().clearLogs()
    await useOpenCodeStore.getState().detect()
    const messages = useOpenCodeStore.getState().logs.map((l) => l.message)
    expect(
      messages.some((m) => m.includes('not found at "opencode"')),
      `stale literal present: ${JSON.stringify(messages)}`
    ).toBe(false)
  })
})
