/**
 * MSI-067: Desktop Command Layer — canonical command identities + metadata.
 *
 * This module is intentionally PURE (no DOM, no Electron, no router, no
 * store imports) so it can be imported by BOTH the Electron main bundle
 * (menu construction) and the renderer bundle (shortcut reference page).
 * It is the single source of truth for command id → label → accelerator,
 * preventing drift between menu, accelerators, and shortcut documentation.
 *
 * Canonical IDs follow `ELECTRON_MENU_ARCHITECTURE.md` §20.
 */

export type DesktopCommandId =
  | 'app.newChat'
  | 'app.exit'
  | 'project.open'
  | 'project.openLocalFolder'
  | 'reference.attach'
  | 'reference.connect'
  | 'navigation.back'
  | 'navigation.forward'
  | 'navigation.workspace'
  | 'navigation.projects'
  | 'navigation.references'
  | 'navigation.history'
  | 'navigation.search'
  | 'settings.open'
  | 'view.reload'
  | 'view.actualSize'
  | 'view.zoomIn'
  | 'view.zoomOut'
  | 'view.toggleFullScreen'
  | 'help.gettingStarted'
  | 'help.keyboardShortcuts'
  | 'help.documentation'
  | 'help.reportIssue'
  | 'help.viewLogs'
  | 'help.about'

export interface DesktopCommandMeta {
  id: DesktopCommandId
  label: string
  /** Electron accelerator (also shown in menu + shortcut reference). */
  accelerator?: string
}

/** Canonical menu/shortcut metadata. Renderer-executed commands navigate or
 *  act inside Alpha Workspace; main-executed commands use native behavior. */
export const DESKTOP_COMMANDS: DesktopCommandMeta[] = [
  { id: 'app.newChat', label: 'New Chat', accelerator: 'Ctrl+N' },
  { id: 'project.open', label: 'Open Project…' },
  { id: 'project.openLocalFolder', label: 'Open Local Folder…' },
  { id: 'reference.attach', label: 'Attach Reference…' },
  { id: 'reference.connect', label: 'Connect Reference…' },
  { id: 'settings.open', label: 'Settings', accelerator: 'Ctrl+,' },
  { id: 'app.exit', label: 'Exit Alpha One' },
  { id: 'navigation.back', label: 'Back', accelerator: 'Alt+Left' },
  { id: 'navigation.forward', label: 'Forward', accelerator: 'Alt+Right' },
  { id: 'navigation.workspace', label: 'Alpha Workspace', accelerator: 'Ctrl+1' },
  { id: 'navigation.projects', label: 'Projects', accelerator: 'Ctrl+2' },
  { id: 'navigation.references', label: 'References', accelerator: 'Ctrl+3' },
  { id: 'navigation.history', label: 'History', accelerator: 'Ctrl+4' },
  { id: 'navigation.search', label: 'Search' },
  { id: 'view.reload', label: 'Reload', accelerator: 'Ctrl+R' },
  { id: 'view.actualSize', label: 'Actual Size', accelerator: 'Ctrl+0' },
  { id: 'view.zoomIn', label: 'Zoom In', accelerator: 'Ctrl++' },
  { id: 'view.zoomOut', label: 'Zoom Out', accelerator: 'Ctrl+-' },
  { id: 'view.toggleFullScreen', label: 'Toggle Full Screen', accelerator: 'F11' },
  { id: 'help.gettingStarted', label: 'Getting Started' },
  { id: 'help.keyboardShortcuts', label: 'Keyboard Shortcuts' },
  { id: 'help.documentation', label: 'Documentation' },
  { id: 'help.reportIssue', label: 'Report an Issue' },
  { id: 'help.viewLogs', label: 'View Logs' },
  { id: 'help.about', label: 'About Alpha One' },
]

export function commandMeta(id: DesktopCommandId): DesktopCommandMeta {
  const found = DESKTOP_COMMANDS.find((c) => c.id === id)
  if (!found) throw new Error(`Unknown desktop command: ${id}`)
  return found
}
