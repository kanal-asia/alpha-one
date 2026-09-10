/**
 * TASK-082B §13 cases 2/3/6 + §10: classified provider errors terminate
 * Working with an actionable warning (old behavior: indefinite Working or a
 * generic exit-code message with no quota signal).
 *
 * Technique mirrors opencode-runtime-health.test.ts: stub fetch, seed store
 * state directly, drive sendMessage through a scripted SSE stream.
 */
import './refresh-feedback-test-setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOpenCodeStore } from './opencode-store'

const FREE_MODEL = {
  id: 'opencode/muse-spark-1.3-contributor-free',
  provider: 'opencode',
  slug: 'muse-spark-1.3-contributor-free',
  displayName: 'Muse Spark 1.3 Free',
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
  const chatId = 'chat-model-error-1'
  useOpenCodeStore.setState({
    models: [FREE_MODEL as never],
    modes: [],
    modelsLoaded: true,
    isStreaming: false,
    abortController: null,
    chats: [
      {
        id: chatId,
        title: 'Quota case',
        messages: [],
        project: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as never,
    ],
    activeChatId: chatId,
    settings: {
      ...useOpenCodeStore.getState().settings,
      defaultModel: FREE_MODEL.id,
      defaultMode: 'build',
      defaultVariant: '',
    },
    session: { id: '', workspacePath: '', state: 'running', startedAt: new Date().toISOString() },
  })
  return chatId
}

function lastAssistant(chatId: string): { status: string; content: string } {
  const chat = useOpenCodeStore.getState().chats.find((c) => c.id === chatId)
  const msg = [...(chat?.messages ?? [])].reverse().find((m) => m.role === 'assistant')
  return { status: String(msg?.status ?? ''), content: String(msg?.content ?? '') }
}

function logMessages(): string[] {
  return useOpenCodeStore.getState().logs.map((l) => l.message)
}

afterEach(() => {
  vi.unstubAllGlobals()
  useOpenCodeStore.getState().clearLogs()
})

describe('classified provider errors terminate Working (§10, cases 2/3/4/6)', () => {
  it('quota error event → Working ends, free-limit warning shown, model preserved', async () => {
    const chatId = seedConversation()
    stubChatStream([
      'error\ndata: {"message":"Free model limit reached for opencode/muse-spark-1.3-contributor-free","modelError":{"classification":"PAID_MODEL_USAGE_EXHAUSTED","provider":"opencode","model":"opencode/muse-spark-1.3-contributor-free","retryAfterSeconds":null}}',
    ])
    await useOpenCodeStore.getState().sendMessage('hi', [])

    const s = useOpenCodeStore.getState()
    expect(s.isStreaming).toBe(false)
    const msg = lastAssistant(chatId)
    expect(msg.status).toBe('error')
    // Store re-splits paid→free via the selected model's free flag.
    expect(msg.content).toContain('Free model limit reached')
    expect(msg.content).toContain('Muse Spark 1.3 Free')
    expect(logMessages().some((m) => m.includes('[MODEL_ERROR]') && m.includes('FREE_MODEL_LIMIT_EXCEEDED'))).toBe(true)
  })

  it('rate-limit event → distinct warning, no exhaustion claim', async () => {
    const chatId = seedConversation()
    stubChatStream([
      'error\ndata: {"message":"Too many requests, retry after 20 seconds","modelError":{"classification":"RATE_LIMITED","provider":"opencode","model":"opencode/muse-spark-1.3-contributor-free","retryAfterSeconds":20}}',
    ])
    await useOpenCodeStore.getState().sendMessage('hi', [])

    expect(useOpenCodeStore.getState().isStreaming).toBe(false)
    const msg = lastAssistant(chatId)
    expect(msg.status).toBe('error')
    expect(msg.content).toContain('rate-limited')
    expect(msg.content).toMatch(/another model/i)
    expect(msg.content).toContain('20')
  })

  it('unclassified error keeps legacy generic behavior (no false quota)', async () => {
    const chatId = seedConversation()
    stubChatStream(['error\ndata: {"message":"Something broke"}'])
    await useOpenCodeStore.getState().sendMessage('hi', [])

    expect(useOpenCodeStore.getState().isStreaming).toBe(false)
    const msg = lastAssistant(chatId)
    expect(msg.status).toBe('error')
    expect(msg.content).toBe('Something broke')
    expect(logMessages().some((m) => m.includes('[MODEL_ERROR]'))).toBe(false)
  })

  it('user can send again immediately after a quota error (session not stuck busy)', async () => {
    const chatId = seedConversation()
    stubChatStream([
      'error\ndata: {"message":"quota exceeded","modelError":{"classification":"PAID_MODEL_USAGE_EXHAUSTED","provider":"opencode","model":"opencode/muse-spark-1.3-contributor-free","retryAfterSeconds":null}}',
    ])
    await useOpenCodeStore.getState().sendMessage('first', [])
    expect(useOpenCodeStore.getState().isStreaming).toBe(false)

    stubChatStream([
      'token\ndata: {"type":"text","text":"second reply"}',
      'done\ndata: {"terminal":true}',
    ])
    await useOpenCodeStore.getState().sendMessage('second', [])
    const chat = useOpenCodeStore.getState().chats.find((c) => c.id === chatId)
    expect(chat?.messages.length).toBeGreaterThan(2)
  })
})
