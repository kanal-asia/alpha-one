import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { useOperation } from '../hooks'

export function OperationDetailPage() {
  const { operationId } = useParams({ from: '/_authenticated/workspace/operations/$operationId' })
  const { data: op, isLoading } = useOperation(operationId)

  return (
    <>
      <PageHeader />
      <Main>
        <Link
          to='/workspace/operations'
          className='mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
        >
          <ArrowLeft className='size-4' /> Operations
        </Link>

        {isLoading && <p className='text-sm text-muted-foreground'>Loading…</p>}
        {op && (
          <>
            <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
              <div>
                <h1 className='text-2xl font-bold tracking-tight'>{op.name}</h1>
                <p className='text-sm text-muted-foreground'>
                  <span className='font-mono'>{op.id}</span> · v{op.version} · {op.domain}/{op.capability}
                </p>
              </div>
              <div className='flex flex-wrap items-center gap-2'>
                <Badge variant='outline'>SDK: {op.sdkOwner}</Badge>
                {op.permission && <Badge variant='secondary'>{op.permission}</Badge>}
                {op.timeoutMs && <Badge variant='secondary'>{op.timeoutMs}ms timeout</Badge>}
                {op.retryPolicy && <Badge variant='secondary'>{op.retryPolicy.attempts} attempts</Badge>}
                {op.tags?.map((tag) => (
                  <Badge key={tag} variant='outline'>
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>

            <Card className='mb-4'>
              <CardContent className='text-sm text-muted-foreground'>{op.description}</CardContent>
            </Card>

            <div className='grid gap-4 lg:grid-cols-2'>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Input schema</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className='overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground'>
                    {JSON.stringify(op.inputSchema ?? {}, null, 2)}
                  </pre>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Output schema</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className='overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground'>
                    {JSON.stringify(op.outputSchema ?? {}, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </div>

            <Card className='mt-4'>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium'>Artifact contract</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className='overflow-auto rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground'>
                  {JSON.stringify(op.artifactContract ?? {}, null, 2)}
                </pre>
              </CardContent>
            </Card>
          </>
        )}
      </Main>
    </>
  )
}
