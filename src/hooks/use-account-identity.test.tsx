import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useAccountIdentity, refreshAccountIdentity, _resetForTesting } from './use-account-identity'

/**
 * TASK-078R3: Focused tests for canonical Google profile identity enrichment.
 *
 * Resolution chain:
 *   LOCAL OAuth status → providerUserId + email → VPS resolver → name/avatar
 */

function Harness() {
  const identity = useAccountIdentity()
  return (
    <div>
      <span data-testid='connected'>{String(identity.connected)}</span>
      <span data-testid='email'>{identity.email}</span>
      <span data-testid='name'>{identity.name}</span>
      <span data-testid='initials'>{identity.initials}</span>
      <span data-testid='avatar'>{identity.avatar}</span>
      <span data-testid='loading'>{String(identity.loading)}</span>
    </div>
  )
}

describe('useAccountIdentity', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    _resetForTesting()
  })

  it('enriches connected identity with canonical profile', async () => {
    const fetchFn = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.includes('/api/google/oauth/status')) {
        return {
          ok: true,
          json: async () => ({
            connected: true,
            email: 'test@gmail.com',
            providerUserId: 'google-sub-123',
          }),
        }
      }
      if (url.includes('/api/google/profile/resolve')) {
        return {
          ok: true,
          json: async () => ({
            providerUserId: 'google-sub-123',
            email: 'test@gmail.com',
            displayName: 'Test User',
            avatarUrl: 'https://example.com/avatar.jpg',
          }),
        }
      }
      return { ok: false, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchFn)

    const screen = await render(<Harness />)
    await expect.element(screen.getByTestId('connected')).toHaveTextContent('true')
    await expect.element(screen.getByTestId('email')).toHaveTextContent('test@gmail.com')
    await expect.element(screen.getByTestId('name')).toHaveTextContent('Test User')
    await expect.element(screen.getByTestId('avatar')).toHaveTextContent('https://example.com/avatar.jpg')
  })

  it('connected fallback when resolver returns 404', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/api/google/oauth/status')) {
        return {
          ok: true,
          json: async () => ({
            connected: true,
            email: 'test@gmail.com',
            providerUserId: 'google-sub-123',
          }),
        }
      }
      if (url.includes('/api/google/profile/resolve')) {
        return { ok: false, status: 404, json: async () => ({}) }
      }
      return { ok: false, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchFn)

    const screen = await render(<Harness />)
    await expect.element(screen.getByTestId('connected')).toHaveTextContent('true')
    await expect.element(screen.getByTestId('email')).toHaveTextContent('test@gmail.com')
    await expect.element(screen.getByTestId('name')).toHaveTextContent('Workspace User')
    await expect.element(screen.getByTestId('avatar')).toHaveTextContent('')
  })

  it('connected fallback when resolver network fails', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/api/google/oauth/status')) {
        return {
          ok: true,
          json: async () => ({
            connected: true,
            email: 'test@gmail.com',
            providerUserId: 'google-sub-123',
          }),
        }
      }
      if (url.includes('/api/google/profile/resolve')) {
        throw new Error('Network failure')
      }
      return { ok: false, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchFn)

    const screen = await render(<Harness />)
    await expect.element(screen.getByTestId('connected')).toHaveTextContent('true')
    await expect.element(screen.getByTestId('email')).toHaveTextContent('test@gmail.com')
    await expect.element(screen.getByTestId('name')).toHaveTextContent('Workspace User')
  })

  it('connected fallback when resolver returns malformed response', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/api/google/oauth/status')) {
        return {
          ok: true,
          json: async () => ({
            connected: true,
            email: 'test@gmail.com',
            providerUserId: 'google-sub-123',
          }),
        }
      }
      if (url.includes('/api/google/profile/resolve')) {
        return {
          ok: true,
          json: async () => ({ randomField: 'no displayName' }),
        }
      }
      return { ok: false, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchFn)

    const screen = await render(<Harness />)
    await expect.element(screen.getByTestId('connected')).toHaveTextContent('true')
    await expect.element(screen.getByTestId('email')).toHaveTextContent('test@gmail.com')
    await expect.element(screen.getByTestId('name')).toHaveTextContent('Workspace User')
  })

  it('disconnected state shows neutral fallback and no resolver call', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ connected: false }),
    }))
    vi.stubGlobal('fetch', fetchFn)

    const screen = await render(<Harness />)
    await expect.element(screen.getByTestId('connected')).toHaveTextContent('false')
    await expect.element(screen.getByTestId('email')).toHaveTextContent('local@workspace')
    await expect.element(screen.getByTestId('name')).toHaveTextContent('Workspace User')
    // Only one fetch (OAuth status), no resolver call
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('refreshAccountIdentity updates with enriched identity', async () => {
    let connected = false
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/api/google/oauth/status')) {
        return {
          ok: true,
          json: async () => connected
            ? { connected: true, email: 'new@gmail.com', providerUserId: 'sub-456' }
            : { connected: false },
        }
      }
      if (url.includes('/api/google/profile/resolve')) {
        return {
          ok: true,
          json: async () => ({
            providerUserId: 'sub-456',
            email: 'new@gmail.com',
            displayName: 'New User',
            avatarUrl: 'https://example.com/new.jpg',
          }),
        }
      }
      return { ok: false, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchFn)

    const screen = await render(<Harness />)
    await expect.element(screen.getByTestId('connected')).toHaveTextContent('false')

    // Simulate connect
    connected = true
    refreshAccountIdentity()

    await expect.element(screen.getByTestId('connected')).toHaveTextContent('true')
    await expect.element(screen.getByTestId('email')).toHaveTextContent('new@gmail.com')
    await expect.element(screen.getByTestId('name')).toHaveTextContent('New User')
    await expect.element(screen.getByTestId('avatar')).toHaveTextContent('https://example.com/new.jpg')
  })

  it('refresh after disconnect clears canonical identity', async () => {
    let connected = true
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/api/google/oauth/status')) {
        return {
          ok: true,
          json: async () => connected
            ? { connected: true, email: 'test@gmail.com', providerUserId: 'sub-789' }
            : { connected: false },
        }
      }
      if (url.includes('/api/google/profile/resolve')) {
        return {
          ok: true,
          json: async () => ({
            providerUserId: 'sub-789',
            email: 'test@gmail.com',
            displayName: 'Test User',
            avatarUrl: 'https://example.com/avatar.jpg',
          }),
        }
      }
      return { ok: false, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchFn)

    const screen = await render(<Harness />)
    await expect.element(screen.getByTestId('connected')).toHaveTextContent('true')
    await expect.element(screen.getByTestId('name')).toHaveTextContent('Test User')

    // Simulate disconnect
    connected = false
    refreshAccountIdentity()

    await expect.element(screen.getByTestId('connected')).toHaveTextContent('false')
    await expect.element(screen.getByTestId('email')).toHaveTextContent('local@workspace')
    await expect.element(screen.getByTestId('name')).toHaveTextContent('Workspace User')
    await expect.element(screen.getByTestId('avatar')).toHaveTextContent('')
  })

  it('deduplicates concurrent mounts', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ connected: false }),
    }))
    vi.stubGlobal('fetch', fetchFn)

    const screen = await render(
      <div>
        <Harness />
        <Harness />
      </div>
    )
    await expect.element(screen.getByTestId('email').first()).toHaveTextContent('local@workspace')
    // Only one fetch for both consumers
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('ignores invalid avatar URL from resolver', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/api/google/oauth/status')) {
        return {
          ok: true,
          json: async () => ({
            connected: true,
            email: 'test@gmail.com',
            providerUserId: 'sub-invalid',
          }),
        }
      }
      if (url.includes('/api/google/profile/resolve')) {
        return {
          ok: true,
          json: async () => ({
            providerUserId: 'sub-invalid',
            email: 'test@gmail.com',
            displayName: 'Valid Name',
            avatarUrl: 'not-a-valid-url',
          }),
        }
      }
      return { ok: false, json: async () => ({}) }
    })
    vi.stubGlobal('fetch', fetchFn)

    const screen = await render(<Harness />)
    await expect.element(screen.getByTestId('name')).toHaveTextContent('Valid Name')
    await expect.element(screen.getByTestId('avatar')).toHaveTextContent('')
  })
})
