import { useEffect, useMemo } from 'react'
import type { RuntimeModel } from '@/features/runtime/contract'

/**
 * MSI-077 (Scope C): shared reasoning-variant selection logic, extracted from
 * `OpenCodeToolbar` (TASK-OPENCODE-023/023R1) so every chat view exposes the
 * same proven behavior instead of drifting.
 *
 * Proven runtime contract:
 * - variants are discovered dynamically per model (`model.variants` keys —
 *   e.g. low/medium/high/max/minimal/none/xhigh); never hardcoded;
 * - empty/absent variants hide the selector;
 * - the persisted `defaultVariant` wins when still valid, else "low" when
 *   available, else the first available key;
 * - `''` means "no variant sent" (CLI `--variant` omitted downstream).
 */
export function resolveDefaultVariant(
  available: string[],
  persisted: string
): string {
  if (available.includes(persisted)) return persisted
  if (available.includes('low')) return 'low'
  return available[0] ?? ''
}

export function variantDisplayName(variant: string): string {
  return variant.charAt(0).toUpperCase() + variant.slice(1)
}

export function useReasoningVariant(
  models: Pick<RuntimeModel, 'id' | 'variants'>[],
  effectiveModelId: string,
  defaultVariant: string,
  updateDefaultVariant: (variant: string) => void
): { variantNames: string[]; activeVariant: string } {
  const selectedModel = models.find((m) => m.id === effectiveModelId)
  const variantNames = useMemo(() => {
    const v = selectedModel?.variants
    return v ? Object.keys(v).sort() : []
  }, [selectedModel])

  const activeVariant = useMemo(
    () => resolveDefaultVariant(variantNames, defaultVariant),
    [variantNames, defaultVariant]
  )

  // Auto-select default when variant names exist but selection is empty.
  useEffect(() => {
    if (
      variantNames.length > 0 &&
      activeVariant &&
      activeVariant !== defaultVariant
    ) {
      updateDefaultVariant(activeVariant)
    }
  }, [variantNames, activeVariant, defaultVariant, updateDefaultVariant])

  return { variantNames, activeVariant }
}
