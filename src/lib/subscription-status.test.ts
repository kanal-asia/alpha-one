/**
 * TASK-ALPHA-SUBSCRIBER-003: subscription plan-card view model.
 *
 * Pins the four UI states: loading wins, server default vs stored record
 * stay distinct, failures render as error (never fabricated plan data).
 * Pure function — runs in the node test project.
 */
import { describe, expect, it } from 'vitest'
import { toPlanCardModel } from './subscription-status'

describe('toPlanCardModel', () => {
  it('loading wins over any payload', () => {
    expect(
      toPlanCardModel({
        loading: true,
        status: { planId: 'pro', status: 'active', source: 'record', hasRecord: true },
        error: 'stale',
      })
    ).toEqual({ kind: 'loading' })
  })

  it('maps the server default to the default model', () => {
    expect(
      toPlanCardModel({
        loading: false,
        status: { planId: 'free', source: 'default', hasRecord: false },
        error: null,
      })
    ).toEqual({ kind: 'default', planId: 'free' })
  })

  it('maps a stored record with its lifecycle status', () => {
    expect(
      toPlanCardModel({
        loading: false,
        status: { planId: 'pro', status: 'past_due', source: 'record', hasRecord: true },
        error: null,
      })
    ).toEqual({ kind: 'record', planId: 'pro', status: 'past_due' })
  })

  it('defaults a record without status to active', () => {
    expect(
      toPlanCardModel({
        loading: false,
        status: { planId: 'member', source: 'record', hasRecord: true },
        error: null,
      })
    ).toEqual({ kind: 'record', planId: 'member', status: 'active' })
  })

  it('renders load failures as error, never as plan data', () => {
    expect(
      toPlanCardModel({ loading: false, status: null, error: 'boom' })
    ).toEqual({ kind: 'error', message: 'boom', code: null })
    expect(
      toPlanCardModel({ loading: false, status: null, error: null })
    ).toEqual({
      kind: 'error',
      message: 'Subscription status is unavailable.',
      code: null,
    })
  })

  it('carries the machine code so expired sessions are distinguishable', () => {
    expect(
      toPlanCardModel({
        loading: false,
        status: null,
        error: 'The provided credentials are invalid or expired.',
        code: 'AUTHENTICATION_EXPIRED',
      })
    ).toEqual({
      kind: 'error',
      message: 'The provided credentials are invalid or expired.',
      code: 'AUTHENTICATION_EXPIRED',
    })
    expect(
      toPlanCardModel({
        loading: false,
        status: null,
        error: 'The provided credentials are invalid or expired.',
        code: 'AUTHENTICATION_INVALID',
      })
    ).toEqual({
      kind: 'error',
      message: 'The provided credentials are invalid or expired.',
      code: 'AUTHENTICATION_INVALID',
    })
  })
})
