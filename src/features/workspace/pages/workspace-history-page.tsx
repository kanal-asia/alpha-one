import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { useHistory } from '../hooks'
import { toActivityViewItem, categoryLabel, type ActivityViewItem } from './activity-mapper'

export function WorkspaceHistoryPage() {
  const { data: events, isLoading } = useHistory()
  const list = [...(events ?? [])].reverse()
  const items = list.map(toActivityViewItem)

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
              <ActivityRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </Main>
    </>
  )
}

function ActivityRow({ item }: { item: ActivityViewItem }) {
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
      <Link
        to='/workspace/history/$eventId'
        params={{ eventId: item.id }}
        className='flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100'
      >
        <ArrowUpRight className='size-3.5' />
        <span className='sr-only'>View details</span>
      </Link>
    </div>
  )
}


