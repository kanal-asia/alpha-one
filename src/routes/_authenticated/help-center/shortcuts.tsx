import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '@/components/page-header'
import { Main } from '@/components/layout/main'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { DESKTOP_COMMANDS } from '@/lib/desktop-command-ids'

export const Route = createFileRoute('/_authenticated/help-center/shortcuts')({
  component: KeyboardShortcutsPage,
})

/**
 * MSI-067: canonical shortcut reference. Menu accelerators below are rendered
 * from the same DESKTOP_COMMANDS metadata used to build the Electron menu,
 * so menu labels, accelerators, and this documentation cannot drift apart.
 * Search (Ctrl+K) is an application shortcut without a menu accelerator by
 * design — the menu item opens the palette instead of toggling it.
 */
const EXTRA_SHORTCUTS = [
  { label: 'Search', accelerator: 'Ctrl+K' },
] as const

function KeyboardShortcutsPage() {
  const withAccelerators = DESKTOP_COMMANDS.filter((c) => c.accelerator)
  return (
    <>
      <PageHeader />
      <Main>
        <div className='mx-auto max-w-3xl space-y-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              Keyboard Shortcuts
            </h1>
            <p className='text-sm text-muted-foreground'>
              Every shortcut below matches the accelerator shown in the
              Electron menu for the same command.
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Commands</CardTitle>
              <CardDescription>
                Press the shortcut while Alpha One is focused.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='divide-y'>
                {withAccelerators.map((c) => (
                  <div
                    key={c.id}
                    className='flex items-center justify-between py-2'
                  >
                    <span className='text-sm'>{c.label}</span>
                    <kbd className='rounded border bg-muted px-2 py-0.5 font-mono text-xs'>
                      {c.accelerator}
                    </kbd>
                  </div>
                ))}
                {EXTRA_SHORTCUTS.map((c) => (
                  <div
                    key={c.label}
                    className='flex items-center justify-between py-2'
                  >
                    <span className='text-sm'>{c.label}</span>
                    <kbd className='rounded border bg-muted px-2 py-0.5 font-mono text-xs'>
                      {c.accelerator}
                    </kbd>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </Main>
    </>
  )
}
