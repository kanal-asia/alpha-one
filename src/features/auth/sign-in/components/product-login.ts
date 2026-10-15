/**
 * TASK-ALPHA-SUBSCRIPTION-002A: product-login client.
 *
 * Drives the Google OpenID Connect product-login flow from the SPA:
 * start (POST /login → redirect to Google) and complete (POST
 * /login/complete with the one-time code from the callback redirect).
 *
 * Conventions follow google-connection-card.tsx: relative `/api/...` fetch,
 * `URLSearchParams(window.location.search)` for return flags, and
 * `history.replaceState` cleanup. The verified ID token is held via
 * setProductSessionToken (memory) for execution-request Authorization
 * headers — never written to localStorage, and never confused with the
 * legacy mock access token.
 */
import { useAuthStore } from '@/stores/auth-store'
import { setProductSessionToken } from '@/features/ai/opencode/services/http-transport'

export interface ProductLoginIdentity {
  productUserId: string
  email: string | null
  name: string | null
  picture: string | null
}

export async function startProductLogin(): Promise<void> {
  const res = await fetch('/api/google/oauth/login', { method: 'POST' })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? 'Product login is unavailable right now.')
  }
  const { url } = (await res.json()) as { url?: string }
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('Product login is unavailable right now.')
  }
  window.location.href = url
}

export async function completeProductLogin(code: string): Promise<ProductLoginIdentity> {
  const res = await fetch('/api/google/oauth/login/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? 'Product login could not be completed.')
  }
  const data = (await res.json()) as {
    identity: ProductLoginIdentity
    idToken: string
    expiresIn: number
  }
  if (!data.identity?.productUserId || typeof data.idToken !== 'string') {
    throw new Error('Product login could not be completed.')
  }
  // Attach the verified ID token to execution requests (memory only).
  setProductSessionToken(data.idToken)
  // Record the verified product identity in the auth store. accountNo is
  // the canonical product user id (verified Google `sub`) — never an email.
  const auth = useAuthStore.getState().auth
  auth.setUser({
    accountNo: data.identity.productUserId,
    email: data.identity.email ?? 'google-user',
    role: ['user'],
    exp: Date.now() + Math.max(60, data.expiresIn || 3600) * 1000,
  })
  return data.identity
}

/** Read and clear the product-login return flags from the callback redirect. */
export function consumeProductLoginReturn(): { code: string | null; error: string | null } {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('product_login')
  const error = params.get('product_login_error')
  if (code !== null || error !== null) {
    window.history.replaceState({}, '', window.location.pathname)
  }
  return { code, error }
}
