/**
 * TASK-085 CORRECTIVE-6: Prove the modal state is set after a terminal modelError.
 * This test proves the store→modal chain: modelError received → modal open state set.
 */
import './refresh-feedback-test-setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOpenCodeStore } from './opencode-store'

const TEST_MODEL = {
  id: 'opencode/mimo-v2.5-free',
  provider: 'opencode',
  slug: 'mimo-v2.5-free',
  displayName: 'MiMo V2.5 Free',
  free: true,
  availability: 'available',
  latency: 'low',
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
  const chatId = 'chat-modal-test-1'
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
        title: 'Modal test',
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

afterEach(() => {
  vi.unstubAllGlobals()
  useOpenCodeStore.getState().clearLogs()
})

describe('providerErrorModal state propagation (TASK-085 CORRECTIVE-6)', () => {
  it('modelError with classification → providerErrorModal.open = true', async () => {
    seedConversation()
    stubChatStream([
      'error\ndata: {"message":"The provider is temporarily limiting requests","modelError":{"classification":"PROVIDER_TEMPORARILY_UNAVAILABLE","provider":"opencode","model":"opencode/mimo-v2.5-free","retryAfterSeconds":null}}',
    ])

    // Before send: modal should be closed
    expect(useOpenCodeStore.getState().providerErrorModal.open).toBe(false)

    await useOpenCodeStore.getState().sendMessage('hi', [])

    // After send: modal should be open
    const modal = useOpenCodeStore.getState().providerErrorModal
    expect(modal.open).toBe(true)
    expect(modal.classification).toBe('PROVIDER_TEMPORARILY_UNAVAILABLE')
    expect(modal.model).toBe('opencode/mimo-v2.5-free')
    expect(modal.provider).toBe('opencode')
    expect(modal.headline).toContain('temporarily unavailable')
    expect(modal.primaryLabel).toBe('Choose Another Model')
    expect(modal.secondaryLabel).toBe('Close')
  })

  it('FREE_MODEL_LIMIT_EXCEEDED → modal shows "Free model limit reached"', async () => {
    seedConversation()
    stubChatStream([
      'error\ndata: {"message":"Free model limit reached for opencode/mimo-v2.5-free","modelError":{"classification":"PAID_MODEL_USAGE_EXHAUSTED","provider":"opencode","model":"opencode/mimo-v2.5-free","retryAfterSeconds":null}}',
    ])

    await useOpenCodeStore.getState().sendMessage('hi', [])

    const modal = useOpenCodeStore.getState().providerErrorModal
    expect(modal.open).toBe(true)
    // PAID_MODEL_USAGE_EXHAUSTED + free model → FREE_MODEL_LIMIT_EXCEEDED
    expect(modal.classification).toBe('FREE_MODEL_LIMIT_EXCEEDED')
    expect(modal.headline).toContain('Free model limit reached')
    expect(modal.primaryLabel).toBe('Use Paid Model')
  })

  it('TASK-082B-R1: watchdog FREE silence chunk terminates Working with free-limit modal', async () => {
    const chatId = seedConversation()
    // Exactly what the corrected watchdog emits for a silent free-tier model:
    // FREE classification, watchdog watchdogMessage, no retry-after.
    stubChatStream([
      'error\ndata: {"message":"OpenCode produced no output for 60s and the provider did not respond. Try again or start a New Chat.","modelError":{"classification":"FREE_MODEL_LIMIT_EXCEEDED","provider":"opencode","model":"opencode/mimo-v2.5-free","retryAfterSeconds":null}}',
    ])

    await useOpenCodeStore.getState().sendMessage('hi', [])

    const s = useOpenCodeStore.getState()
    // Terminal-state integrity: Working ends, modal opens, history keeps error.
    expect(s.isStreaming).toBe(false)
    expect(s.providerErrorModal.open).toBe(true)
    expect(s.providerErrorModal.headline).toBe('Free model limit reached')
    expect(s.providerErrorModal.detail).toMatch(/choose another available model/i)
    const chat = s.chats.find((c) => c.id === chatId)
    const assistant = [...(chat?.messages ?? [])].reverse().find((m) => m.role === 'assistant')
    expect(assistant?.status).toBe('error')
    expect(String(assistant?.content ?? '')).toContain('Free model limit reached')
  })

  it('RATE_LIMITED → modal shows "Too many requests"', async () => {
    seedConversation()
    stubChatStream([
      'error\ndata: {"message":"Too many requests, retry after 30 seconds","modelError":{"classification":"RATE_LIMITED","provider":"opencode","model":"opencode/mimo-v2.5-free","retryAfterSeconds":30}}',
    ])

    await useOpenCodeStore.getState().sendMessage('hi', [])

    const modal = useOpenCodeStore.getState().providerErrorModal
    expect(modal.open).toBe(true)
    expect(modal.classification).toBe('RATE_LIMITED')
    expect(modal.headline).toContain('Too many requests')
    expect(modal.primaryLabel).toBe('Choose Another Model')
  })

  it('AUTHENTICATION_REQUIRED → modal shows "Provider connection required"', async () => {
    seedConversation()
    stubChatStream([
      'error\ndata: {"message":"Unauthorized","modelError":{"classification":"AUTHENTICATION_REQUIRED","provider":"opencode","model":"opencode/mimo-v2.5-free","retryAfterSeconds":null}}',
    ])

    await useOpenCodeStore.getState().sendMessage('hi', [])

    const modal = useOpenCodeStore.getState().providerErrorModal
    expect(modal.open).toBe(true)
    expect(modal.classification).toBe('AUTHENTICATION_REQUIRED')
    expect(modal.headline).toContain('connection required')
    expect(modal.primaryLabel).toBe('Reconnect')
  })

  it('setProviderErrorModalOpen(false) closes the modal', async () => {
    seedConversation()
    useOpenCodeStore.setState({
      providerErrorModal: {
        open: true,
        headline: 'Test',
        detail: 'Test detail',
        primaryLabel: 'OK',
        secondaryLabel: 'Close',
        classification: 'PROVIDER_ERROR',
        model: 'test',
        provider: 'test',
        errorKey: 'PROVIDER_ERROR|test|test',
      },
    })

    expect(useOpenCodeStore.getState().providerErrorModal.open).toBe(true)
    useOpenCodeStore.getState().setProviderErrorModalOpen(false)
    expect(useOpenCodeStore.getState().providerErrorModal.open).toBe(false)
    // TASK-085R3: closing records the dismissed key.
    expect(useOpenCodeStore.getState().dismissedProviderErrorKey).toBe(
      'PROVIDER_ERROR|test|test'
    )
  })

  it('duplicate terminal chunk in the same stream keeps a single modal', async () => {
    const errBlock =
      'error\ndata: {"message":"The provider cannot serve requests","modelError":{"classification":"PROVIDER_TEMPORARILY_UNAVAILABLE","provider":"opencode","model":"opencode/mimo-v2.5-free","retryAfterSeconds":null}}'
    seedConversation()
    stubChatStream([errBlock, errBlock])
    await useOpenCodeStore.getState().sendMessage('hi', [])
    const modal = useOpenCodeStore.getState().providerErrorModal
    expect(modal.open).toBe(true)
    expect(modal.classification).toBe('PROVIDER_TEMPORARILY_UNAVAILABLE')
    expect(modal.headline).toContain('temporarily unavailable')
  })

  it('a retried failing model re-arms reporting after dismissal', async () => {
    const errBlock =
      'error\ndata: {"message":"The provider cannot serve requests","modelError":{"classification":"PROVIDER_TEMPORARILY_UNAVAILABLE","provider":"opencode","model":"opencode/mimo-v2.5-free","retryAfterSeconds":null}}'
    seedConversation()
    stubChatStream([errBlock])
    await useOpenCodeStore.getState().sendMessage('hi', [])
    expect(useOpenCodeStore.getState().providerErrorModal.open).toBe(true)

    useOpenCodeStore.getState().setProviderErrorModalOpen(false)

    // New sendMessage clears the dismissed key, so the retry reopens.
    stubChatStream([errBlock])
    await useOpenCodeStore.getState().sendMessage('again', [])
    expect(useOpenCodeStore.getState().providerErrorModal.open).toBe(true)
  })

  it('non-modelError chunks do not open the modal', async () => {
    seedConversation()
    stubChatStream([
      'token\ndata: {"type":"text","text":"Hello!"}',
      'done\ndata: {"terminal":true}',
    ])

    await useOpenCodeStore.getState().sendMessage('hi', [])

    const modal = useOpenCodeStore.getState().providerErrorModal
    expect(modal.open).toBe(false)
  })
})
