import { useCallback, useEffect, useState } from 'react'
import {
  fetchSubscriptionStatus,
  type PlanCardModel,
  toPlanCardModel,
} from '@/lib/subscription-status'

/**
 * TASK-ALPHA-SUBSCRIBER-003: shared subscription-status consumer.
 *
 * Returns the card view model plus a retry action for the error state.
 * Server data only — while loading, consumers render their loading state;
 * no plan figure is shown until the response arrives.
 */
export function useSubscriptionStatus(): {
  model: PlanCardModel
  retry: () => void
} {
  const [model, setModel] = useState<PlanCardModel>({ kind: 'loading' })
  const [nonce, setNonce] = useState(0)

  const retry = useCallback(() => {
    setModel({ kind: 'loading' })
    setNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    void fetchSubscriptionStatus().then(({ status, error }) => {
      if (cancelled) return
      setModel(toPlanCardModel({ loading: false, status, error }))
    })
    return () => {
      cancelled = true
    }
  }, [nonce])

  return { model, retry }
}
