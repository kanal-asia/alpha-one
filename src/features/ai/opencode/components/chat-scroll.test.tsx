import '@/styles/index.css'
import { useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { ScrollArea } from '@/components/ui/scroll-area'
import { DeveloperModeProvider } from '@/context/developer-mode-provider'
import { ChatMessageView } from './chat-message'
import {
  scrollChatViewportToBottom,
  useChatScrollToBottom,
} from './chat-scroll'
import type { ChatMessage } from '../types'

/** Read live layout metrics of the Radix viewport inside a container. */
function viewportMetrics(root: HTMLElement) {
  const viewport = root.querySelector(
    '[data-slot="scroll-area-viewport"]'
  ) as HTMLElement
  return {
    viewport,
    scrollTop: viewport.scrollTop,
    clientHeight: viewport.clientHeight,
    scrollHeight: viewport.scrollHeight,
  }
}

function bottomDelta(m: {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}) {
  return Math.abs(m.scrollHeight - m.clientHeight - m.scrollTop)
}

function scrollRoot(): HTMLElement {
  const root = document.querySelector(
    '[data-slot="scroll-area"]'
  ) as HTMLElement
  expect(root).not.toBeNull()
  return root
}

describe('scrollChatViewportToBottom', () => {
  it('pins a populated ScrollArea viewport to the bottom', async () => {
    await render(
      <ScrollArea style={{ height: 200 }}>
        <div style={{ height: 2000 }}>tall content</div>
      </ScrollArea>
    )

    const root = scrollRoot()
    const before = viewportMetrics(root)
    // Sanity: content actually overflows (guard against vacuous pass).
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight + 100)
    expect(before.scrollTop).toBe(0)

    scrollChatViewportToBottom(root)

    const after = viewportMetrics(root)
    expect(bottomDelta(after)).toBeLessThanOrEqual(2)
  })

  it('documents why scrolling the ScrollArea root is a no-op', async () => {
    await render(
      <ScrollArea style={{ height: 200 }}>
        <div style={{ height: 2000 }}>tall content</div>
      </ScrollArea>
    )

    const root = scrollRoot()
    // The root element itself has no scrollable overflow: scrolling it changes
    // nothing. This was the MSI-066 scroll bug mechanism.
    root.scrollTo({ top: root.scrollHeight })
    expect(root.scrollTop).toBe(0)
    expect(bottomDelta(viewportMetrics(root))).toBeGreaterThan(100)
  })

  it('restores bottom when the chat switches (hook)', async () => {
    const chatA = Array.from({ length: 30 }, (_, i) => `a-${i}`)
    const chatB = Array.from({ length: 40 }, (_, i) => `b-${i}`)

    function ChatList({
      chatId,
      lines,
      onSwitch,
    }: {
      chatId: string
      lines: string[]
      onSwitch: () => void
    }) {
      const scrollRef = useRef<HTMLDivElement>(null)
      useChatScrollToBottom(scrollRef, chatId, lines, false)
      return (
        <>
          <button type='button' onClick={onSwitch}>
            switch chat
          </button>
          <ScrollArea ref={scrollRef} style={{ height: 200 }}>
            {lines.map((l) => (
              <div key={l} style={{ height: 40 }}>
                {l}
              </div>
            ))}
          </ScrollArea>
        </>
      )
    }

    function Harness() {
      const [chatId, setChatId] = useState('a')
      const lines = chatId === 'a' ? chatA : chatB
      return (
        <ChatList
          chatId={chatId}
          lines={lines}
          onSwitch={() => setChatId(chatId === 'a' ? 'b' : 'a')}
        />
      )
    }

    const screen = await render(<Harness />)
    const root = scrollRoot()
    expect(bottomDelta(viewportMetrics(root))).toBeLessThanOrEqual(2)

    // Manually scroll up, then switch chats: restore must land on bottom.
    viewportMetrics(root).viewport.scrollTo({ top: 0 })
    expect(viewportMetrics(root).viewport.scrollTop).toBe(0)

    await userEvent.click(screen.getByRole('button', { name: /switch chat/i }))
    await expect
      .poll(() => bottomDelta(viewportMetrics(scrollRoot())), {
        timeout: 2000,
      })
      .toBeLessThanOrEqual(2)
  })
})

function userMessage(content: string): ChatMessage {
  return {
    id: 'msg-1',
    role: 'user',
    content,
    createdAt: new Date().toISOString(),
    status: 'done',
    executionState: 'completed',
  }
}

describe('CollapsibleUserContent', () => {
  const longContent = Array.from(
    { length: 120 },
    (_, i) =>
      `Line ${i + 1}: this is a long markdown-style task prompt line with enough words to wrap several times inside the chat bubble.`
  ).join('\n')

  it('collapses a long user message and expands/collapses on demand', async () => {
    const screen = await render(
      <DeveloperModeProvider>
        <ChatMessageView
          message={userMessage(longContent)}
          isLast={false}
          streaming={false}
          onRetry={() => {}}
          onEdit={() => {}}
          onContinue={() => {}}
        />
      </DeveloperModeProvider>
    )

    // Initially collapsed: Show more control exists.
    const showMore = screen.getByRole('button', { name: /show more/i })
    await expect.element(showMore).toBeVisible()

    // The collapsed body is height-bounded (far below full content height).
    const body = document.querySelector(
      '[style*="max-height"]'
    ) as HTMLElement | null
    expect(body).not.toBeNull()
    expect(body!.clientHeight).toBeLessThanOrEqual(200)
    expect(body!.scrollHeight).toBeGreaterThan(body!.clientHeight + 100)

    // Canonical content is present in the DOM even while collapsed.
    await expect
      .element(screen.getByText(/Line 120:/, { exact: false }))
      .toBeInTheDocument()

    await userEvent.click(showMore)

    const showLess = screen.getByRole('button', { name: /show less/i })
    await expect.element(showLess).toBeVisible()
    // Full content intact after expansion (first line reachable).
    await expect
      .element(screen.getByText(/Line 1:/, { exact: false }))
      .toBeInTheDocument()

    await userEvent.click(showLess)
    await expect
      .element(screen.getByRole('button', { name: /show more/i }))
      .toBeVisible()
  })

  it('leaves short user messages unchanged', async () => {
    const screen = await render(
      <DeveloperModeProvider>
        <ChatMessageView
          message={userMessage('Hello, world!')}
          isLast={false}
          streaming={false}
          onRetry={() => {}}
          onEdit={() => {}}
          onContinue={() => {}}
        />
      </DeveloperModeProvider>
    )

    await expect
      .element(screen.getByText('Hello, world!'))
      .toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/show more/i)
    expect(document.body.textContent).not.toMatch(/show less/i)
  })
})
