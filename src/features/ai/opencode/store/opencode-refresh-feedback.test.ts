import './refresh-feedback-test-setup'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOpenCodeStore } from './opencode-store'

/**
 * TASK-ALPHA-LOCAL-080C3R2: refresh feedback state propagation proof.
 *
 * Contract under test (both model and provider):
 *   idle -> refreshing=true,result=idle -> request -> success/error
 *   -> refreshing=false -> timer -> result=idle.
 * Non-force loads must NOT touch the feedback result fields (otherwise the
 * buttons would be stuck on "Updated" after initial page load).
 */

const MODEL = {
  id: 'opencode/test-free',
  provider: 'opencode',
  slug: 'test-free',
  displayName: 'Test Free',
  free: true,
  availability: 'available',
  latency: 'low',
}

const PROVIDER = {
  id: 'opencode',
  name: 'OpenCode',
  connection: 'connected',
  modelCount: 1,
  freeModelCount: 1,
  hasCredentials: false,
  requiresAuth: false,
  source: 'runtime',
}

function stubFetch(impl: (url: string, init?: RequestInit) => unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => impl(url, init))
  )
}

function okJson(body: unknown): unknown {
  return { ok: true, json: async () => body }
}

function baseImpl(url: string): unknown {
  const u = String(url)
  if (u.includes('/runtime/refresh-models')) {
    return okJson({ models: [MODEL], fetchedAt: new Date().toISOString() })
  }
  if (u.includes('/api/opencode/models')) {
    return okJson({ models: [MODEL] })
  }
  if (u.includes('/api/opencode/modes')) {
    return okJson({ modes: [] })
  }
  if (u.includes('/api/opencode/providers')) {
    return okJson({ providers: [PROVIDER] })
  }
  if (u.includes('/api/opencode/config')) {
    return { ok: false, json: async () => ({}) }
  }
  return { ok: false, json: async () => ({}) }
}

beforeEach(() => {
  vi.useFakeTimers()
  useOpenCodeStore.setState({
    modelRefreshing: false,
    modelRefreshResult: 'idle',
    providerRefreshing: false,
    providerRefreshResult: 'idle',
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('model refresh feedback state machine', () => {
  it('sets refreshing=true while force refresh is in flight', async () => {
    let resolveRefresh!: (v: unknown) => void
    const gate = new Promise((r) => {
      resolveRefresh = r
    })
    stubFetch((url) => {
      if (String(url).includes('/runtime/refresh-models')) return gate
      return baseImpl(url)
    })
    const pending = useOpenCodeStore.getState().loadModels(true)
    expect(useOpenCodeStore.getState().modelRefreshing).toBe(true)
    expect(useOpenCodeStore.getState().modelRefreshResult).toBe('idle')
    resolveRefresh(okJson({ models: [MODEL] }))
    await pending
    expect(useOpenCodeStore.getState().modelRefreshing).toBe(false)
    expect(useOpenCodeStore.getState().modelRefreshResult).toBe('success')
  })

  it('resets success to idle after the acknowledgement timer', async () => {
    stubFetch(baseImpl)
    await useOpenCodeStore.getState().loadModels(true)
    expect(useOpenCodeStore.getState().modelRefreshResult).toBe('success')
    await vi.advanceTimersByTimeAsync(1600)
    expect(useOpenCodeStore.getState().modelRefreshResult).toBe('idle')
  })

  it('reports error and resets after the failure timer', async () => {
    stubFetch(() => ({ ok: false, json: async () => ({ error: 'boom' }) }))
    await useOpenCodeStore.getState().loadModels(true)
    const s = useOpenCodeStore.getState()
    expect(s.modelRefreshing).toBe(false)
    expect(s.modelRefreshResult).toBe('error')
    await vi.advanceTimersByTimeAsync(2100)
    expect(useOpenCodeStore.getState().modelRefreshResult).toBe('idle')
  })

  it('non-force load does not touch the feedback result', async () => {
    stubFetch(baseImpl)
    await useOpenCodeStore.getState().loadModels()
    expect(useOpenCodeStore.getState().modelsLoaded).toBe(true)
    expect(useOpenCodeStore.getState().modelRefreshing).toBe(false)
    expect(useOpenCodeStore.getState().modelRefreshResult).toBe('idle')
  })

  it('force refresh reads the list endpoint after the server ack (R2B n=0 regression)', async () => {
    stubFetch((url) => {
      const u = String(url)
      // Server returns a RuntimeModelsInfo ACK with NO models array.
      if (u.includes('/runtime/refresh-models')) {
        return okJson({ total: 1, free: 1, providers: 1, source: 'opencode' })
      }
      return baseImpl(url)
    })
    await useOpenCodeStore.getState().loadModels(true)
    const s = useOpenCodeStore.getState()
    expect(s.models.length).toBe(1)
    expect(s.modelRefreshResult).toBe('success')
  })

  it('empty force result preserves the previous usable catalog (R2B safety)', async () => {
    stubFetch(baseImpl)
    await useOpenCodeStore.getState().loadModels()
    expect(useOpenCodeStore.getState().models.length).toBe(1)
    stubFetch((url) => {
      const u = String(url)
      if (u.includes('/runtime/refresh-models')) return okJson({ total: 0 })
      if (u.includes('/api/opencode/models')) return okJson({ models: [] })
      return baseImpl(url)
    })
    await useOpenCodeStore.getState().loadModels(true)
    const s = useOpenCodeStore.getState()
    expect(s.models.length).toBe(1)
    expect(s.modelRefreshResult).toBe('error')
    await vi.advanceTimersByTimeAsync(2100)
    expect(useOpenCodeStore.getState().modelRefreshResult).toBe('idle')
  })

  it('concurrent force refreshes share one server run', async () => {
    stubFetch(baseImpl)
    const store = useOpenCodeStore.getState()
    await Promise.all([store.loadModels(true), store.loadModels(true)])
    const fetchMock = fetch as unknown as { mock: { calls: unknown[][] } }
    const posts = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/runtime/refresh-models')
    )
    expect(posts.length).toBe(1)
    expect(useOpenCodeStore.getState().modelRefreshResult).toBe('success')
  })
})

describe('provider refresh feedback state machine', () => {
  it('sets providerRefreshing=true while refresh is in flight', async () => {
    let resolveProviders!: (v: unknown) => void
    const gate = new Promise((r) => {
      resolveProviders = r
    })
    stubFetch((url) => {
      if (String(url).includes('/api/opencode/providers')) return gate
      return baseImpl(url)
    })
    const pending = useOpenCodeStore.getState().loadProviders(true)
    expect(useOpenCodeStore.getState().providerRefreshing).toBe(true)
    expect(useOpenCodeStore.getState().providerRefreshResult).toBe('idle')
    resolveProviders(okJson({ providers: [PROVIDER] }))
    await pending
    expect(useOpenCodeStore.getState().providerRefreshing).toBe(false)
    expect(useOpenCodeStore.getState().providerRefreshResult).toBe('success')
  })

  it('resets provider success to idle after the acknowledgement timer', async () => {
    stubFetch(baseImpl)
    await useOpenCodeStore.getState().loadProviders(true)
    expect(useOpenCodeStore.getState().providerRefreshResult).toBe('success')
    await vi.advanceTimersByTimeAsync(1600)
    expect(useOpenCodeStore.getState().providerRefreshResult).toBe('idle')
  })

  it('reports provider error and resets after the failure timer', async () => {
    stubFetch(() => ({ ok: false, json: async () => ({ error: 'boom' }) }))
    await useOpenCodeStore.getState().loadProviders(true)
    const s = useOpenCodeStore.getState()
    expect(s.providerRefreshing).toBe(false)
    expect(s.providerRefreshResult).toBe('error')
    await vi.advanceTimersByTimeAsync(2100)
    expect(useOpenCodeStore.getState().providerRefreshResult).toBe('idle')
  })

  it('non-force provider load does not touch the feedback result', async () => {
    stubFetch(baseImpl)
    await useOpenCodeStore.getState().loadProviders()
    expect(useOpenCodeStore.getState().providersLoaded).toBe(true)
    expect(useOpenCodeStore.getState().providerRefreshing).toBe(false)
    expect(useOpenCodeStore.getState().providerRefreshResult).toBe('idle')
  })
})

describe('refresh feedback reactivity', () => {
  it('external store mutation notifies subscribers (no stale snapshot)', () => {
    const seen: boolean[] = []
    const unsub = useOpenCodeStore.subscribe((s) => {
      seen.push(s.modelRefreshing)
    })
    try {
      useOpenCodeStore.setState({ modelRefreshing: true })
      useOpenCodeStore.setState({ modelRefreshing: false })
    } finally {
      unsub()
    }
    expect(seen).toContain(true)
    expect(seen[seen.length - 1]).toBe(false)
  })
})
