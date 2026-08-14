import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { useHistory } from '../hooks'

const ACTOR_COLORS: Record<string, string> = {
  kernel: 'bg-slate-500',
  task: 'bg-blue-500',
  workflow: 'bg-violet-500',
  operation: 'bg-amber-500',
  sdk: 'bg-indigo-500',
  artifact: 'bg-emerald-500',
  runtime: 'bg-cyan-500',
  user: 'bg-rose-500',
  assistant: 'bg-rose-500',
}

export function WorkspaceHistoryPage() {
  const { data: events, isLoading } = useHistory()
  const list = [...(events ?? [])].reverse()

  return (
    <>
      <PageHeader />
      <Main>
        <div className='mb-4'>
          <h1 className='text-2xl font-bold tracking-tight'>Activity History</h1>
          <p className='text-sm text-muted-foreground'>
            Everything that happened in your workspace — every task, step and result.
          </p>
        </div>

        <Card>
          <CardContent className='py-0'>
            {isLoading && <p className='py-8 text-center text-sm text-muted-foreground'>Loading…</p>}
            {!isLoading && list.length === 0 && (
              <p className='py-8 text-center text-sm text-muted-foreground'>No events yet.</p>
            )}
            <ul className='divide-y'>
              {list.map((event) => (
                <li key={event.id}>
                  <Link
                    to='/workspace/history/$eventId'
                    params={{ eventId: event.id }}
                    className='flex items-start gap-3 py-3 transition-colors hover:bg-muted/50'
                  >
                    <span
                      className={`mt-1 inline-block size-2.5 shrink-0 rounded-full ${ACTOR_COLORS[event.actor] ?? 'bg-slate-400'}`}
                    />
                    <div className='min-w-0 flex-1'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <span className='font-mono text-xs font-medium'>{event.type}</span>
                        <span className='text-xs text-muted-foreground'>
                          {event.actor} · {event.target}
                        </span>
                        {event.durationMs != null && (
                          <span className='text-xs text-muted-foreground'>{event.durationMs}ms</span>
                        )}
                        <span className='ml-auto text-xs text-muted-foreground'>
                          {new Date(event.ts).toLocaleString()}
                        </span>
                      </div>
                      <pre className='mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground'>
                        {JSON.stringify(event.detail, null, 2)}
                      </pre>
                    </div>
                    <ArrowUpRight className='mt-1 size-4 shrink-0 text-muted-foreground' />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
