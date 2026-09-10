/**
 * TASK-082-RUNTIME-CORRECTIVE (R04): startup quiet watchdog for OpenCode children.
 *
 * PROVEN MECHANISM (machine-reproduced 2026-09-08): `opencode run --session
 * <stale-id>` in an otherwise healthy runtime hangs indefinitely with ZERO
 * stdout/stderr/exit (fresh spawns complete in seconds). A prior task
 * (TASK-OPENCODE-045) removed the blanket 60s timeout because it killed ACTIVE
 * executions; this watchdog fires ONLY on total post-spawn silence, so active
 * runs (which emit step_start/text almost immediately) can never trip it.
 *
 * Pure helper (no imports, no side effects): the caller kills/settles. Fully
 * unit-testable with fake timers. Any output byte, stderr byte, exit, error,
 * close, or manual disarm cancels the timer exactly once.
 */

export interface WatchedOutput {
  once(event: 'data', cb: () => void): void
  removeListener(event: 'data', cb: () => void): void
}

export interface WatchedChild {
  stdout?: WatchedOutput | null
  stderr?: WatchedOutput | null
  once(event: 'exit' | 'close' | 'error', cb: () => void): void
  removeListener(event: 'exit' | 'close' | 'error', cb: () => void): void
}

export interface StartupWatchdogOptions {
  /** Silence budget in ms. Fires only if nothing is observed for this long. */
  quietMs: number
  onTimeout: () => void
}

/** Default silence budget: 60s of total post-spawn silence means wedged. */
export const STARTUP_QUIET_MS = 60_000

export function armStartupWatchdog(child: WatchedChild, options: StartupWatchdogOptions): () => void {
  let fired = false
  let disarmed = false

  const disarm = (): void => {
    if (disarmed) return
    disarmed = true
    clearTimeout(timer)
    child.stdout?.removeListener('data', onActivity)
    child.stderr?.removeListener('data', onActivity)
    child.removeListener('exit', onActivity)
    child.removeListener('close', onActivity)
    child.removeListener('error', onActivity)
  }

  function onActivity(): void {
    disarm()
  }

  function onTimeout(): void {
    if (fired || disarmed) return
    fired = true
    disarm()
    options.onTimeout()
  }

  const timer = setTimeout(onTimeout, options.quietMs)
  child.stdout?.once('data', onActivity)
  child.stderr?.once('data', onActivity)
  child.once('exit', onActivity)
  child.once('close', onActivity)
  child.once('error', onActivity)

  return disarm
}
