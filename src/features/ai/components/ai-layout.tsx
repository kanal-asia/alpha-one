import { type ReactNode } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { Library, Settings2, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PageHeader } from '@/components/page-header'
import { Separator } from '@/components/ui/separator'

const aiNav = [
  { title: 'OpenCode', to: '/ai/opencode', icon: Terminal },
  { title: 'OpenCode Settings', to: '/ai/opencode/settings', icon: Settings2 },
  { title: 'Prompt Library', to: '/ai/prompt-library', icon: Library },
]

type AILayoutProps = {
  children: ReactNode
  rightPanel?: ReactNode
}

export function AILayout({ children, rightPanel }: AILayoutProps) {
  const href = useLocation({ select: (location) => location.href })
  return (
    <>
      <PageHeader />
      <div className='flex'>
        <aside className='hidden w-56 shrink-0 border-e p-3 md:block'>
          <p className='px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
            AI
          </p>
          <nav className='flex flex-col gap-1'>
            {aiNav.map((item) => {
              const active = href.startsWith(item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                    active
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <item.icon className='size-4' />
                  {item.title}
                </Link>
              )
            })}
          </nav>
        </aside>
        <div className='flex flex-1 flex-col'>
          <Separator />
          <div className='flex'>
            <main className='min-w-0 flex-1 p-4'>{children}</main>
            {rightPanel && (
              <aside className='hidden w-80 shrink-0 overflow-y-auto border-s p-4 lg:block'>
                {rightPanel}
              </aside>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
