import { Link, useParams } from '@tanstack/react-router'
import { ArrowLeft, ArrowUpRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Main } from '@/components/layout/main'
import { PageHeader } from '@/components/page-header'
import { useWorkflow } from '../hooks'

export function WorkflowDetailPage() {
  const { workflowId } = useParams({ from: '/_authenticated/workspace/workflows/$workflowId' })
  const { data: workflow, isLoading } = useWorkflow(workflowId)

  return (
    <>
      <PageHeader />
      <Main>
        <Link
          to='/workspace/workflows'
          className='mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
        >
          <ArrowLeft className='size-4' /> Workflow Catalog
        </Link>

        {isLoading && <p className='text-sm text-muted-foreground'>Loading…</p>}
        {workflow && (
          <>
            <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
              <div>
                <h1 className='text-2xl font-bold tracking-tight'>{workflow.name}</h1>
                <p className='text-sm text-muted-foreground'>
                  <span className='font-mono'>{workflow.id}</span> · v{workflow.version} · {workflow.category}
                </p>
              </div>
              <div className='flex items-center gap-2'>
                {workflow.tags.map((tag) => (
                  <Badge key={tag} variant='secondary'>
                    {tag}
                  </Badge>
                ))}
                <Badge variant={workflow.status === 'active' ? 'default' : 'outline'}>{workflow.status}</Badge>
              </div>
            </div>

            <Card className='mb-4'>
              <CardContent className='text-sm text-muted-foreground'>{workflow.description}</CardContent>
            </Card>

            <div className='grid gap-4 lg:grid-cols-2'>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Input contract</CardTitle>
                </CardHeader>
                <CardContent className='space-y-1 font-mono text-xs'>
                  <pre className='overflow-auto rounded-md bg-muted p-3 text-muted-foreground'>
                    {JSON.stringify(workflow.inputContract, null, 2)}
                  </pre>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Output contract</CardTitle>
                </CardHeader>
                <CardContent className='space-y-1 font-mono text-xs'>
                  <pre className='overflow-auto rounded-md bg-muted p-3 text-muted-foreground'>
                    {JSON.stringify(workflow.outputContract, null, 2)}
                  </pre>
                </CardContent>
              </Card>
            </div>

            <Card className='mt-4'>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium'>Steps ({workflow.steps.length})</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2'>
                {workflow.steps.map((step, index) => (
                  <div key={step.id} className='flex items-center justify-between rounded-md border p-3'>
                    <div className='flex items-center gap-3'>
                      <span className='flex size-6 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground'>
                        {index + 1}
                      </span>
                      <div>
                        <p className='text-sm font-medium'>{step.label}</p>
                        <p className='font-mono text-xs text-muted-foreground'>{step.operationId}</p>
                      </div>
                    </div>
                    <Link
                      to='/workspace/operations/$operationId'
                      params={{ operationId: step.operationId }}
                      className='inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground'
                    >
                      Operation <ArrowUpRight className='size-4' />
                    </Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </Main>
    </>
  )
}
