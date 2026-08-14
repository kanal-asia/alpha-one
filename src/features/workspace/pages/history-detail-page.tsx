import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { useHistoryEntry } from '../hooks'
import { toActivityViewItem } from './activity-mapper'

export function HistoryDetailPage() {
  const { eventId } = useParams({ from: '/_authenticated/workspace/history/$eventId' })
  const { data: entry, isLoading } = useHistoryEntry(eventId)

  const item = entry ? toActivityViewItem(entry) : null
  const Icon = item?.icon

  return (
    <>
      <PageHeader />
      <Main>
        <Link
          to='/workspace/history'
          className='mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
        >
          <ArrowLeft className='size-4' /> Activity
        </Link>

        {isLoading && <p className='text-sm text-muted-foreground'>Loading…</p>}
        {item && (
          <>
            <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
              <div className='flex items-center gap-3'>
                {Icon && (
                  <div className={`rounded-md bg-muted p-2 ${item.iconColor}`}>
                    <Icon className='size-5' />
                  </div>
                )}
                <div>
                  <h1 className='text-2xl font-bold tracking-tight'>{item.title}</h1>
                  <p className='text-sm text-muted-foreground'>{item.description}</p>
                </div>
              </div>
              <div className='flex items-center gap-2'>
                <Badge variant='secondary'>{item.category}</Badge>
                <Badge variant='outline'>{item.timestamp}</Badge>
              </div>
            </div>

            <Card>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium'>Details</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2 text-sm'>
                <DetailRow label='Source' value={item.source} />
                <DetailRow label='Actor' value={item.entry.actor} mono />
                <DetailRow label='Target' value={item.entry.target} mono />
                <DetailRow label='Event ID' value={item.entry.id} mono small />
                {item.entry.status && (
                  <DetailRow
                    label='Status'
                    value={
                      <Badge
                        variant={item.entry.status === 'completed' ? 'default' : 'destructive'}
                      >
                        {item.entry.status}
                      </Badge>
                    }
                  />
                )}
                {item.entry.durationMs != null && (
                  <DetailRow label='Duration' value={`${item.entry.durationMs}ms`} />
                )}
                {item.entry.workflowId && (
                  <DetailRow label='Task Template' value={item.entry.workflowId} mono />
                )}
                {item.entry.operationId && (
                  <DetailRow label='Process Step' value={item.entry.operationId} mono />
                )}
                {item.entry.artifactId && (
                  <DetailRow label='Result' value={item.entry.artifactId} mono />
                )}
                {item.entry.runtimeId && (
                  <DetailRow label='AI Engine' value={item.entry.runtimeId} mono />
                )}
                {item.entry.sdkId && (
                  <DetailRow label='Service' value={item.entry.sdkId} mono />
                )}
              </CardContent>
            </Card>
          </>
        )}
      </Main>
    </>
  )
}

function DetailRow({
  label,
  value,
  mono,
  small,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  small?: boolean
}) {
  return (
    <div className='flex items-center justify-between gap-2'>
      <span className='text-xs uppercase text-muted-foreground'>{label}</span>
      <span className={mono ? 'font-mono text-xs' : small ? 'text-xs' : 'text-sm'}>{value}</span>
    </div>
  )
}
