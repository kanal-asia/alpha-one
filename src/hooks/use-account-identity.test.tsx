import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { useAccountIdentity, refreshAccountIdentity, _resetForTesting } from './use-account-identity'

/**
 * TASK-078R1C1: Focused tests for the corrected LOCAL account identity consumer.
 *
 * Root cause was STALE_MODULE_CACHE: module-level cache was set once
 * and never refreshed. Fix: fetch on every mount + refreshAccountIdentity()
 * for post-connect/disconnect invalidation.
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

  it('fetches on mount and shows connected email', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ connected: true, email: 'test@gmail.com', providerUserId: '123' }),
    }))
    vi.stubGlobal('fetch', fetchFn)

    const screen = await render(<Harness />)
    await expect.element(screen.getByTestId('connected')).toHaveTextContent('true')
    await expect.element(screen.getByTestId('email')).toHaveTextContent('test@gmail.com')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('shows disconnected fallback when status is false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ connected: false }),
    })))

    const screen = await render(<Harness />)
    await expect.element(screen.getByTestId('connected')).toHaveTextContent('false')
    await expect.element(screen.getByTestId('email')).toHaveTextContent('local@workspace')
    await expect.element(screen.getByTestId('name')).toHaveTextContent('Workspace User')
  })

  it('shows disconnected fallback on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('fail') }))

    const screen = await render(<Harness />)
    await expect.element(screen.getByTestId('connected')).toHaveTextContent('false')
    await expect.element(screen.getByTestId('email')).toHaveTextContent('local@workspace')
  })

  it('shows disconnected fallback on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })))

    const screen = await render(<Harness />)
    await expect.element(screen.getByTestId('connected')).toHaveTextContent('false')
  })

  it('shows disconnected fallback when connected but no email', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ connected: true }),
    })))

    const screen = await render(<Harness />)
    await expect.element(screen.getByTestId('connected')).toHaveTextContent('false')
    await expect.element(screen.getByTestId('email')).toHaveTextContent('local@workspace')
  })

  it('refreshAccountIdentity forces re-fetch and updates state', async () => {
    let returnConnected = false
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        connected: returnConnected,
        email: returnConnected ? 'new@gmail.com' : undefined,
      }),
    }))
    vi.stubGlobal('fetch', fetchFn)

    // First mount: disconnected
    const screen = await render(<Harness />)
    await expect.element(screen.getByTestId('connected')).toHaveTextContent('false')
    expect(fetchFn).toHaveBeenCalledTimes(1)

    // Simulate connect: now the endpoint returns connected
    returnConnected = true
    refreshAccountIdentity()

    // Should re-fetch and update
    await expect.element(screen.getByTestId('connected')).toHaveTextContent('true')
    await expect.element(screen.getByTestId('email')).toHaveTextContent('new@gmail.com')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent mounts', async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({ connected: false }),
    }))
    vi.stubGlobal('fetch', fetchFn)

    // Two components mount simultaneously
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
})
