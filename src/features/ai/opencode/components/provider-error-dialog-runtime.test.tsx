/**
 * TASK-085R3 Phase 7 — runtime-path proof (NOT an isolated component test).
 *
 * Exercises the production path end to end:
 *   stubbed SSE modelError chunk (as the real watchdog emits)
 *   → http-transport → production store sendMessage handler
 *   → providerErrorModal state → mounted ProviderErrorModal (AlertDialog)
 *   → visible overlay + card + title + detail + CTAs in the DOM.
 *
 * Covers all six terminal classifications, dedup semantics, dismissal
 * (Close / Esc / X), real CTA targets, inline-history retention, and the
 * healthy-response negative case.
 */
import '@/styles/index.css'
import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { render, cleanup } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { toast } from 'sonner'
import { useOpenCodeStore } from '../store/opencode-store'
import {
  OPEN_MODEL_PICKER_EVENT,
  OPEN_PROVIDER_CONNECT_EVENT,
  ProviderErrorModal,
  primaryTargetFor,
} from './provider-error-modal'
import '../store/refresh-feedback-test-setup'

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() },
}))

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...actual, useNavigate: () => navigateMock }
})

const TEST_MODEL = {
  id: 'opencode/mimo-v2.5-free',
  provider: 'opencode',
  slug: 'mimo-v2.5-free',
  displayName: 'MiMo V2.5 Free',
  free: true,
  availability: 'available',
  latency: 'low',
}

const PAID_TEST_MODEL = {
  ...TEST_MODEL,
  id: 'opencode/mimo-v2.5-paid',
  slug: 'mimo-v2.5-paid',
  displayName: 'MiMo V2.5 Paid',
  free: false,
}

/** The store re-splits PAID exhaustion to FREE for free models (taxonomy rule),
 *  so paid-exhaustion cases must run against a paid model. */
function usePaidModel(): void {
  useOpenCodeStore.setState({
    models: [PAID_TEST_MODEL as never],
    settings: {
      ...useOpenCodeStore.getState().settings,
      defaultModel: PAID_TEST_MODEL.id,
    },
  })
}

function sseStream(blocks: string[]): unknown {
  const enc = new TextEncoder()
  const payload = blocks.map((b) => `event: ${b}\n\n`).join('')
  return {
    ok: true,
    body: {
      getReader() {
        let sent = false
        return {
          async read() {
            if (sent) return { done: true, value: undefined }
            sent = true
            return { done: false, value: enc.encode(payload) }
          },
        }
      },
    },
  }
}

function stubChatStream(blocks: string[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/chat/stream')) return sseStream(blocks)
      return { ok: false, json: async () => ({}) }
    })
  )
}

function seedConversation(): string {
  const chatId = 'chat-runtime-dialog-1'
  useOpenCodeStore.setState({
    models: [TEST_MODEL as never],
    modes: [],
    modelsLoaded: true,
    isStreaming: false,
    abortController: null,
    providerErrorModal: {
      open: false,
      headline: '',
      detail: '',
      primaryLabel: '',
      secondaryLabel: '',
      classification: null,
      model: null,
      provider: null,
      errorKey: null,
    },
    dismissedProviderErrorKey: null,
    chats: [
      {
        id: chatId,
        title: 'Runtime dialog test',
        messages: [],
        project: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as never,
    ],
    activeChatId: chatId,
    settings: {
      ...useOpenCodeStore.getState().settings,
      defaultModel: TEST_MODEL.id,
      defaultMode: 'build',
      defaultVariant: '',
    },
    session: { id: '', workspacePath: '', state: 'running', startedAt: new Date().toISOString() },
  })
  return chatId
}

function errorBlock(classification: string, message: string, model = TEST_MODEL.id): string {
  return `error\ndata: ${JSON.stringify({
    message,
    modelError: {
      classification,
      provider: 'opencode',
      model,
      retryAfterSeconds: null,
    },
  })}`
}

function dialogEls() {
  return {
    dialogs: Array.from(document.querySelectorAll('[role="alertdialog"]')),
    overlay: document.querySelector('[data-slot="alert-dialog-overlay"]'),
    title: document.querySelector('[data-slot="alert-dialog-title"]'),
    detail: document.querySelector('[data-slot="alert-dialog-description"]'),
    buttons: Array.from(document.querySelectorAll('[role="alertdialog"] button')).map(
      (b) => b.textContent?.trim() ?? ''
    ),
    closeX: document.querySelector('[aria-label="Close dialog"]'),
  }
}

async function waitForDialog(): Promise<void> {
  await vi.waitFor(() => {
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
  })
}

beforeEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  navigateMock.mockClear()
  vi.mocked(toast.warning).mockClear()
  vi.mocked(toast.error).mockClear()
  seedConversation()
})

afterEach(() => {
  vi.unstubAllGlobals()
  useOpenCodeStore.getState().clearLogs()
})

describe('runtime path: terminal modelError → visible AlertDialog (TASK-085R3)', () => {
  it('PROVIDER_TEMPORARILY_UNAVAILABLE opens dialog with overlay, card, CTA', async () => {
    stubChatStream([
      errorBlock(
        'PROVIDER_TEMPORARILY_UNAVAILABLE',
        'OpenCode produced no output for 60s and the provider did not respond.'
      ),
    ])
    render(<ProviderErrorModal />)
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()

    await useOpenCodeStore.getState().sendMessage('hi', [])
    await waitForDialog()

    const els = dialogEls()
    expect(els.dialogs).toHaveLength(1)
    expect(els.overlay).not.toBeNull()
    expect(els.title?.textContent).toContain('Model temporarily unavailable')
    expect(els.detail?.textContent).toContain("isn't responding")
    expect(els.buttons).toContain('Choose Another Model')
    expect(els.buttons).toContain('Close')
    expect(els.closeX).not.toBeNull()
    // No duplicate blocking toast for the same terminal error.
    expect(toast.warning).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    // Working terminated.
    expect(useOpenCodeStore.getState().isStreaming).toBe(false)
  })

  it.each([
    ['FREE_MODEL_LIMIT_EXCEEDED', 'Free model limit reached', 'Use Paid Model'],
    ['PAID_MODEL_USAGE_EXHAUSTED', 'Paid model usage limit reached', 'Check Billing'],
    ['RATE_LIMITED', 'Too many requests', 'Choose Another Model'],
    ['AUTHENTICATION_REQUIRED', 'Provider connection required', 'Reconnect'],
    ['PROVIDER_ERROR', 'Model request failed', 'Choose Another Model'],
  ])('%s renders headline %s with primary CTA %s', async (classification, headline, cta) => {
    const paid = classification === 'PAID_MODEL_USAGE_EXHAUSTED'
    if (paid) usePaidModel()
    stubChatStream([
      errorBlock(classification, `failure for ${classification}`, paid ? PAID_TEST_MODEL.id : TEST_MODEL.id),
    ])
    render(<ProviderErrorModal />)
    await useOpenCodeStore.getState().sendMessage('hi', [])
    await waitForDialog()

    const els = dialogEls()
    expect(els.dialogs).toHaveLength(1)
    expect(els.title?.textContent).toContain(headline)
    expect(els.buttons).toContain(cta)
  })

  it('duplicate terminal chunks in one stream yield exactly one dialog', async () => {
    const block = errorBlock('RATE_LIMITED', 'Too many requests')
    stubChatStream([block, block])
    render(<ProviderErrorModal />)
    await useOpenCodeStore.getState().sendMessage('hi', [])
    await waitForDialog()

    expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1)
  })

  it('Close dismisses and inline error remains in history', async () => {
    const chatId = 'chat-runtime-dialog-1'
    stubChatStream([errorBlock('PROVIDER_TEMPORARILY_UNAVAILABLE', 'no output for 60s')])
    render(<ProviderErrorModal />)
    await useOpenCodeStore.getState().sendMessage('hi', [])
    await waitForDialog()

    const user = userEvent.setup()
    const closeBtn = Array.from(
      document.querySelectorAll('[role="alertdialog"] button')
    ).find((b) => b.textContent?.trim() === 'Close')
    expect(closeBtn).toBeDefined()
    await user.click(closeBtn as HTMLElement)
    await vi.waitFor(() => {
      expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    })

    const chat = useOpenCodeStore.getState().chats.find((c) => c.id === chatId)
    const assistant = [...(chat?.messages ?? [])]
      .reverse()
      .find((m) => m.role === 'assistant')
    expect(assistant?.status).toBe('error')
    expect(String(assistant?.content ?? '')).toContain('Model temporarily unavailable')
  })

  it('Esc dismisses the dialog', async () => {
    stubChatStream([errorBlock('PROVIDER_TEMPORARILY_UNAVAILABLE', 'no output for 60s')])
    render(<ProviderErrorModal />)
    await useOpenCodeStore.getState().sendMessage('hi', [])
    await waitForDialog()

    const user = userEvent.setup()
    await user.keyboard('{Escape}')
    await vi.waitFor(() => {
      expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    })
  })

  it('X dismisses the dialog', async () => {
    stubChatStream([errorBlock('PROVIDER_TEMPORARILY_UNAVAILABLE', 'no output for 60s')])
    render(<ProviderErrorModal />)
    await useOpenCodeStore.getState().sendMessage('hi', [])
    await waitForDialog()

    const user = userEvent.setup()
    const x = document.querySelector('[aria-label="Close dialog"]')
    expect(x).not.toBeNull()
    await user.click(x as HTMLElement)
    await vi.waitFor(() => {
      expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    })
  })

  it('Choose Another Model dispatches the real model-picker event', async () => {
    stubChatStream([errorBlock('PROVIDER_TEMPORARILY_UNAVAILABLE', 'no output for 60s')])
    render(<ProviderErrorModal />)
    await useOpenCodeStore.getState().sendMessage('hi', [])
    await waitForDialog()

    const seen: string[] = []
    const listener = () => seen.push(OPEN_MODEL_PICKER_EVENT)
    window.addEventListener(OPEN_MODEL_PICKER_EVENT, listener)
    try {
      const user = userEvent.setup()
      const primary = Array.from(
        document.querySelectorAll('[role="alertdialog"] button')
      ).find((b) => b.textContent?.trim() === 'Choose Another Model')
      await user.click(primary as HTMLElement)
      expect(seen).toContain(OPEN_MODEL_PICKER_EVENT)
      await vi.waitFor(() => {
        expect(document.querySelector('[role="alertdialog"]')).toBeNull()
      })
    } finally {
      window.removeEventListener(OPEN_MODEL_PICKER_EVENT, listener)
    }
  })

  it('Reconnect dispatches the real provider-connect event', async () => {
    stubChatStream([errorBlock('AUTHENTICATION_REQUIRED', 'Unauthorized')])
    render(<ProviderErrorModal />)
    await useOpenCodeStore.getState().sendMessage('hi', [])
    await waitForDialog()

    const seen: string[] = []
    const listener = () => seen.push(OPEN_PROVIDER_CONNECT_EVENT)
    window.addEventListener(OPEN_PROVIDER_CONNECT_EVENT, listener)
    try {
      const user = userEvent.setup()
      const primary = Array.from(
        document.querySelectorAll('[role="alertdialog"] button')
      ).find((b) => b.textContent?.trim() === 'Reconnect')
      await user.click(primary as HTMLElement)
      expect(seen).toContain(OPEN_PROVIDER_CONNECT_EVENT)
    } finally {
      window.removeEventListener(OPEN_PROVIDER_CONNECT_EVENT, listener)
    }
  })

  it('Check Billing navigates to the provider/account settings surface', async () => {
    usePaidModel()
    stubChatStream([errorBlock('PAID_MODEL_USAGE_EXHAUSTED', 'quota exhausted', PAID_TEST_MODEL.id)])
    render(<ProviderErrorModal />)
    await useOpenCodeStore.getState().sendMessage('hi', [])
    await waitForDialog()

    const user = userEvent.setup()
    const primary = Array.from(
      document.querySelectorAll('[role="alertdialog"] button')
    ).find((b) => b.textContent?.trim() === 'Check Billing')
    await user.click(primary as HTMLElement)
    expect(navigateMock).toHaveBeenCalledWith({ to: '/ai/opencode/settings' })
  })

  it('primaryTargetFor routes every class without inventing destinations', () => {
    expect(primaryTargetFor('AUTHENTICATION_REQUIRED')).toBe('open-provider-connect')
    expect(primaryTargetFor('PAID_MODEL_USAGE_EXHAUSTED')).toBe('open-billing-settings')
    expect(primaryTargetFor('FREE_MODEL_LIMIT_EXCEEDED')).toBe('open-model-picker')
    expect(primaryTargetFor('RATE_LIMITED')).toBe('open-model-picker')
    expect(primaryTargetFor('PROVIDER_TEMPORARILY_UNAVAILABLE')).toBe('open-model-picker')
    expect(primaryTargetFor('PROVIDER_ERROR')).toBe('open-model-picker')
    expect(primaryTargetFor(null)).toBe('open-model-picker')
  })

  it('healthy model response opens no dialog', async () => {
    stubChatStream([
      'token\ndata: {"type":"text","text":"Hi! What can I help you with?"}',
      'done\ndata: {"terminal":true}',
    ])
    render(<ProviderErrorModal />)
    await useOpenCodeStore.getState().sendMessage('hi', [])
    await new Promise((r) => setTimeout(r, 250))
    expect(document.querySelector('[role="alertdialog"]')).toBeNull()
  })
})
