import { useCallback, useEffect, useState } from 'react'
import type { UsageResponse } from '@/services/subscription/router'
import { getProductAuthHeaders } from '@/features/ai/opencode/services/http-transport'

/**
 * TASK-ALPHA-SUBSCRIBER-012: shared recorded-usage consumer.
 *
 * Reads GET /api/subscription/usage (same origin). Never throws into the UI:
 * failures surface as the error model with a working retry action.
 */
export type UsageModel =
  | { kind: 'loading' }
  | { kind: 'ready'; total: number; runs: UsageResponse['runs'] }
  | { kind: 'error'; message: string; code: string | null }

/**
 * Fetch recorded usage. Exported for contract tests; the hook below is the
 * UI entry point. Never throws.
 */
export async function fetchUsage(): Promise<{
  data: UsageResponse | null
  error: string | null
  code: string | null
}> {
  try {
    // TASK-ALPHA-SUBSCRIBER-014: same verified session as subscription
    // status — logged-out callers read their device-local anonymous rows.
    const res = await fetch('/api/subscription/usage', {
      headers: { Accept: 'application/json', ...getProductAuthHeaders() },
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: unknown
        code?: unknown
      } | null
      const message =
        body && typeof body.error === 'string'
          ? body.error
          : `Usage could not be loaded (HTTP ${res.status}).`
      // TASK-ALPHA-SUBSCRIBER-028: machine code for expired-session handling.
      const code = body && typeof body.code === 'string' ? body.code : null
      return { data: null, error: message, code }
    }
    const raw = (await res.json()) as Partial<UsageResponse> | null
    if (!raw || !Array.isArray(raw.runs) || typeof raw.total !== 'number') {
      return { data: null, error: 'Usage response was invalid.', code: null }
    }
    return { data: { runs: raw.runs, total: raw.total }, error: null, code: null }
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : 'Usage could not be loaded.',
      code: null,
    }
  }
}

export function useSubscriptionUsage(): {
  model: UsageModel
  retry: () => void
} {
  const [model, setModel] = useState<UsageModel>({ kind: 'loading' })
  const [nonce, setNonce] = useState(0)

  const retry = useCallback(() => {
    setModel({ kind: 'loading' })
    setNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchUsage().then(({ data, error, code }) => {
      if (cancelled) return
      if (error || !data) {
        setModel({
          kind: 'error',
          message: error ?? 'Usage could not be loaded.',
          code: code ?? null,
        })
        return
      }
      setModel({ kind: 'ready', total: data.total, runs: data.runs })
    })
    return () => {
      cancelled = true
    }
  }, [nonce])

  return { model, retry }
}
