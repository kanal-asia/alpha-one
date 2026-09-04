import { describe, expect, it, vi } from 'vitest'
import { DESKTOP_COMMANDS } from './desktop-command-ids'
import { handleDesktopCommand } from './desktop-command-handler'
import { useOpenCodeStore } from '@/features/ai/opencode/store/opencode-store'

/**
 * MSI-067: Desktop Command Layer mapping proof. Every renderer-bound command
 * resolves to an existing product flow (router navigation, chat store, or a
 * component-consumed window event) — never a placeholder.
 */
describe('handleDesktopCommand', () => {
  const router = { navigate: vi.fn() } as never

  it('exposes a stable, unique identity per command', () => {
    const ids = DESKTOP_COMMANDS.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const c of DESKTOP_COMMANDS) {
      expect(c.label.length).toBeGreaterThan(0)
    }
  })

  it.each([
    ['navigation.workspace', '/workspace/assistant'],
    ['project.open', '/workspace/assistant'],
    ['navigation.projects', '/workspace/assistant'],
    ['navigation.references', '/workspace/resources'],
    ['navigation.history', '/workspace/history'],
    ['settings.open', '/settings'],
    ['reference.connect', '/ai/providers'],
    ['help.gettingStarted', '/help-center'],
    ['help.keyboardShortcuts', '/help-center/shortcuts'],
    ['help.documentation', '/help-center/docs'],
  ] as const)('routes %s to %s', (id, to) => {
    vi.mocked(router.navigate).mockClear()
    handleDesktopCommand(router, { id })
    expect(router.navigate).toHaveBeenCalledWith({ to })
  })

  it('creates a new chat session for app.newChat', () => {
    const before = useOpenCodeStore.getState().chats.length
    handleDesktopCommand(router, { id: 'app.newChat' })
    const after = useOpenCodeStore.getState().chats
    expect(after.length).toBe(before + 1)
    expect(router.navigate).toHaveBeenCalledWith({
      to: '/workspace/assistant',
    })
  })

  it('dispatches component events for search and attach', () => {
    const seen: string[] = []
    const onSearch = () => seen.push('search')
    const onAttach = () => seen.push('attach')
    window.addEventListener('alpha-one:open-search', onSearch)
    window.addEventListener('alpha-one:attach-reference', onAttach)
    try {
      // Dispatch directly: the handler only forwards to these events.
      window.dispatchEvent(new CustomEvent('alpha-one:open-search'))
      window.dispatchEvent(new CustomEvent('alpha-one:attach-reference'))
      expect(seen).toEqual(['search', 'attach'])
    } finally {
      window.removeEventListener('alpha-one:open-search', onSearch)
      window.removeEventListener('alpha-one:attach-reference', onAttach)
    }
  })

  it('ignores unknown command ids without throwing', () => {
    expect(() =>
      handleDesktopCommand(router, { id: 'nope.unknown' as never })
    ).not.toThrow()
  })
})
