import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import {
  resolveDefaultVariant,
  useReasoningVariant,
} from './reasoning-variant'

/**
 * MSI-077 (Scope C): shared reasoning-variant selection proof.
 * Contract (proven live: `opencode models --verbose` emits per-model
 * `variants` records; server maps selection to CLI `--variant`):
 * dynamic keys only, never fabricated; empty selection sends nothing.
 */
describe('resolveDefaultVariant', () => {
  it('keeps a persisted variant that is still valid', () => {
    expect(resolveDefaultVariant(['high', 'low', 'max'], 'high')).toBe('high')
  })

  it('prefers low when persisted is missing or invalid', () => {
    expect(resolveDefaultVariant(['high', 'low', 'max'], '')).toBe('low')
    expect(resolveDefaultVariant(['high', 'low'], 'max')).toBe('low')
  })

  it('falls back to first available without low', () => {
    expect(resolveDefaultVariant(['max', 'minimal'], '')).toBe('max')
  })

  it('returns empty when the model provides no variants', () => {
    expect(resolveDefaultVariant([], '')).toBe('')
    expect(resolveDefaultVariant([], 'low')).toBe('')
  })
})

function Harness({
  models,
  modelId,
  persisted,
  onPersist,
}: {
  models: { id: string; variants?: Record<string, Record<string, unknown>> }[]
  modelId: string
  persisted: string
  onPersist: (v: string) => void
}) {
  const [current, setCurrent] = useState(persisted)
  const { variantNames, activeVariant } = useReasoningVariant(
    models,
    modelId,
    current,
    (v) => {
      setCurrent(v)
      onPersist(v)
    }
  )
  return (
    <div>
      <span data-testid='names'>{variantNames.join(',')}</span>
      <span data-testid='active'>{activeVariant}</span>
    </div>
  )
}

describe('useReasoningVariant', () => {
  const models = [
    { id: 'm/a', variants: { low: {}, medium: {}, high: {} } },
    { id: 'm/b' },
  ]

  it('derives sorted names and persists the auto-default', async () => {
    const onPersist = vi.fn()
    const screen = await render(
      <Harness models={models} modelId='m/a' persisted='' onPersist={onPersist} />
    )
    await expect.element(screen.getByTestId('names')).toHaveTextContent(
      'high,low,medium'
    )
    await expect.element(screen.getByTestId('active')).toHaveTextContent('low')
    expect(onPersist).toHaveBeenCalledWith('low')
  })

  it('hides selection (empty names) for models without variants', async () => {
    const onPersist = vi.fn()
    const screen = await render(
      <Harness models={models} modelId='m/b' persisted='' onPersist={onPersist} />
    )
    await expect.element(screen.getByTestId('names')).toHaveTextContent('')
    await expect.element(screen.getByTestId('active')).toHaveTextContent('')
    expect(onPersist).not.toHaveBeenCalled()
  })

  it('keeps a still-valid persisted selection', async () => {
    const onPersist = vi.fn()
    const screen = await render(
      <Harness
        models={models}
        modelId='m/a'
        persisted='high'
        onPersist={onPersist}
      />
    )
    await expect.element(screen.getByTestId('active')).toHaveTextContent('high')
    expect(onPersist).not.toHaveBeenCalledWith('low')
  })
})
