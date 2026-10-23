/**
 * TASK-ALPHA-SUBSCRIBER-008: warning-only entitlement observation tests.
 *
 * Pins the observation contract without touching generation: pure decision
 * matrix plus wrapper behavior (non-compose tools ignored, loader failures
 * swallowed, observation always allows). No database, no clockroller —
 * fixed NOW, stubbed deps.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  buildSlidesObservation,
  observeSlidesComposeUsage,
  type SlidesEntitlementSnapshot,
} from './entitlement'

const NOW = '2026-11-01T00:00:00.000Z'
const FUTURE_END = '2026-12-01T00:00:00.000Z'
const PAST_END = '2026-10-01T00:00:00.000Z'

const VERIFIED = { kind: 'verified', productUserId: 'sub-1', provider: 'google', verified: true } as const
const ANON = { kind: 'anonymous', productUserId: null, provider: null, verified: false } as const

function snapshot(
  overrides: Partial<SlidesEntitlementSnapshot> = {}
): SlidesEntitlementSnapshot {
  return {
    planId: 'pro',
    status: 'active',
    currentPeriodEnd: null,
    hasRecord: true,
    ...overrides,
  }
}

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 10))
}

describe('buildSlidesObservation', () => {
  it('ignores non-compose tools', () => {
    expect(
      buildSlidesObservation({
        tool: 'write',
        owner: 'sub-1',
        snapshot: snapshot(),
        now: NOW,
      })
    ).toBeNull()
    expect(
      buildSlidesObservation({
        tool: 'slides_get_presentation',
        owner: 'sub-1',
        snapshot: snapshot(),
        now: NOW,
      })
    ).toBeNull()
  })

  it('warns ANONYMOUS for both compose tools and always allows', () => {
    for (const tool of ['slides_compose_deck', 'slides_compose_slide']) {
      const obs = buildSlidesObservation({
        tool,
        owner: 'anonymous',
        snapshot: null,
        now: NOW,
      })
      expect(obs).toMatchObject({
        feature: 'slides.generate',
        tool,
        owner: 'anonymous',
        planId: 'free',
        decision: 'allow',
        warning: true,
        reason: 'ANONYMOUS',
      })
    }
  })

  it('does not warn for member/pro on active status', () => {
    for (const planId of ['member', 'pro', 'business']) {
      const obs = buildSlidesObservation({
        tool: 'slides_compose_deck',
        owner: 'sub-1',
        snapshot: snapshot({ planId, status: 'active' }),
        now: NOW,
      })
      expect(obs).toMatchObject({
        decision: 'allow',
        warning: false,
        reason: 'MEETS_PROVISIONAL_RULE',
      })
    }
  })

  it('does not warn for past_due (access continues)', () => {
    const obs = buildSlidesObservation({
      tool: 'slides_compose_slide',
      owner: 'sub-1',
      snapshot: snapshot({ planId: 'pro', status: 'past_due' }),
      now: NOW,
    })
    expect(obs?.warning).toBe(false)
    expect(obs?.decision).toBe('allow')
  })

  it('does not warn for canceled-with-valid-period (access continues)', () => {
    const obs = buildSlidesObservation({
      tool: 'slides_compose_deck',
      owner: 'sub-1',
      snapshot: snapshot({
        planId: 'pro',
        status: 'canceled',
        currentPeriodEnd: FUTURE_END,
      }),
      now: NOW,
    })
    expect(obs).toMatchObject({ decision: 'allow', warning: false })
  })

  it('warns BELOW_FUTURE_THRESHOLD for free plan', () => {
    const obs = buildSlidesObservation({
      tool: 'slides_compose_deck',
      owner: 'sub-1',
      snapshot: snapshot({ planId: 'free', status: null, currentPeriodEnd: null, hasRecord: false }),
      now: NOW,
    })
    expect(obs).toMatchObject({
      decision: 'allow',
      warning: true,
      reason: 'BELOW_FUTURE_THRESHOLD',
    })
  })

  it('warns for canceled past period end', () => {
    const obs = buildSlidesObservation({
      tool: 'slides_compose_slide',
      owner: 'sub-1',
      snapshot: snapshot({
        planId: 'pro',
        status: 'canceled',
        currentPeriodEnd: PAST_END,
      }),
      now: NOW,
    })
    expect(obs).toMatchObject({
      decision: 'allow',
      warning: true,
      reason: 'BELOW_FUTURE_THRESHOLD',
    })
  })

  it('warns PLAN_UNKNOWN for uncatalogued plans', () => {
    const obs = buildSlidesObservation({
      tool: 'slides_compose_deck',
      owner: 'sub-1',
      snapshot: snapshot({ planId: 'ultra', status: 'active' }),
      now: NOW,
    })
    expect(obs).toMatchObject({
      decision: 'allow',
      warning: true,
      reason: 'PLAN_UNKNOWN',
    })
  })
})

describe('observeSlidesComposeUsage', () => {
  it('ignores non-compose tools without touching deps', () => {
    const loadSnapshot = vi.fn()
    const emit = vi.fn()
    observeSlidesComposeUsage('write', VERIFIED, { loadSnapshot, emit })
    observeSlidesComposeUsage(undefined, VERIFIED, { loadSnapshot, emit })
    expect(loadSnapshot).not.toHaveBeenCalled()
    expect(emit).not.toHaveBeenCalled()
  })

  it('emits the observation for compose tools with verified owner', async () => {
    const loadSnapshot = vi.fn(async () => snapshot({ planId: 'free', status: null, currentPeriodEnd: null, hasRecord: false }))
    const emit = vi.fn()
    observeSlidesComposeUsage('slides_compose_deck', VERIFIED, {
      loadSnapshot,
      emit,
    })
    await flush()
    expect(loadSnapshot).toHaveBeenCalledWith('sub-1')
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit.mock.calls[0][0]).toMatchObject({
      feature: 'slides.generate',
      owner: 'sub-1',
      decision: 'allow',
      warning: true,
    })
  })

  it('records anonymous owner without identity linkage', async () => {
    const loadSnapshot = vi.fn(async () => null)
    const emit = vi.fn()
    observeSlidesComposeUsage('slides_compose_slide', ANON, {
      loadSnapshot,
      emit,
    })
    await flush()
    expect(loadSnapshot).toHaveBeenCalledWith(null)
    expect(emit.mock.calls[0][0]).toMatchObject({
      owner: 'anonymous',
      reason: 'ANONYMOUS',
    })
  })

  it('swallows loader failures without throwing or emitting', async () => {
    const loadSnapshot = vi.fn(async () => {
      throw new Error('db down')
    })
    const emit = vi.fn()
    expect(() =>
      observeSlidesComposeUsage('slides_compose_deck', VERIFIED, {
        loadSnapshot,
        emit,
      })
    ).not.toThrow()
    await flush()
    expect(emit).not.toHaveBeenCalled()
  })
})
