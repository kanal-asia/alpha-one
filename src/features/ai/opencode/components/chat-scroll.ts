import { useEffect, type RefObject } from 'react'

/**
 * MSI-066R1: scroll a Radix ScrollArea container to the bottom via its inner
 * viewport.
 *
 * The ref attached to `<ScrollArea>` points at the Radix **Root** (a plain
 * `relative` div with no scrollable overflow), so scrolling it is a no-op.
 * The actual scroll owner is the inner **Viewport**
 * (`[data-slot="scroll-area-viewport"]`). This helper resolves the viewport
 * and pins it to the bottom. Shared by every chat view so restore-to-bottom
 * cannot drift between pages again.
 */
export function scrollChatViewportToBottom(root: HTMLElement | null): void {
  if (!root) return
  const viewport =
    root.querySelector('[data-slot="scroll-area-viewport"]') ?? root
  viewport.scrollTo({ top: viewport.scrollHeight })
}

/**
 * Pin a chat message ScrollArea to the latest message whenever the message
 * list, streaming state, or selected chat changes (covers chat open/restore
 * and live follow). Runs only on content/selection changes — never on a
 * timer — so manual upward history reading is not fought.
 */
export function useChatScrollToBottom(
  scrollRef: RefObject<HTMLDivElement | null>,
  activeChatId: string | null,
  messages: readonly unknown[],
  isStreaming: boolean
): void {
  useEffect(() => {
    scrollChatViewportToBottom(scrollRef.current)
  }, [scrollRef, activeChatId, messages, isStreaming])
}
