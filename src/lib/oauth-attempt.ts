/**
 * MSI-070: OAuth attempt ordering guard.
 *
 * PROVEN RACE (code-evidence): the Electron OAuth child is destroyed the
 * moment the success redirect lands, but `settled` was only set after
 * verify/persist/status completed. A `child.closed` watcher firing in that
 * window mistook success auto-close for manual cancellation: it poisoned the
 * abort hook, cleared the stored session, and dropped the UI to idle —
 * silently discarding a real Google approval.
 *
 * This state machine is the single authority for attempt ordering. Both
 * Google connection surfaces drive their watcher, Cancel action, and abort
 * hook through it. Rules:
 *
 * - success recognition (`noteStatusCompleted`, fired the moment production
 *   status reads completed, BEFORE verify/persist) permanently disables
 *   cancellation for the attempt;
 * - manual close / Cancel before success cancels exactly once;
 * - `settle()` succeeds exactly once (duplicate-completion proof);
 * - `shouldAbort()` (poll abort hook) is true only for genuine cancels.
 */
export type OAuthAttemptAction = 'cancel' | 'ignore'

export class OAuthAttempt {
  private userCancelRequested = false
  private successRecognized = false
  private settled = false

  /** Poll abort hook: abort only genuine pre-success cancels. */
  shouldAbort(): boolean {
    return this.userCancelRequested && !this.successRecognized
  }

  /** Cancellation the UI must honor (manual close/Cancel before success). */
  get isUserCancelled(): boolean {
    return this.userCancelRequested && !this.successRecognized
  }

  get isSettled(): boolean {
    return this.settled
  }

  get isSuccessRecognized(): boolean {
    return this.successRecognized
  }

  /**
   * Called the moment production status reads `completed`, before
   * verify/persist/status run. From here on, child auto-close is expected
   * and MUST NOT cancel the attempt.
   */
  noteStatusCompleted(): void {
    this.successRecognized = true
  }

  /**
   * Child window closed (indistinguishable cause: user manual close OR
   * success auto-close). Returns 'cancel' only when no success was
   * recognized and the attempt has not settled.
   */
  noteChildClosed(): OAuthAttemptAction {
    if (this.settled || this.successRecognized) return 'ignore'
    this.userCancelRequested = true
    return 'cancel'
  }

  /** Explicit Cancel action. Ignored after success recognition/settling. */
  requestCancel(): OAuthAttemptAction {
    if (this.settled || this.successRecognized) return 'ignore'
    this.userCancelRequested = true
    return 'cancel'
  }

  /**
   * Mark the attempt terminal. Returns true exactly once per attempt, so
   * completion side effects (status set, session cleanup) provably run once.
   */
  settle(): boolean {
    if (this.settled) return false
    this.settled = true
    return true
  }
}
