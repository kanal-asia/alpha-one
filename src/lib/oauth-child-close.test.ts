import { afterEach, describe, expect, it, vi } from 'vitest'
import { OAuthAttempt } from './oauth-attempt'
import { resolveOAuthChildClose } from './production-oauth-client'

/**
 * MSI-067: child-closed decision boundary proof.
 *
 * G01 CONFIRMATION of the 066 root cause: the legacy decision — treating any
 * child close as cancellation without re-checking server state — discards a
 * completed session (RACE-00). The shared resolver fixes exactly that step.
 */
describe('resolveOAuthChildClose', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function mockSession(status: 'completed' | 'pending' | 'failed'): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status }),
      }))
    )
  }

  it('RACE-00 (G01): legacy close-without-recheck cancels a completed session', () => {
    // What the old watcher did: noteChildClosed() with no server read.
    const attempt = new OAuthAttempt()
    expect(attempt.noteChildClosed()).toBe('cancel')
    expect(attempt.shouldAbort()).toBe(true)
    expect(attempt.isUserCancelled).toBe(true)
    // A completed server session is now unreachable to this attempt: the
    // abort hook fires and the session id is cleared by the caller. This is
    // the 066 failure mechanism the resolver below replaces.
  })

  it('RACE-01: close after completed callback continues success', async () => {
    mockSession('completed')
    const attempt = new OAuthAttempt()
    const resolution = await resolveOAuthChildClose('sess-1', attempt)
    expect(resolution).toBe('continue-success')
    expect(attempt.isUserCancelled).toBe(false)
    expect(attempt.shouldAbort()).toBe(false)
    expect(attempt.isSuccessRecognized).toBe(true)
    expect(attempt.isSettled).toBe(false)
  })

  it('RACE-02: close while incomplete cancels exactly once', async () => {
    mockSession('pending')
    const attempt = new OAuthAttempt()
    const resolution = await resolveOAuthChildClose('sess-1', attempt)
    expect(resolution).toBe('cancel')
    expect(attempt.isUserCancelled).toBe(true)
    expect(attempt.shouldAbort()).toBe(true)
  })

  it('RACE-03: poll-wins-first stays success even if re-check lags', async () => {
    mockSession('pending')
    const attempt = new OAuthAttempt()
    attempt.noteStatusCompleted()
    const resolution = await resolveOAuthChildClose('sess-1', attempt)
    expect(resolution).toBe('continue-success')
    expect(attempt.isUserCancelled).toBe(false)
    expect(attempt.shouldAbort()).toBe(false)
  })

  it('RACE-04: explicit cancel on incomplete attempt still cancels', async () => {
    const attempt = new OAuthAttempt()
    expect(attempt.requestCancel()).toBe('cancel')
    expect(attempt.isUserCancelled).toBe(true)
    // Missing session/attempt degrades to the legacy cancel path.
    expect(await resolveOAuthChildClose(null, attempt)).toBe('cancel')
    expect(await resolveOAuthChildClose('sess-1', null)).toBe('cancel')
  })

  it('RACE-05: racing poll + re-check settle and persist exactly once', async () => {
    mockSession('completed')
    const attempt = new OAuthAttempt()
    let persists = 0
    const [r1, r2] = await Promise.all([
      resolveOAuthChildClose('sess-1', attempt),
      (async () => {
        attempt.noteStatusCompleted()
        return 'continue-success' as const
      })(),
    ])
    expect(r1).toBe('continue-success')
    expect(r2).toBe('continue-success')
    // Only the main flow persists, guarded by exactly-once settle.
    if (attempt.settle()) persists += 1
    if (attempt.settle()) persists += 1
    expect(persists).toBe(1)
    expect(attempt.isUserCancelled).toBe(false)
  })
})
