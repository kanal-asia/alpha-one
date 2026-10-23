import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { SignOutDialog } from './sign-out-dialog'

const navigate = vi.fn()
const reset = vi.fn()
const setProductSessionToken = vi.fn()

const MOCK_HREF = 'https://app.test/dashboard?tab=1'

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    auth: { reset },
  }),
}))

vi.mock('@/features/ai/opencode/services/http-transport', () => ({
  setProductSessionToken,
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => navigate,
    useLocation: () => ({ href: MOCK_HREF }),
  }
})

describe('SignOutDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls auth.reset and navigates to sign-in with current location as redirect', async () => {
    const { getByRole } = await render(
      <SignOutDialog open onOpenChange={vi.fn()} />
    )

    await userEvent.click(getByRole('button', { name: /^Sign out$/i }))

    expect(reset).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith({
      to: '/sign-in',
      search: { redirect: MOCK_HREF },
      replace: true,
    })
  })

  it('clears the in-memory product session token on sign-out', async () => {
    const { getByRole } = await render(
      <SignOutDialog open onOpenChange={vi.fn()} />
    )

    await userEvent.click(getByRole('button', { name: /^Sign out$/i }))

    // TASK-ALPHA-SUBSCRIBER-013: logout must end the verified product
    // session. Without this, execution requests would stay authenticated as
    // the previous user after the auth store was reset.
    expect(setProductSessionToken).toHaveBeenCalledOnce()
    expect(setProductSessionToken).toHaveBeenCalledWith(null)
  })

  it('does not call reset or navigate when Cancel is clicked', async () => {
    const { getByRole } = await render(
      <SignOutDialog open onOpenChange={vi.fn()} />
    )

    await userEvent.click(getByRole('button', { name: /^Cancel$/i }))

    expect(reset).not.toHaveBeenCalled()
    expect(setProductSessionToken).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })
})
