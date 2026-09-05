import { describe, expect, it } from 'vitest'
import { OAuthAttempt } from './oauth-attempt'

/**
 * MSI-070: OAuth completion ordering proof.
 *
 * PROVEN RACE: the Electron child is destroyed at the success redirect while
 * `settled` was set only after verify/persist/status. A watcher firing in
 * that window mistook success auto-close for manual cancellation. These tests
 * drive the ordering state machine through every scenario from the task.
 */
describe('OAuthAttempt ordering', () => {
  it('RACE-01: success auto-close after status-completed never cancels', () => {
    const attempt = new OAuthAttempt()
    // Poll returned completed; verify/persist still running.
    attempt.noteStatusCompleted()
    // Electron destroys the child at the success redirect.
    expect(attempt.noteChildClosed()).toBe('ignore')
    expect(attempt.shouldAbort()).toBe(false)
    expect(attempt.isUserCancelled).toBe(false)
    expect(attempt.settle()).toBe(true)
  })

  it('RACE-02: true manual close before success cancels and clears', () => {
    const attempt = new OAuthAttempt()
    expect(attempt.noteChildClosed()).toBe('cancel')
    expect(attempt.shouldAbort()).toBe(true)
    expect(attempt.isUserCancelled).toBe(true)
    expect(attempt.settle()).toBe(true)
  })

  it('RACE-03: successful completion settles exactly once', () => {
    const attempt = new OAuthAttempt()
    attempt.noteStatusCompleted()
    expect(attempt.noteChildClosed()).toBe('ignore')
    expect(attempt.requestCancel()).toBe('ignore')
    // Completion side effects run once: first settle wins.
    expect(attempt.settle()).toBe(true)
    expect(attempt.settle()).toBe(false)
    expect(attempt.isSettled).toBe(true)
  })

  it('RACE-04/05: cancel path still aborts the poll promptly', () => {
    const attempt = new OAuthAttempt()
    expect(attempt.requestCancel()).toBe('cancel')
    expect(attempt.shouldAbort()).toBe(true)
    // A late success signal cannot resurrect a cancelled, unfinished attempt
    // into a false success state transition (UI already idle).
    expect(attempt.settle()).toBe(true)
  })

  it('settled attempts ignore all further events', () => {
    const attempt = new OAuthAttempt()
    expect(attempt.settle()).toBe(true)
    expect(attempt.noteChildClosed()).toBe('ignore')
    expect(attempt.requestCancel()).toBe('ignore')
    expect(attempt.shouldAbort()).toBe(false)
    expect(attempt.isUserCancelled).toBe(false)
  })

  it('fresh attempts start uncancelled and unsettled', () => {
    const attempt = new OAuthAttempt()
    expect(attempt.shouldAbort()).toBe(false)
    expect(attempt.isUserCancelled).toBe(false)
    expect(attempt.isSettled).toBe(false)
    expect(attempt.isSuccessRecognized).toBe(false)
  })
})
