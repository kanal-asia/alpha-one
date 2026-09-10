/**
 * TASK-085 CORRECTIVE: fresh chats must never inherit a stale OpenCode session.
 *
 * PROVEN DEFECT (staging, Phase 14 re-run): two genuinely fresh Alpha chats
 * both reused ses_f795682beefe12HpWwDIOSklx1 and hit the 60s quiet watchdog.
 * A message-less chat must always start session-less, and New Chat must abort
 * in-flight generation so a stuck run cannot leak into the next chat.
 */
import './refresh-feedback-test-setup'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useOpenCodeStore } from './opencode-store'

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

function seedFreshChat(): string {
  const chatId = 'chat-fresh-a'
  useOpenCodeStore.setState({
    models: [],
    modes: [],
    modelsLoaded: true,
    isStreaming: false,
    abortController: null,
    chats: [
      {
        id: chatId,
        title: 'New Chat',
        messages: [],
        // A stale sessionId persisted/restored onto a message-less chat —
        // exactly the corruption the corrective guards against.
        sessionId: 'ses_STALE_DEADBEEF',
        project: undefined,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } as never,
    ],
    activeChatId: chatId,
    settings: {
      ...useOpenCodeStore.getState().settings,
      defaultModel: 'opencode/mimo-v2.5-free',
      defaultMode: 'build',
      defaultVariant: '',
    },
    session: { id: '', workspacePath: '', state: 'running', startedAt: new Date().toISOString() },
  })
  return chatId
}

function logMessages(): string[] {
  return useOpenCodeStore.getState().logs.map((l) => l.message)
}

afterEach(() => {
  vi.unstubAllGlobals()
  useOpenCodeStore.getState().clearLogs()
})

describe('fresh-session isolation (TASK-085 corrective)', () => {
  it('message-less chat with a stale sessionId sends session-less (CREATE, not REUSE)', async () => {
    const chatId = seedFreshChat()
    const seenBodies: Array<Record<string, unknown>> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/chat/stream')) {
          try {
            seenBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
          } catch {
            /* ignore */
          }
          return sseStream([
            'session\ndata: {"sessionId":"ses_FRESH_LIVE"}',
            'done\ndata: {"terminal":true}',
          ])
        }
        return { ok: false, json: async () => ({}) }
      })
    )
    await useOpenCodeStore.getState().sendMessage('hello', [])

    // The stale session must NOT appear on the wire.
    const sentSessionIds = seenBodies.map((b) => (b as Record<string, unknown>).sessionId ?? null)
    expect(sentSessionIds.length).toBeGreaterThan(0)
    for (const sid of sentSessionIds) {
      expect(sid == null || sid === '').toBe(true)
    }
    // And the log must show CREATE (fresh), never REUSE of the stale id.
    expect(logMessages().some((m) => m.includes('[SESSION] CREATE') && m.includes(chatId))).toBe(true)
    expect(logMessages().some((m) => m.includes('ses_STALE_DEADBEEF'))).toBe(false)
    // The live session returned by the run is adopted normally.
    const chat = useOpenCodeStore.getState().chats.find((c) => c.id === chatId)
    expect(chat?.sessionId).toBe('ses_FRESH_LIVE')
  })

  it('second prompt on the now-established chat reuses the live session', async () => {
    seedFreshChat()
    const seenBodies: Array<Record<string, unknown>> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/chat/stream')) {
          try {
            seenBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
          } catch {
            /* ignore */
          }
          return sseStream([
            'session\ndata: {"sessionId":"ses_FRESH_LIVE"}',
            'done\ndata: {"terminal":true}',
          ])
        }
        return { ok: false, json: async () => ({}) }
      })
    )
    await useOpenCodeStore.getState().sendMessage('first', [])
    await useOpenCodeStore.getState().sendMessage('second', [])

    const second = seenBodies[seenBodies.length - 1] as Record<string, unknown>
    expect(second.sessionId).toBe('ses_FRESH_LIVE')
  })

  it('two New Chats never share a session: second chat starts session-less', async () => {
    seedFreshChat()
    const seenBodies: Array<Record<string, unknown>> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/chat/stream')) {
          try {
            seenBodies.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>)
          } catch {
            /* ignore */
          }
          return sseStream(['done\ndata: {"terminal":true}'])
        }
        return { ok: false, json: async () => ({}) }
      })
    )
    await useOpenCodeStore.getState().sendMessage('chat A prompt', [])

    useOpenCodeStore.getState().newChat()
    const chats = useOpenCodeStore.getState().chats
    const chatB = chats[0]
    expect(chatB.id).not.toBe('chat-fresh-a')
    expect(chatB.sessionId).toBeUndefined()
    expect(useOpenCodeStore.getState().isStreaming).toBe(false)

    await useOpenCodeStore.getState().sendMessage('chat B prompt', [])
    const last = seenBodies[seenBodies.length - 1] as Record<string, unknown>
    expect(last.sessionId == null || last.sessionId === '').toBe(true)
    expect(logMessages().some((m) => m.includes('[SESSION] REUSE'))).toBe(false)
  })

  it('newChat aborts in-flight generation and clears the controller', () => {
    useOpenCodeStore.setState({ isStreaming: true, abortController: new AbortController() })
    const before = useOpenCodeStore.getState().abortController
    expect(before).not.toBeNull()
    let aborted = false
    before?.signal.addEventListener('abort', () => {
      aborted = true
    })
    useOpenCodeStore.getState().newChat()
    expect(aborted).toBe(true)
    expect(useOpenCodeStore.getState().isStreaming).toBe(false)
    expect(useOpenCodeStore.getState().abortController).toBeNull()
  })
})
