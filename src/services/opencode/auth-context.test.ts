/**
 * TASK-ALPHA-SUBSCRIPTION-002: trust-boundary security gate.
 *
 * Proves the execution identity contract without any provider credentials:
 * anonymous-by-default, fail-closed on unverifiable tokens, deny-by-default
 * under ALPHA_AUTH_ENFORCE=1, body-supplied identity ignored, verified
 * identity propagated, and no token material in any output.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractBearerToken,
  isAuthEnforced,
  requireVerifiedContext,
  resolveAuthContext,
  type TokenVerification,
} from './auth-context'

function stubVerifierOk(): (token: string) => TokenVerification {
  return (token: string) => {
    if (token !== 'real-provider-token') return { ok: false, reason: 'AUTHENTICATION_INVALID' }
    return { ok: true, productUserId: 'prod_user_123', provider: 'clerk' }
  }
}

function fakeRes(): { status: number; body: unknown; res: { status: (c: number) => { json: (b: unknown) => void } } } {
  const holder = { status: 0, body: null as unknown }
  return {
    get status() {
      return holder.status
    },
    get body() {
      return holder.body
    },
    res: {
      status: (c: number) => ({
        json: (b: unknown) => {
          holder.status = c
          holder.body = b
        },
      }),
    },
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('auth-context: anonymous by default', () => {
  it('no Authorization header resolves anonymous with no error', () => {
    const { context, error } = resolveAuthContext({})
    expect(error).toBeUndefined()
    expect(context).toEqual({ kind: 'anonymous', productUserId: null, provider: null, verified: false })
  })
  it('missing headers object resolves anonymous', () => {
    const { context } = resolveAuthContext(undefined)
    expect(context.verified).toBe(false)
    expect(context.productUserId).toBeNull()
  })
  it('malformed Authorization (no Bearer scheme) is treated as absent', () => {
    const { context, error } = resolveAuthContext({ authorization: 'Token abc123' })
    expect(error).toBeUndefined()
    expect(context.kind).toBe('anonymous')
  })
  it('extractBearerToken is case-insensitive on scheme and trims', () => {
    expect(extractBearerToken({ authorization: 'bearer xyz' })).toBe('xyz')
    expect(extractBearerToken({ Authorization: 'Bearer  xyz  ' })).toBe('xyz')
    expect(extractBearerToken({})).toBeNull()
  })
})

describe('auth-context: fail closed on unverifiable credentials', () => {
  it('presented token with unconfigured provider fails with AUTH_PROVIDER_NOT_CONFIGURED (503)', () => {
    const { context, error } = resolveAuthContext({ authorization: 'Bearer any-token' })
    expect(context.verified).toBe(false)
    expect(context.productUserId).toBeNull()
    expect(error?.code).toBe('AUTH_PROVIDER_NOT_CONFIGURED')
    expect(error?.status).toBe(503)
  })
  it('guard writes the failure response and refuses to proceed', () => {
    const f = fakeRes()
    const out = requireVerifiedContext({ headers: { authorization: 'Bearer any-token' } }, f.res)
    expect(out.ok).toBe(false)
    expect(f.status).toBe(503)
    expect(String((f.body as Record<string, unknown>)?.['code'])).toBe('AUTH_PROVIDER_NOT_CONFIGURED')
  })
  it('error responses never echo token material', () => {
    const f = fakeRes()
    requireVerifiedContext({ headers: { authorization: 'Bearer super-secret-token-value' } }, f.res)
    expect(JSON.stringify(f.body)).not.toContain('super-secret-token-value')
  })
})

describe('auth-context: enforced mode', () => {
  it('isAuthEnforced defaults off', () => {
    vi.stubEnv('ALPHA_AUTH_ENFORCE', '')
    expect(isAuthEnforced()).toBe(false)
  })
  it('anonymous is rejected with AUTHENTICATION_REQUIRED when enforced', () => {
    vi.stubEnv('ALPHA_AUTH_ENFORCE', '1')
    const f = fakeRes()
    const out = requireVerifiedContext({ headers: {} }, f.res)
    expect(out.ok).toBe(false)
    expect(f.status).toBe(401)
    expect(String((f.body as Record<string, unknown>)?.['code'])).toBe('AUTHENTICATION_REQUIRED')
  })
  it('anonymous passes through when not enforced (current default preserves local usage)', () => {
    vi.stubEnv('ALPHA_AUTH_ENFORCE', '')
    const f = fakeRes()
    const out = requireVerifiedContext({ headers: {} }, f.res)
    expect(out.ok).toBe(true)
    expect(out.context.kind).toBe('anonymous')
    expect(f.status).toBe(0)
  })
})

describe('auth-context: verified identity propagation + spoof resistance', () => {
  it('verified token resolves the canonical product identity', () => {
    const { context, error } = resolveAuthContext(
      { authorization: 'Bearer real-provider-token' },
      stubVerifierOk()
    )
    expect(error).toBeUndefined()
    expect(context).toEqual({ kind: 'verified', productUserId: 'prod_user_123', provider: 'clerk', verified: true })
  })
  it('frontend-supplied identity fields are ignored even when verified', () => {
    const { context } = resolveAuthContext(
      {
        authorization: 'Bearer real-provider-token',
        // Attacker-controlled decoys: must never become identity evidence.
        userId: 'attacker-chosen-id',
        email: 'victim@example.com',
        productUserId: 'attacker-chosen-id',
      },
      stubVerifierOk()
    )
    expect(context.productUserId).toBe('prod_user_123')
  })
  it('wrong token against the stub verifier is rejected as invalid (401)', () => {
    const f = fakeRes()
    const out = requireVerifiedContext(
      { headers: { authorization: 'Bearer forged-token' } },
      f.res,
      stubVerifierOk()
    )
    expect(out.ok).toBe(false)
    expect(f.status).toBe(401)
    expect(String((f.body as Record<string, unknown>)?.['code'])).toBe('AUTHENTICATION_INVALID')
  })
  it('guard passes the verified context through for downstream attribution', () => {
    const f = fakeRes()
    const out = requireVerifiedContext(
      { headers: { authorization: 'Bearer real-provider-token' } },
      f.res,
      stubVerifierOk()
    )
    expect(out.ok).toBe(true)
    expect(out.context.productUserId).toBe('prod_user_123')
    expect(f.status).toBe(0)
  })
})
