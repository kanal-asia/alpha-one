import type { AppRouter } from './app-router'
import { useOpenCodeStore } from '@/features/ai/opencode/store/opencode-store'
import type { DesktopCommandId } from './desktop-command-ids'

/**
 * MSI-067: renderer side of the Desktop Command Layer.
 *
 * Executes workspace-bound commands received from the Electron host
 * (`alpha-one:command` IPC). Every action reuses an existing product flow:
 * router navigation, the OpenCode chat store, or a window event consumed by
 * the owning component (search palette, reference picker). No duplicate
 * workspace/project/reference systems are created here.
 */

export interface DesktopCommandPayload {
  id: DesktopCommandId
  /** Folder path for `project.openLocalFolder` (chosen via native dialog). */
  path?: string
}

function basenameOf(p: string): string {
  const parts = p.split(/[/\\]+/).filter(Boolean)
  return parts[parts.length - 1] ?? p
}

export function handleDesktopCommand(
  router: AppRouter,
  cmd: DesktopCommandPayload
): void {
  switch (cmd.id) {
    case 'app.newChat': {
      // New session in the current workspace context, shown in the chat view.
      void router.navigate({ to: '/workspace/assistant' })
      useOpenCodeStore.getState().newChat()
      break
    }
    case 'project.open':
    case 'navigation.projects': {
      // Alpha Projects surface: the assistant toolbar hosts project
      // selection (no dedicated page exists; no new UI created for this).
      void router.navigate({ to: '/workspace/assistant' })
      break
    }
    case 'project.openLocalFolder': {
      if (!cmd.path) break
      void router.navigate({ to: '/workspace/assistant' })
      // Reuses the existing per-chat local-project context (same mechanism
      // as the in-app project picker for local folders).
      useOpenCodeStore.getState().setActiveChatProject({
        id: `local-${Date.now()}`,
        name: basenameOf(cmd.path),
        path: cmd.path,
        label: cmd.path,
        type: 'local',
      })
      break
    }
    case 'reference.attach': {
      // The composer owns the reference picker; poke it via event.
      window.dispatchEvent(new CustomEvent('alpha-one:attach-reference'))
      void router.navigate({ to: '/workspace/assistant' })
      break
    }
    case 'reference.connect': {
      void router.navigate({ to: '/ai/providers' })
      break
    }
    case 'navigation.workspace': {
      void router.navigate({ to: '/workspace/assistant' })
      break
    }
    case 'navigation.references': {
      void router.navigate({ to: '/workspace/resources' })
      break
    }
    case 'navigation.history': {
      void router.navigate({ to: '/workspace/history' })
      break
    }
    case 'navigation.search': {
      window.dispatchEvent(new CustomEvent('alpha-one:open-search'))
      break
    }
    case 'settings.open': {
      void router.navigate({ to: '/settings' })
      break
    }
    case 'help.gettingStarted': {
      void router.navigate({ to: '/help-center' })
      break
    }
    case 'help.keyboardShortcuts': {
      void router.navigate({ to: '/help-center/shortcuts' })
      break
    }
    case 'help.documentation': {
      void router.navigate({ to: '/help-center/docs' })
      break
    }
    default:
      break
  }
}

/** Subscribe once at bootstrap; no-op outside the Electron host. */
export function initDesktopCommandListener(router: AppRouter): void {
  try {
    window.electronAPI?.onDesktopCommand?.((cmd: DesktopCommandPayload) => {
      try {
        handleDesktopCommand(router, cmd)
      } catch {
        /* ignore malformed commands */
      }
    })
  } catch {
    /* non-Electron environment */
  }
}
