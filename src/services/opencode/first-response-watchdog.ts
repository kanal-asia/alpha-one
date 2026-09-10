/**
 * TASK-082B-R2: first-response watchdog for OpenCode children.
 *
 * Distinct from the 60s startup quiet watchdog (spawn-watchdog.ts), which is
 * the last-resort net for total post-spawn silence. This timer answers a
 * narrower question: has the child shown ANY sign of life since spawn?
 *
 * EVIDENCE BASIS (machine-mined 2026-09-10, opencode.log, 49 CLI runs;
 * re-validated 2026-09-11 on a fresh sample, see TASK-082B-R2-R1):
 * time-to-first-activity P50 ~40ms, P95 ~2s, max 7.7s, zero runs over 15s.
 * FIRST_RESPONSE_QUIET_MS = 20s keeps ~2.6x headroom over the max while cutting
 * the silent-failure wait to one third of the 60s baseline. Tuned down from
 * 30s per human UX feedback (TASK-082B-R2-R1); restore only on proven
 * false-timeout evidence, never on speculation.
 *
 * Semantics (explicitly separate from mid-generation behavior):
 * - Armed once at spawn. Disarms on the FIRST child stdout/stderr byte, exit,
 *   close, error, or manual disarm — whichever comes first.
 * - After the first byte the request is ACTIVE; this timer NEVER fires again.
 *   A later stall is mid-generation territory (existing design: the process
 *   terminates naturally; the 60s quiet-only net from R04 remains armed only
 *   while total silence persists).
 * - Fires at most once. The caller owns kill/settle/classify.
 *
 * Pure helper (no imports, no side effects beyond the timer): fully
 * unit-testable with fake timers.
 */

export interface FirstResponseWatchedOutput {
  once(event: 'data', cb: () => void): void
  removeListener(event: 'data', cb: () => void): void
}

export interface FirstResponseWatchedChild {
  stdout?: FirstResponseWatchedOutput | null
  stderr?: FirstResponseWatchedOutput | null
  once(event: 'exit' | 'close' | 'error', cb: () => void): void
  removeListener(event: 'exit' | 'close' | 'error', cb: () => void): void
}

export interface FirstResponseWatchdogOptions {
  /** Silence budget in ms. Fires only if nothing is observed for this long. */
  quietMs: number
  onTimeout: () => void
}

/**
 * First-response silence budget. Evidence: P50 ~40ms / P95 ~2s / max 7.7s /
 * zero over 15s across mined CLI runs; 20s keeps ~2.6x headroom over the max
 * while cutting silent-failure detection to one third of the 60s baseline.
 */
export const FIRST_RESPONSE_QUIET_MS = 20_000

export function armFirstResponseWatchdog(
  child: FirstResponseWatchedChild,
  options: FirstResponseWatchdogOptions
): () => void {
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
