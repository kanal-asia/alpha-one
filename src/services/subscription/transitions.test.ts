/**
 * TASK-ALPHA-SUBSCRIBER-007: transition validator contract tests.
 *
 * Pins every approved legal transition, representative illegal transitions,
 * unknown states, period-end boundaries (before / exactly at / after), and
 * missing/malformed period handling — plus the effective-access fail-safe.
 * Pure module: no database, no clock (fixed NOW), fully deterministic.
 */
import { describe, expect, it } from 'vitest'
import {
  effectiveAccess,
  transitionSubscription,
} from './transitions'

const NOW = '2026-11-01T00:00:00.000Z'
const FUTURE_END = '2026-12-01T00:00:00.000Z'
const PAST_END = '2026-10-01T00:00:00.000Z'

describe('transitionSubscription: legal transitions', () => {
  it('none → active creates the active state', () => {
    expect(
      transitionSubscription({ from: 'none', to: 'active', now: NOW })
    ).toEqual({ ok: true, patch: { status: 'active' } })
  })

  it('active → past_due preserves the period view', () => {
    expect(
      transitionSubscription({ from: 'active', to: 'past_due', now: NOW })
    ).toEqual({ ok: true, patch: { status: 'past_due' } })
  })

  it('past_due → active recovers', () => {
    expect(
      transitionSubscription({ from: 'past_due', to: 'active', now: NOW })
    ).toEqual({ ok: true, patch: { status: 'active' } })
  })

  it('past_due → expired lapses', () => {
    expect(
      transitionSubscription({ from: 'past_due', to: 'expired', now: NOW })
    ).toEqual({ ok: true, patch: { status: 'expired' } })
  })

  it('active → canceled stamps the period and cancellation time', () => {
    expect(
      transitionSubscription({
        from: 'active',
        to: 'canceled',
        now: NOW,
        periodEnd: FUTURE_END,
      })
    ).toEqual({
      ok: true,
      patch: {
        status: 'canceled',
        currentPeriodEnd: FUTURE_END,
        cancelAtPeriodEnd: true,
        canceledAt: NOW,
      },
    })
  })

  it('past_due → canceled is legal (approved) and stamps the period', () => {
    const result = transitionSubscription({
      from: 'past_due',
      to: 'canceled',
      now: NOW,
      record: { currentPeriodEnd: FUTURE_END },
    })
    expect(result).toEqual({
      ok: true,
      patch: {
        status: 'canceled',
        currentPeriodEnd: FUTURE_END,
        cancelAtPeriodEnd: true,
        canceledAt: NOW,
      },
    })
  })

  it('canceled → expired lapses the paid period', () => {
    expect(
      transitionSubscription({ from: 'canceled', to: 'expired', now: NOW })
    ).toEqual({ ok: true, patch: { status: 'expired' } })
  })

  it('canceled → active clears cancellation fields', () => {
    expect(
      transitionSubscription({
        from: 'canceled',
        to: 'active',
        now: NOW,
        record: { currentPeriodEnd: PAST_END },
      })
    ).toEqual({
      ok: true,
      patch: {
        status: 'active',
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    })
  })

  it('expired → active starts a new subscription and clears flags', () => {
    expect(
      transitionSubscription({ from: 'expired', to: 'active', now: NOW })
    ).toEqual({
      ok: true,
      patch: {
        status: 'active',
        cancelAtPeriodEnd: false,
        canceledAt: null,
      },
    })
  })
})

describe('transitionSubscription: illegal transitions and unknown states', () => {
  const cases: Array<[from: string, to: string]> = [
    ['active', 'expired'],
    ['expired', 'past_due'],
    ['expired', 'canceled'],
    ['canceled', 'past_due'],
    ['none', 'canceled'],
    ['none', 'past_due'],
    ['none', 'expired'],
    ['active', 'active'],
  ]
  for (const [from, to] of cases) {
    it(`${from} → ${to} is rejected`, () => {
      expect(
        transitionSubscription({
          from: from as 'active',
          to: to as 'active',
          now: NOW,
        })
      ).toEqual({ ok: false, code: 'ILLEGAL_TRANSITION' })
    })
  }

  it('unknown target state is rejected', () => {
    expect(
      transitionSubscription({
        from: 'active',
        to: 'suspended' as 'active',
        now: NOW,
      })
    ).toEqual({ ok: false, code: 'UNKNOWN_STATE' })
  })

  it('unknown source state is rejected', () => {
    expect(
      transitionSubscription({
        from: 'trial' as 'none',
        to: 'active',
        now: NOW,
      })
    ).toEqual({ ok: false, code: 'UNKNOWN_STATE' })
  })
})

describe('transitionSubscription: period requirements', () => {
  it('into canceled without any period is PERIOD_REQUIRED, never invented', () => {
    expect(
      transitionSubscription({ from: 'active', to: 'canceled', now: NOW })
    ).toEqual({ ok: false, code: 'PERIOD_REQUIRED' })
    expect(
      transitionSubscription({
        from: 'active',
        to: 'canceled',
        now: NOW,
        record: { currentPeriodEnd: null },
      })
    ).toEqual({ ok: false, code: 'PERIOD_REQUIRED' })
  })

  it('into canceled with a malformed period is PERIOD_MALFORMED', () => {
    expect(
      transitionSubscription({
        from: 'active',
        to: 'canceled',
        now: NOW,
        periodEnd: 'not-a-date',
      })
    ).toEqual({ ok: false, code: 'PERIOD_MALFORMED' })
  })

  it('malformed evaluation instant is PERIOD_MALFORMED', () => {
    expect(
      transitionSubscription({ from: 'active', to: 'past_due', now: 'whenever' })
    ).toEqual({ ok: false, code: 'PERIOD_MALFORMED' })
  })
})

describe('effectiveAccess: approved access rules', () => {
  it('no row means Free without repair', () => {
    expect(effectiveAccess(null, NOW)).toEqual({
      access: 'free',
      warning: false,
      repair: false,
    })
  })

  it('active means plan access', () => {
    expect(
      effectiveAccess({ status: 'active', currentPeriodEnd: null }, NOW)
    ).toEqual({ access: 'plan', warning: false, repair: false })
  })

  it('past_due means plan access with warning', () => {
    expect(
      effectiveAccess({ status: 'past_due', currentPeriodEnd: null }, NOW)
    ).toEqual({ access: 'plan', warning: true, repair: false })
  })

  it('expired means Free', () => {
    expect(
      effectiveAccess({ status: 'expired', currentPeriodEnd: FUTURE_END }, NOW)
    ).toEqual({ access: 'free', warning: false, repair: false })
  })

  it('canceled before period end keeps plan access', () => {
    expect(
      effectiveAccess(
        { status: 'canceled', currentPeriodEnd: FUTURE_END },
        NOW
      )
    ).toEqual({ access: 'plan', warning: false, repair: false })
  })

  it('canceled exactly at period end loses access (now < end is strict)', () => {
    expect(
      effectiveAccess({ status: 'canceled', currentPeriodEnd: NOW }, NOW)
    ).toEqual({ access: 'free', warning: false, repair: false })
  })

  it('canceled after period end loses access', () => {
    expect(
      effectiveAccess({ status: 'canceled', currentPeriodEnd: PAST_END }, NOW)
    ).toEqual({ access: 'free', warning: false, repair: false })
  })

  it('canceled with missing period fails safe to Free with repair signal', () => {
    expect(
      effectiveAccess({ status: 'canceled', currentPeriodEnd: null }, NOW)
    ).toEqual({ access: 'free', warning: false, repair: true })
  })

  it('canceled with malformed period fails safe to Free with repair signal', () => {
    expect(
      effectiveAccess(
        { status: 'canceled', currentPeriodEnd: 'someday' },
        NOW
      )
    ).toEqual({ access: 'free', warning: false, repair: true })
  })

  it('unknown stored status fails closed with repair signal', () => {
    expect(
      effectiveAccess({ status: 'suspended', currentPeriodEnd: null }, NOW)
    ).toEqual({ access: 'free', warning: false, repair: true })
  })
})
