import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { useHistoryEntry } from '../hooks'

export function HistoryDetailPage() {
  const { eventId } = useParams({ from: '/_authenticated/workspace/history/$eventId' })
  const { data: entry, isLoading } = useHistoryEntry(eventId)

  return (
    <>
      <PageHeader />
      <Main>
        <Link
          to='/workspace/history'
          className='mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
        >
          <ArrowLeft className='size-4' /> History
        </Link>

        {isLoading && <p className='text-sm text-muted-foreground'>Loading…</p>}
        {entry && (
          <>
            <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
              <div>
                <h1 className='text-2xl font-bold tracking-tight'>{entry.type}</h1>
                <p className='text-sm text-muted-foreground'>
                  <span className='font-mono'>{entry.id}</span> · {entry.actor} · {entry.target}
                </p>
              </div>
              <Badge variant='outline'>{new Date(entry.ts).toLocaleString()}</Badge>
            </div>

            <div className='grid gap-4 lg:grid-cols-2'>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Derived</CardTitle>
                </CardHeader>
                <CardContent className='space-y-2 text-sm'>
                  <DetailRow label='Status' value={entry.status ?? '—'} />
                  <DetailRow label='Duration' value={entry.durationMs != null ? `${entry.durationMs} ms` : '—'} />
                  <DetailRow label='Task Template' value={entry.workflowId ?? '—'} mono />
                  <DetailRow label='Process Step' value={entry.operationId ?? '—'} mono />
                  <DetailRow label='Result' value={entry.artifactId ?? '—'} mono />
                  <DetailRow label='AI Engine' value={entry.runtimeId ?? '—'} mono />
                  <DetailRow label='Service' value={entry.sdkId ?? '—'} mono />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Detail payload</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className='overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground'>
                    {JSON.stringify(entry.detail, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </Main>
    </>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className='flex items-center justify-between gap-2'>
      <span className='text-xs uppercase text-muted-foreground'>{label}</span>
      <span className={mono ? 'font-mono text-xs' : 'text-sm'}>{value}</span>
    </div>
  )
}
