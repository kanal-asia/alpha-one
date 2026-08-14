import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Code2, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { useHistory } from '../hooks'
import { toActivityViewItem, categoryLabel, type ActivityViewItem } from './activity-mapper'

export function WorkspaceHistoryPage() {
  const { data: events, isLoading } = useHistory()
  const list = [...(events ?? [])].reverse()
  const items = list.map(toActivityViewItem)
  const [selectedItem, setSelectedItem] = useState<ActivityViewItem | null>(null)

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Activity</h1>
          <p className='text-sm text-muted-foreground'>
            Track meaningful actions and results across your Alpha One workspace.
          </p>
        </div>

        {isLoading && (
          <div className='py-12 text-center text-sm text-muted-foreground'>Loading…</div>
        )}

        {!isLoading && items.length === 0 && (
          <div className='py-12 text-center'>
            <Info className='mx-auto mb-3 size-8 text-muted-foreground/50' />
            <p className='text-sm text-muted-foreground'>
              Your workspace activity will appear here.
            </p>
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <div className='space-y-1'>
            {items.map((item) => (
              <ActivityRow key={item.id} item={item} onDetails={setSelectedItem} />
            ))}
          </div>
        )}
      </Main>

      <ActivityDetailSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
    </>
  )
}

function ActivityRow({
  item,
  onDetails,
}: {
  item: ActivityViewItem
  onDetails: (item: ActivityViewItem) => void
}) {
  const Icon = item.icon

  return (
    <div className='group flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-muted/50'>
      <Icon className={cn('mt-0.5 size-4 shrink-0', item.iconColor)} />
      <div className='min-w-0 flex-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-sm font-medium'>{item.title}</span>
          <Badge variant='secondary' className='text-[10px]'>
            {categoryLabel(item.category)}
          </Badge>
        </div>
        <p className='mt-0.5 truncate text-xs text-muted-foreground'>{item.description}</p>
        <div className='mt-1 flex items-center gap-2 text-xs text-muted-foreground'>
          <span>{item.timestamp}</span>
          <span className='text-border'>·</span>
          <span>{item.source}</span>
        </div>
      </div>
      <div className='flex shrink-0 items-center gap-1'>
        <Button
          variant='ghost'
          size='icon'
          className='size-7 opacity-0 transition-opacity group-hover:opacity-100'
          onClick={(e) => {
            e.preventDefault()
            onDetails(item)
          }}
        >
          <Code2 className='size-3.5' />
          <span className='sr-only'>View technical details</span>
        </Button>
        <Link
          to='/workspace/history/$eventId'
          params={{ eventId: item.id }}
          className='flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100'
        >
          <ArrowUpRight className='size-3.5' />
          <span className='sr-only'>Open detail page</span>
        </Link>
      </div>
    </div>
  )
}

function ActivityDetailSheet({
  item,
  onClose,
}: {
  item: ActivityViewItem | null
  onClose: () => void
}) {
  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className='flex flex-col overflow-hidden sm:max-w-lg'>
        {item && (
          <>
            <SheetHeader>
              <SheetTitle>{item.title}</SheetTitle>
              <SheetDescription>{item.description}</SheetDescription>
            </SheetHeader>

            <div className='flex-1 overflow-y-auto'>
              <div className='space-y-4 py-4'>
                <Section label='Time'>
                  <span className='text-sm'>{item.timestamp}</span>
                </Section>

                <Section label='Source'>
                  <Badge variant='outline'>{item.source}</Badge>
                </Section>

                <Section label='Actor'>
                  <span className='text-sm font-mono'>{item.entry.actor}</span>
                </Section>

                <Section label='Target'>
                  <span className='text-sm font-mono'>{item.entry.target}</span>
                </Section>

                <Section label='Event ID'>
                  <span className='text-xs font-mono text-muted-foreground'>{item.entry.id}</span>
                </Section>

                {item.entry.durationMs != null && (
                  <Section label='Duration'>
                    <span className='text-sm'>{item.entry.durationMs}ms</span>
                  </Section>
                )}

                {item.entry.status && (
                  <Section label='Status'>
                    <Badge
                      variant={item.entry.status === 'completed' ? 'default' : 'destructive'}
                    >
                      {item.entry.status}
                    </Badge>
                  </Section>
                )}

                <Section label='Technical Payload'>
                  <pre className='max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground'>
                    {JSON.stringify(item.entry.detail, null, 2)}
                  </pre>
                </Section>
              </div>
            </div>

            <SheetClose asChild>
              <Button variant='outline' className='mt-2'>
                Close
              </Button>
            </SheetClose>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='space-y-1'>
      <span className='text-xs uppercase text-muted-foreground'>{label}</span>
      <div>{children}</div>
    </div>
  )
}
